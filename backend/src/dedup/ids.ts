import { createHash } from 'node:crypto';
import type { RawVideo } from '../types.js';

const TRACKING = /^(utm_|fbclid|igshid|igsh|_nc_|oh$|oe$|se$|sp$|sig|ccb|_gl)/i;

/** Strip volatile query params (CDN signatures, tracking) so the same media hashes the same way. */
export function normalizeMediaUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    u.hash = '';
    return `${u.hostname}${u.pathname}${u.search}`;
  } catch {
    return raw;
  }
}

/** Stable identity: platform video id when present, else hash of the normalized media URL. */
export function videoKey(v: Pick<RawVideo, 'platform' | 'platformVideoId' | 'videoUrl' | 'url' | 'thumbnailUrl'>): string {
  if (v.platformVideoId) return `${v.platform}:${v.platformVideoId}`;
  const basis = normalizeMediaUrl(v.videoUrl || v.url || v.thumbnailUrl);
  return `${v.platform}:h_${createHash('sha1').update(basis).digest('hex').slice(0, 16)}`;
}
