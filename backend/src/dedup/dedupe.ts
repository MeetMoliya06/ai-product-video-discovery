import { captionSimilarity } from './captionSim.js';
import { hamming, isInformativeHash } from './phash.js';
import { videoKey } from './ids.js';
import type { RawVideo } from '../types.js';

export interface Candidate extends RawVideo {
  key: string;
  phash?: string;
}

export interface DedupState {
  keys: Set<string>; // already accepted in this search
  kept: { phash?: string; caption: string; advertiser?: string }[];
}

export interface DedupOptions {
  seenKeys: Set<string>; // shown in earlier searches
  seenPhashes: string[];
  showSeen: boolean;
  phashDistance: number;
  captionSim: number;
}

export interface DedupResult {
  fresh: (Candidate & { previouslySeen: boolean })[];
  stats: { exact: number; near: number; seen: number };
}

export const newDedupState = (): DedupState => ({ keys: new Set(), kept: [] });

/**
 * Layers, in order: exact key → previously seen (earlier searches) → near-duplicate within this search
 * (thumbnail dHash close, or near-identical caption from the same advertiser). Mutates `state`.
 */
export function dedupe(candidates: Candidate[], state: DedupState, opts: DedupOptions): DedupResult {
  const fresh: DedupResult['fresh'] = [];
  const stats = { exact: 0, near: 0, seen: 0 };

  for (const c of candidates) {
    const key = c.key || videoKey(c);
    if (state.keys.has(key)) {
      stats.exact++;
      continue;
    }
    const seenBefore =
      opts.seenKeys.has(key) ||
      (isInformativeHash(c.phash) && opts.seenPhashes.some((p) => isInformativeHash(p) && hamming(p, c.phash!) <= Math.min(opts.phashDistance, 4)));
    if (seenBefore && !opts.showSeen) {
      stats.seen++;
      continue;
    }
    const near = state.kept.some(
      (k) =>
        (isInformativeHash(c.phash) && isInformativeHash(k.phash) && hamming(k.phash, c.phash) <= opts.phashDistance) ||
        (captionSimilarity(k.caption, c.caption) >= opts.captionSim &&
          (!c.advertiser || !k.advertiser || c.advertiser === k.advertiser)),
    );
    if (near) {
      stats.near++;
      continue;
    }
    state.keys.add(key);
    state.kept.push({ phash: c.phash, caption: c.caption, advertiser: c.advertiser });
    fresh.push({ ...c, key, previouslySeen: seenBefore });
  }
  return { fresh, stats };
}
