import { analyzeProduct } from '../brain/analyzeProduct.js';
import { cached } from '../cache.js';
import { config } from '../config.js';
import { repo, type SearchRow } from '../db.js';
import { emit } from '../events.js';
import { logger } from '../logger.js';
import { productFromImageBuffer, resolveProductUrl } from '../resolver/productResolver.js';
import type { Platform, Product, SourceReport } from '../types.js';
import { collectSource } from './collectSource.js';
import { readUpload } from '../uploads.js';

export interface SearchOptions {
  tiktok: boolean;
  showSeen: boolean;
}

async function resolveProduct(row: SearchRow): Promise<Product> {
  if (row.input_type === 'url') {
    const { value } = await cached(`product:${row.input_text}`, config.CACHE_TTL_S, () => resolveProductUrl(row.input_text));
    return value;
  }
  const upload = readUpload(row.id);
  if (upload) return productFromImageBuffer(upload, row.input_text);
  return { title: row.input_text, description: '' };
}

/** One full search. Runs inside the queue worker; progress is streamed through the event bus. */
export async function runSearch(searchId: string): Promise<void> {
  const row = repo.getSearch(searchId);
  if (!row) throw new Error(`Search ${searchId} not found`);
  const options = JSON.parse(row.options) as SearchOptions;
  const log = logger.child({ searchId });
  repo.setStatus(searchId, 'running');

  try {
    emit(searchId, { type: 'step', step: 'resolve', label: row.input_type === 'url' ? 'Fetching product page' : 'Preparing product' });
    const product = await resolveProduct(row);

    emit(searchId, { type: 'step', step: 'analyse', label: 'Analysing product image' });
    const { analysis, cacheHit } = await analyzeProduct(product);
    repo.saveProduct(searchId, product, analysis);
    log.info({ engine: analysis.engine, cacheHit }, 'product analysed');
    emit(searchId, { type: 'step', step: 'analysed', label: cacheHit ? 'Product analysis (cached)' : 'Product analysed' });

    const platforms: Platform[] = ['instagram', 'meta', ...(options.tiktok ? (['tiktok'] as const) : [])];
    emit(searchId, { type: 'step', step: 'collect', label: `Searching ${platforms.map((p) => ({ instagram: 'Instagram', meta: 'Meta Ad Library', tiktok: 'TikTok' })[p]).join(', ')} in parallel` });

    const seenKeys = repo.seenKeys(searchId);
    const seenPhashes = repo.seenPhashes(searchId);
    const pageOffset = Math.min(repo.priorSearchCount(row.input_text, searchId), 8);
    const outcomes = await Promise.all(
      platforms.map((platform) =>
        collectSource({ searchId, platform, product, analysis, seenKeys, seenPhashes, showSeen: options.showSeen, pageOffset }).catch((err) => {
          // collectSource shouldn't throw, but a bug in one source must still not sink the search
          log.error({ platform, err: String(err) }, 'source crashed');
          const report: SourceReport = { platform, target: config.TARGET_PER_SOURCE, matches: 0, weak: 0, fetched: 0, duplicatesRemoved: 0, seenRemoved: 0, discarded: 0, rounds: 0, state: 'failed', notes: [String(err)] };
          return { report, videos: [] };
        }),
      ),
    );

    emit(searchId, { type: 'step', step: 'save', label: 'Saving results' });
    const all = outcomes.flatMap((o) => o.videos);
    for (const v of all) repo.upsertVideo(v, v.phash);
    repo.saveResults(searchId, all);
    repo.saveSources(searchId, outcomes.map((o) => o.report));
    repo.setStatus(searchId, 'done');
    log.info({ counts: outcomes.map((o) => [o.report.platform, o.report.matches, o.report.weak]) }, 'search done');
    emit(searchId, { type: 'done' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message }, 'search failed');
    repo.setStatus(searchId, 'failed', message);
    emit(searchId, { type: 'error', message });
  }
}
