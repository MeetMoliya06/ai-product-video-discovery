import { createHash } from 'node:crypto';
import type { Platform, RawVideo } from '../types.js';
import type { CollectRequest, SourceCollector } from './types.js';

/**
 * Deterministic offline source for demos and tests (SOURCE_MODE=fixtures). Generates a pool of synthetic
 * videos per platform with SVG thumbnails, including deliberate reposts, duplicate ads and off-topic items so the
 * dedup and scoring paths get exercised. Different search terms page into different slices of the pool.
 */
const POOL = 8000;

const hash = (s: string) => parseInt(createHash('md5').update(s).digest('hex').slice(0, 8), 16);

function svg(seed: number, label: string): string {
  const hue = seed % 360;
  // high-contrast random blocks so unrelated fixtures get clearly different perceptual hashes
  const shapes = Array.from({ length: 14 }, (_, i) => {
    const r = hash(`${seed}:${i}`);
    const w = 40 + (r % 140);
    const h = 40 + ((r >> 6) % 160);
    return `<rect x="${(r >> 3) % 260}" y="${(r >> 11) % 360}" width="${w}" height="${h}" fill="${i % 2 ? '#fff' : '#000'}" opacity="${0.55 + (i % 3) * 0.15}" transform="rotate(${r % 90} 150 200)"/>`;
  }).join('');
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="hsl(${hue} 60% 45%)"/>${shapes}<text x="150" y="385" font-size="18" fill="#fff" stroke="#000" stroke-width=".6" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
}

function make(platform: Platform, idx: number, terms: string[]): RawVideo {
  const topic = terms[idx % terms.length] ?? 'product';
  // every 7th item is a repost of the previous one (new id, same thumbnail + caption); every 5th is off-topic
  const repostOf = idx % 7 === 6;
  const base = repostOf ? idx - 1 : idx;
  const offTopic = base % 5 === 4;
  const id = `${platform}_${idx}`;
  const A = ['Honestly obsessed with', 'Wore this all week:', 'Finally got my hands on', 'Unboxing', 'Styling', 'Review of', 'Day in my life with', 'Why everyone is talking about'];
  const B = ['the fit is unreal', 'quality is better than expected', 'sizing tips inside', 'perfect for summer', 'link in bio for 15% off', 'cop before it sells out', 'three ways to wear it', 'worth every penny'];
  const C = ['Tokyo', 'my roommate', 'a rainy Monday', 'the gym', 'brunch', 'a road trip', 'my sister', 'the office'];
  const r = hash(`cap:${platform}:${base}`);
  const caption = offTopic
    ? `Weekend vlog – ${C[r % 8]}, coffee and a long walk by the river, nothing to do with shopping ${r % 997}`
    : `${A[r % 8]} ${topic} with ${C[(r >> 4) % 8]}. ${B[(r >> 8) % 8]} (#${r % 9973}) #${topic.replace(/\s+/g, '')}`;
  return {
    platform,
    platformVideoId: id,
    url: platform === 'instagram' ? `https://www.instagram.com/reel/${id}/` : `https://www.facebook.com/ads/library/?id=${id}`,
    thumbnailUrl: svg(base * 31 + (platform === 'meta' ? 7 : 0), offTopic ? 'off-topic' : topic.slice(0, 22)),
    caption,
    advertiser: `${platform}_creator_${base % 97}`,
    postedAt: new Date(Date.now() - base * 36e5 * 5).toISOString(),
  };
}

export const fixtureCollector = (platform: Platform): SourceCollector => ({
  platform,
  async collect({ terms, limit, round }: CollectRequest): Promise<RawVideo[]> {
    await new Promise((r) => setTimeout(r, 400));
    const offset = hash(terms.join('|') + platform) % 4000;
    return Array.from({ length: limit }, (_, i) => make(platform, (offset + round * limit + i) % POOL, terms));
  },
});
