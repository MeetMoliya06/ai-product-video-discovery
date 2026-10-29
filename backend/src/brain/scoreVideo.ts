import { config } from '../config.js';
import { safeFetch } from '../net/ssrfGuard.js';
import { keywordsOf } from './analyzeProduct.js';
import { SCORE_BATCH_SYSTEM, SCORE_BATCH_TEXT_SYSTEM } from './prompts.js';
import { askJson, visionAvailable, type Part } from './vision.js';
import type { Analysis, Product, Score } from '../types.js';
import sharp from 'sharp';

/** Fetch a thumbnail (https or data: URI) and return a bounded JPEG buffer. */
export async function fetchThumbnail(url: string): Promise<Buffer> {
  let raw: Buffer;
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);
    const data = url.slice(comma + 1);
    raw = meta.includes(';base64') ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data));
  } else {
    raw = (await safeFetch(url, { maxBytes: 6_000_000, timeoutMs: 12_000 })).body;
  }
  return sharp(raw).resize(512, 512, { fit: 'inside' }).flatten({ background: '#fff' }).jpeg({ quality: 78 }).toBuffer();
}

/** Blend the model's visual verdict with a small caption-overlap signal. Pure; unit tested. */
export function finalScore(visual: number, captionOverlap: number, sameProduct: boolean): number {
  let s = visual * 0.9 + captionOverlap * 10; // caption can add at most 10 points
  if (!sameProduct) s = Math.min(s, 59); // a model that says "different product" can never reach match territory
  return Math.max(0, Math.min(100, Math.round(s)));
}

export function captionOverlap(caption: string, analysis: Analysis): number {
  const terms = keywordsOf([analysis.productType, analysis.prints, ...analysis.colors, ...analysis.textOnProduct].join(' '));
  if (!terms.length) return 0;
  const text = caption.toLowerCase(); // substring match so '#oversizedgraphictee' still hits 'oversized' and 'graphic'
  return terms.filter((t) => text.includes(t)).length / terms.length;
}

export interface ScoreInput {
  caption: string;
  thumbnail?: Buffer;
}

function heuristicScore(overlap: number, hasThumb: boolean): Score {
  // Text only, so it never claims visual certainty (capped at 85). No term hit at all = clearly unrelated.
  const s = overlap === 0 ? 10 : Math.round(Math.min(85, 40 + overlap * 50));
  return {
    score: s,
    sameProduct: s >= config.MATCH_THRESHOLD,
    engine: 'heuristic',
    reason: hasThumb
      ? `Heuristic (no vision model): ${Math.round(overlap * 100)}% of product terms appear in the caption`
      : `Heuristic: thumbnail unavailable, caption overlap ${Math.round(overlap * 100)}%`,
  };
}

/**
 * Score a batch of videos with one model call (keeps free-tier request counts low). Videos without a thumbnail,
 * or whose entry the model omits, fall back to the heuristic. Results are returned in input order.
 */
export async function scoreVideos(product: Product, analysis: Analysis, videos: ScoreInput[]): Promise<Score[]> {
  const overlaps = videos.map((v) => captionOverlap(v.caption, analysis));
  if (!visionAvailable()) return videos.map((v, i) => heuristicScore(overlaps[i], !!v.thumbnail));

  const withThumb = videos.map((v, i) => ({ v, i })).filter((x) => x.v.thumbnail);
  const out: Score[] = videos.map((v, i) => heuristicScore(overlaps[i], !!v.thumbnail));
  if (!withThumb.length) return out;

  const parts: Part[] = [];
  if (product.imageBase64) parts.push('REFERENCE product image:', { base64: product.imageBase64, mediaType: 'image/jpeg' });
  else parts.push(`PRODUCT DESCRIPTION: ${product.title || analysis.summary}. Type: ${analysis.productType}. Colours: ${analysis.colors.filter((c) => c !== 'unknown').join(', ') || 'not specified'}. Print/graphics: ${analysis.prints}. Shape: ${analysis.shape}. Material: ${analysis.material}.`);
  withThumb.forEach(({ v }, n) => {
    parts.push(`Thumbnail ${n + 1} (caption hint: ${v.caption.replace(/\s+/g, ' ').slice(0, 160)}):`, { base64: v.thumbnail!.toString('base64'), mediaType: 'image/jpeg' });
  });

  const r = await askJson<{ results: { i: number; score: number; sameProduct: boolean; reason: string }[] }>(product.imageBase64 ? SCORE_BATCH_SYSTEM : SCORE_BATCH_TEXT_SYSTEM, parts, 160 * withThumb.length + 100);
  for (const e of r.results ?? []) {
    const target = withThumb[Number(e.i) - 1];
    if (!target) continue;
    const visual = Math.max(0, Math.min(100, Number(e.score) || 0));
    out[target.i] = {
      score: finalScore(visual, overlaps[target.i], !!e.sameProduct),
      sameProduct: !!e.sameProduct,
      reason: String(e.reason ?? '').slice(0, 200) || 'No reason given',
      engine: 'vision',
    };
  }
  return out;
}
