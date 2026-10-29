import { fetchThumbnail, scoreVideos } from '../brain/scoreVideo.js';
import { getCollector } from '../collectors/index.js';
import { config } from '../config.js';
import { dedupe, newDedupState, type Candidate } from '../dedup/dedupe.js';
import { videoKey } from '../dedup/ids.js';
import { dHash } from '../dedup/phash.js';
import { emit } from '../events.js';
import { logger } from '../logger.js';
import { FatalSourceError, mapLimit, withRetry, withTimeout } from '../net/resilience.js';
import type { Analysis, Platform, Product, ResultVideo, SourceReport } from '../types.js';
import { buildRounds } from './rounds.js';

export interface SourceContext {
  searchId: string;
  platform: Platform;
  product: Product;
  analysis: Analysis;
  seenKeys: Set<string>;
  seenPhashes: string[];
  showSeen: boolean;
  pageOffset: number; // repeat searches start deeper in the source's result pages
}

export interface SourceOutcome {
  report: SourceReport;
  videos: (ResultVideo & { phash?: string })[];
}

const bandOf = (score: number) => (score >= config.MATCH_THRESHOLD ? 'match' : score >= config.WEAK_THRESHOLD ? 'weak' : 'discard');

/**
 * Collect → dedup → score loop for one platform. Keeps widening the query (up to MAX_ROUNDS) until it has
 * TARGET strong matches. Never throws: failures are recorded on the report so other sources are unaffected.
 */
export async function collectSource(ctx: SourceContext): Promise<SourceOutcome> {
  const { platform, analysis, product } = ctx;
  const target = config.TARGET_PER_SOURCE;
  const report: SourceReport = {
    platform, target, matches: 0, weak: 0, fetched: 0, duplicatesRemoved: 0, seenRemoved: 0, discarded: 0, rounds: 0, state: 'running', notes: [],
  };
  const matches: (ResultVideo & { phash?: string })[] = [];
  const weak: (ResultVideo & { phash?: string })[] = [];
  const state = newDedupState();
  const collector = getCollector(platform);
  // Repeat searches of the same input rotate to the next hashtag/query groups: the sources can't be paged by offset,
  // so re-using the first query set would just return the same videos again (and the seen-filter would drop them).
  const rounds = buildRounds(platform, analysis, config.MAX_ROUNDS * (ctx.pageOffset + 1)).slice(ctx.pageOffset * config.MAX_ROUNDS);
  let failures = 0;
  const push = () => emit(ctx.searchId, { type: 'source', report: { ...report, notes: [...report.notes] } });

  push();
  for (let round = 0; round < rounds.length && matches.length < target; round++) {
    report.rounds = round + 1;
    let raw;
    try {
      raw = await withRetry(
        () => withTimeout(collector.collect({ terms: rounds[round], limit: config.CANDIDATES_PER_ROUND, round: ctx.pageOffset * config.MAX_ROUNDS + round }), config.SOURCE_TIMEOUT_MS, `${platform} fetch`),
        { retries: 2 },
      );
    } catch (err) {
      failures++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ searchId: ctx.searchId, platform, round, err: msg }, 'collector failed');
      report.notes.push(`Round ${round + 1} failed: ${msg}`);
      if (err instanceof FatalSourceError) {
        report.state = err.kind;
        break; // retrying with other terms won't fix auth/quota/blocks
      }
      if (failures >= 2) break;
      continue;
    }
    report.fetched += raw.length;
    if (!raw.length) {
      report.notes.push(`Round ${round + 1} ("${rounds[round].join(', ')}") returned no videos`);
      continue;
    }

    // thumbnails: downloaded once, used for both perceptual hashing and visual scoring
    const thumbs = new Map<string, Buffer>();
    const candidates: Candidate[] = await mapLimit(raw, 8, async (r) => {
      const key = videoKey(r);
      let phash: string | undefined;
      try {
        const buf = await fetchThumbnail(r.thumbnailUrl);
        thumbs.set(key, buf);
        phash = await dHash(buf);
      } catch {
        /* thumbnail unavailable: dedupe falls back to id + caption */
      }
      return { ...r, key, phash };
    });

    const { fresh, stats } = dedupe(candidates, state, {
      seenKeys: ctx.seenKeys,
      seenPhashes: ctx.seenPhashes,
      showSeen: ctx.showSeen,
      phashDistance: config.PHASH_DISTANCE,
      captionSim: config.CAPTION_SIM,
    });
    report.duplicatesRemoved += stats.exact + stats.near;
    report.seenRemoved += stats.seen;

    // only score as many as we still need (×2 headroom) to bound model cost
    const need = Math.max(target - matches.length, 5);
    const toScore = fresh.slice(0, need * 3);
    const batches: (typeof toScore)[] = [];
    for (let i = 0; i < toScore.length; i += config.VISION_BATCH) batches.push(toScore.slice(i, i + config.VISION_BATCH));
    const scoredBatches = await mapLimit(batches, config.SCORE_CONCURRENCY, async (batch) => {
      try {
        const scores = await scoreVideos(product, analysis, batch.map((c) => ({ caption: c.caption, thumbnail: thumbs.get(c.key) })));
        return batch.map((c, i) => ({ c, s: scores[i] }));
      } catch (err) {
        logger.warn({ searchId: ctx.searchId, platform, err: String(err) }, 'batch scoring failed');
        if (err instanceof FatalSourceError) report.notes.push(`Scoring unavailable: ${err.message}`);
        return [];
      }
    });
    const scored = scoredBatches.flat();
    for (const item of scored) {
      if (!item) continue;
      const band = bandOf(item.s.score);
      if (band === 'discard') {
        report.discarded++;
        continue;
      }
      const { phash, ...rest } = item.c;
      const v = { ...rest, phash, score: item.s.score, reason: item.s.reason, status: band as 'match' | 'weak' };
      (band === 'match' ? matches : weak).push(v);
    }
    report.matches = matches.length;
    report.weak = weak.length;
    push();
  }

  matches.sort((a, b) => b.score - a.score);
  weak.sort((a, b) => b.score - a.score);
  // If strong matches fall short, top up with clearly-marked weak matches rather than returning nothing.
  const videos = [...matches, ...weak.slice(0, Math.max(0, target - matches.length))].slice(0, Math.max(target, matches.length));
  report.matches = matches.length;
  report.weak = videos.length - Math.min(matches.length, videos.length);

  if (report.state === 'running') {
    if (matches.length >= target) report.state = 'ok';
    else if (videos.length || failures) report.state = 'partial';
    else report.state = failures ? 'failed' : 'partial';
  }
  if (matches.length < target) {
    report.notes.push(
      `Only ${matches.length}/${target} strong matches after ${report.rounds} query round(s) (${report.fetched} fetched, ${report.duplicatesRemoved} duplicates, ${report.seenRemoved} already seen, ${report.discarded} below threshold). ` +
        (report.weak ? `${report.weak} weak matches added and marked.` : 'No weak matches available.'),
    );
  }
  emit(ctx.searchId, { type: 'source', report: { ...report, notes: [...report.notes] } });
  return { report, videos };
}
