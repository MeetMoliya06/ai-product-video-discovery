import { config } from '../config.js';
import type { RawVideo } from '../types.js';
import { runActor } from './apify.js';
import type { CollectRequest, SourceCollector } from './types.js';

/**
 * Instagram Reels via an Apify hashtag scraper (no public IG search API exists).
 * Output field names are mapped defensively because actor schemas drift; unusable rows are dropped.
 */
export const instagramCollector: SourceCollector = {
  platform: 'instagram',
  async collect({ terms, limit }: CollectRequest): Promise<RawVideo[]> {
    const items = await runActor(config.APIFY_IG_ACTOR, {
      hashtags: terms.map((t) => t.replace(/^#/, '')),
      resultsType: 'reels',
      resultsLimit: limit,
    });
    const out: RawVideo[] = [];
    for (const it of items) {
      const isVideo = it.videoUrl || it.type === 'Video' || it.productType === 'clips';
      const id = it.shortCode ?? it.id;
      const thumb = it.displayUrl ?? it.thumbnailUrl;
      if (!isVideo || !id || !thumb) continue;
      out.push({
        platform: 'instagram',
        platformVideoId: String(id),
        url: it.url ?? `https://www.instagram.com/reel/${id}/`,
        videoUrl: it.videoUrl,
        thumbnailUrl: thumb,
        caption: String(it.caption ?? ''),
        advertiser: it.ownerUsername,
        postedAt: it.timestamp && !Number.isNaN(Date.parse(it.timestamp)) ? new Date(it.timestamp).toISOString() : undefined,
      });
    }
    return out;
  },
};
