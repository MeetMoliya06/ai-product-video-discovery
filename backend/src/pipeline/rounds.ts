import type { Analysis, Platform } from '../types.js';

/**
 * Query plan per platform. Round 0 is the most specific; later rounds widen (alternate phrasing,
 * broader hashtags, bare product type) and are only used when dedup + scoring leave a shortfall.
 */
export function buildRounds(platform: Platform, a: Analysis, maxRounds: number): string[][] {
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  let rounds: string[][];
  if (platform === 'meta') {
    const q = uniq([...a.meta.queries, ...a.queries, a.productType]);
    rounds = q.map((x) => [x]);
  } else {
    const tags = uniq([...a.instagram.hashtags, ...a.hashtags, a.productType.replace(/\s+/g, '')]).map((t) => t.replace(/^#/, '').replace(/\s+/g, ''));
    rounds = [];
    for (let i = 0; i < tags.length; i += 2) rounds.push(tags.slice(i, i + 2));
  }
  if (!rounds.length) rounds = [[a.productType]];
  // if the plan is shorter than maxRounds, cycle through it again (the caller also passes a deeper page index)
  const out: string[][] = [];
  for (let i = 0; i < maxRounds; i++) out.push(rounds[i % rounds.length]);
  return out;
}
