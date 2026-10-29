import { config } from '../config.js';
import type { RawVideo } from '../types.js';
import { runActor } from './apify.js';
import type { CollectRequest, SourceCollector } from './types.js';

/** startDate arrives as epoch seconds (number or numeric string) or an ISO string; never throw on bad data. */
export function toIso(v: unknown): string | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  const d = new Date(Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const libraryUrl = (q: string) =>
  `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${config.META_ADS_COUNTRY}&media_type=video&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;

/**
 * Meta Ad Library video ads. The official Ad Library API only exposes political/issue ads (and all ads
 * in the EU/UK) and returns an ad_snapshot_url rather than media, so commercial product ads are collected
 * via a provider scraping the public library, restricted to media_type=video.
 */
export const metaAdsCollector: SourceCollector = {
  platform: 'meta',
  async collect({ terms, limit }: CollectRequest): Promise<RawVideo[]> {
    const items = await runActor(config.APIFY_META_ACTOR, {
      startUrls: terms.map((t) => ({ url: libraryUrl(t) })),
      resultsLimit: limit,
      activeStatus: 'active',
    });
    const out: RawVideo[] = [];
    for (const ad of items) {
      const snap = ad.snapshot ?? ad;
      const video = snap.videos?.[0] ?? ad.videos?.[0] ?? snap.cards?.find((c: any) => c.video_hd_url || c.video_sd_url);
      const videoUrl = video?.video_hd_url ?? video?.video_sd_url ?? video?.videoHdUrl ?? video?.videoSdUrl;
      const thumb = video?.video_preview_image_url ?? video?.videoPreviewImageUrl ?? video?.original_image_url;
      const id = ad.adArchiveID ?? ad.ad_archive_id ?? ad.adArchiveId;
      if (!videoUrl || !thumb || !id) continue; // video ads only
      const start = ad.startDate ?? ad.start_date;
      out.push({
        platform: 'meta',
        platformVideoId: String(id),
        url: ad.adLibraryUrl ?? `https://www.facebook.com/ads/library/?id=${id}`,
        videoUrl,
        thumbnailUrl: thumb,
        caption: String(snap.body?.text ?? snap.body ?? snap.title ?? ''),
        advertiser: snap.pageName ?? snap.page_name ?? ad.pageName,
        postedAt: toIso(start),
      });
    }
    return out;
  },
};
