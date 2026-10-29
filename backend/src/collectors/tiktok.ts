import { config } from '../config.js';
import type { RawVideo } from '../types.js';
import { runActor } from './apify.js';
import type { CollectRequest, SourceCollector } from './types.js';

/** Optional bonus source. Runs only when the user toggles it on; failures never affect required sources. */
export const tiktokCollector: SourceCollector = {
  platform: 'tiktok',
  async collect({ terms, limit }: CollectRequest): Promise<RawVideo[]> {
    const items = await runActor(config.APIFY_TIKTOK_ACTOR, {
      hashtags: terms.map((t) => t.replace(/^#/, '')),
      resultsPerPage: limit,
      shouldDownloadVideos: false,
    });
    const out: RawVideo[] = [];
    for (const it of items) {
      const thumb = it.videoMeta?.coverUrl ?? it.covers?.[0];
      if (!it.id || !thumb) continue;
      out.push({
        platform: 'tiktok',
        platformVideoId: String(it.id),
        url: it.webVideoUrl ?? `https://www.tiktok.com/@${it.authorMeta?.name ?? 'user'}/video/${it.id}`,
        thumbnailUrl: thumb,
        caption: String(it.text ?? ''),
        advertiser: it.authorMeta?.name,
        postedAt: it.createTimeISO,
      });
    }
    return out;
  },
};
