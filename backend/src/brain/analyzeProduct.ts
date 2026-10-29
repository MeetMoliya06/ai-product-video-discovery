import { cached } from '../cache.js';
import { config } from '../config.js';
import { ANALYZE_SYSTEM } from './prompts.js';
import { askJson, visionAvailable, visionModelName } from './vision.js';
import type { Analysis, Product } from '../types.js';

const STOP = new Set(['the', 'a', 'an', 'and', 'for', 'with', 'of', 'in', 'on', 'to', 'by', 'new', 'buy']);

export function keywordsOf(text: string): string[] {
  return [...new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}

/** No-model fallback so the app still works offline / without keys (labelled as 'heuristic' in the UI). */
export function heuristicAnalysis(p: Product): Analysis {
  const words = keywordsOf(`${p.title} ${p.description}`).slice(0, 8);
  const phrase = words.slice(0, 4).join(' ') || p.title;
  const tags = words.slice(0, 6);
  return {
    productType: phrase,
    colors: [],
    prints: 'unknown',
    logos: [],
    textOnProduct: [],
    material: 'unknown',
    shape: 'unknown',
    summary: p.title,
    queries: [p.title, phrase, ...words.slice(0, 3)].filter(Boolean),
    hashtags: [...new Set([phrase.replace(/\s+/g, ''), ...tags])],
    instagram: { hashtags: [...new Set([phrase.replace(/\s+/g, ''), ...tags])] },
    meta: { queries: [p.title, phrase] },
    engine: 'heuristic',
  };
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const tag = (s: string) => s.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase();

export async function analyzeProduct(p: Product): Promise<{ analysis: Analysis; cacheHit: boolean }> {
  if (!visionAvailable()) return { analysis: heuristicAnalysis(p), cacheHit: false };

  const key = `analysis:v3:${visionModelName()}:${p.imageHash ?? 'noimg'}:${(p.title + p.description).slice(0, 200)}`;
  const { value, hit } = await cached(key, config.CACHE_TTL_S, async () => {
    const parts: Parameters<typeof askJson>[1] = [];
    if (p.imageBase64) parts.push('Reference product image:', { base64: p.imageBase64, mediaType: 'image/jpeg' });
    const site = p.sourceUrl ? `\nSource website: ${new URL(p.sourceUrl).hostname.replace(/^www\./, '')} (use the brand name in hashtags and metaQueries when it is clearly the brand)` : '';
    parts.push(`Title: ${p.title || '(none)'}\nDescription: ${p.description || '(none)'}${site}`);
    const raw = await askJson<any>(ANALYZE_SYSTEM, parts, 1100);
    const hashtags = arr(raw.hashtags).map(tag).filter(Boolean);
    const queries = arr(raw.queries);
    const a: Analysis = {
      productType: String(raw.productType ?? p.title),
      colors: arr(raw.colors),
      prints: String(raw.prints ?? 'unknown'),
      logos: arr(raw.logos),
      textOnProduct: arr(raw.textOnProduct),
      material: String(raw.material ?? 'unknown'),
      shape: String(raw.shape ?? 'unknown'),
      summary: String(raw.summary ?? p.title),
      queries: queries.length ? queries : [p.title],
      hashtags,
      instagram: { hashtags },
      meta: { queries: arr(raw.metaQueries).length ? arr(raw.metaQueries) : queries },
      engine: p.imageBase64 ? 'vision' : 'text',
    };
    if (a.engine === 'text') {
      // No photo: the model can only guess visual details. Keep only attributes the user's own text supports,
      // otherwise scoring penalises videos for details nobody asked for.
      const given = `${p.title} ${p.description}`.toLowerCase();
      const stated = (v: string) => v.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 2 && given.includes(w));
      a.colors = a.colors.filter(stated);
      if (!stated(a.prints)) a.prints = 'unknown';
      if (!stated(a.material)) a.material = 'unknown';
      if (!stated(a.shape)) a.shape = 'unknown';
      a.logos = [];
      a.textOnProduct = [];
    }
    const vague = (t: string) => !t || /^unknown$/i.test(t.trim());
    if (vague(a.productType)) a.productType = (p.title || a.queries[0] || 'product').trim();
    if (!a.summary || /insufficient|cannot|unable|not enough/i.test(a.summary)) a.summary = `Videos showing: ${a.productType}`;
    return a;
  });
  return { analysis: value, cacheHit: hit };
}
