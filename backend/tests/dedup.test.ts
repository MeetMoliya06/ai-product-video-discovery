import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { captionSimilarity } from '../src/dedup/captionSim.js';
import { dedupe, newDedupState, type Candidate } from '../src/dedup/dedupe.js';
import { normalizeMediaUrl, videoKey } from '../src/dedup/ids.js';
import { dHash, hamming } from '../src/dedup/phash.js';

const opts = { seenKeys: new Set<string>(), seenPhashes: [] as string[], showSeen: false, phashDistance: 8, captionSim: 0.85 };
const cand = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  platform: 'instagram', platformVideoId: id, key: `instagram:${id}`, url: `https://x/${id}`, thumbnailUrl: 'https://x/t.jpg',
  caption: `unique caption number ${id} about a totally different thing ${id}${id}`, ...over,
});

describe('ids', () => {
  it('uses the platform id when present', () => expect(videoKey(cand('abc'))).toBe('instagram:abc'));
  it('falls back to a stable hash of the media URL ignoring CDN signatures', () => {
    const a = videoKey({ platform: 'meta', platformVideoId: '', url: '', thumbnailUrl: '', videoUrl: 'https://cdn.x/v.mp4?oh=1&oe=2&id=7' });
    const b = videoKey({ platform: 'meta', platformVideoId: '', url: '', thumbnailUrl: '', videoUrl: 'https://cdn.x/v.mp4?oe=9&oh=5&id=7' });
    expect(a).toBe(b);
    expect(normalizeMediaUrl('https://a.com/x?utm_source=1&id=2#f')).toBe('a.com/x?id=2');
  });
});

describe('captionSimilarity', () => {
  it('treats reposts with different hashtags/links as near-identical', () => {
    const a = 'Honestly obsessed with this oversized skull tee, the print is unreal #tee https://a.co/1';
    const b = 'honestly obsessed with this oversized skull tee, the print is unreal!! #fashion https://b.co/2';
    expect(captionSimilarity(a, b)).toBeGreaterThan(0.85);
  });
  it('keeps different captions apart and ignores very short ones', () => {
    expect(captionSimilarity('Weekend vlog by the river with coffee and friends', 'Unboxing the new protein dark chocolate bar flavours')).toBeLessThan(0.4);
    expect(captionSimilarity('wow', 'nice')).toBe(0);
  });
});

describe('perceptual hash', () => {
  const img = (color: string, size = 200) => sharp({ create: { width: size, height: size, channels: 3, background: color } }).composite([{ input: Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 3}" cy="${size / 2}" r="${size / 4}" fill="white"/></svg>`) }]).jpeg().toBuffer();
  it('is stable under rescaling and different otherwise', async () => {
    const a = await dHash(await img('#223', 200));
    const b = await dHash(await img('#223', 400));
    const c = await dHash(await sharp({ create: { width: 200, height: 200, channels: 3, background: '#fff' } }).composite([{ input: Buffer.from('<svg width="200" height="200"><rect x="100" width="100" height="200" fill="black"/></svg>') }]).png().toBuffer());
    expect(hamming(a, b)).toBeLessThanOrEqual(4);
    expect(hamming(a, c)).toBeGreaterThan(10);
  });
});

describe('dedupe ignores uninformative hashes', () => {
  it('does not treat black/blank thumbnails (all-zero hash) as duplicates of each other or of earlier searches', () => {
    const blank = '0000000000000000';
    const r = dedupe([cand('a', { phash: blank }), cand('b', { phash: blank })], newDedupState(), { ...opts, seenPhashes: [blank] });
    expect(r.fresh).toHaveLength(2);
    expect(r.stats.seen + r.stats.near).toBe(0);
  });
});

describe('dedupe', () => {
  it('removes exact duplicates within a result set', () => {
    const r = dedupe([cand('a'), cand('a'), cand('b')], newDedupState(), opts);
    expect(r.fresh.map((f) => f.key)).toEqual(['instagram:a', 'instagram:b']);
    expect(r.stats.exact).toBe(1);
  });
  it('removes re-uploads with a different id but the same thumbnail', () => {
    const r = dedupe([cand('a', { phash: '00ff00ff00ff00ff' }), cand('b', { phash: '00ff00ff00ff00fe' })], newDedupState(), opts);
    expect(r.fresh).toHaveLength(1);
    expect(r.stats.near).toBe(1);
  });
  it('removes the same ad running under several ids (same advertiser + caption)', () => {
    const caption = 'Get 20% off our protein dark chocolate bars this week only, free shipping on all orders';
    const r = dedupe([cand('a', { caption, advertiser: 'Brand' }), cand('b', { caption, advertiser: 'Brand' })], newDedupState(), opts);
    expect(r.fresh).toHaveLength(1);
  });
  it('filters videos from earlier searches unless showSeen is on, and flags them when shown', () => {
    const seen = { ...opts, seenKeys: new Set(['instagram:a']) };
    expect(dedupe([cand('a'), cand('b')], newDedupState(), seen).fresh.map((f) => f.key)).toEqual(['instagram:b']);
    const shown = dedupe([cand('a'), cand('b')], newDedupState(), { ...seen, showSeen: true }).fresh;
    expect(shown.find((f) => f.key === 'instagram:a')?.previouslySeen).toBe(true);
  });
  it('dedupes across rounds when state is shared', () => {
    const state = newDedupState();
    dedupe([cand('a')], state, opts);
    expect(dedupe([cand('a'), cand('c')], state, opts).fresh.map((f) => f.key)).toEqual(['instagram:c']);
  });
});
