import { config } from '../config.js';
import type { Platform } from '../types.js';
import { fixtureCollector } from './fixtures.js';
import { instagramCollector } from './instagram.js';
import { metaAdsCollector } from './metaAds.js';
import { tiktokCollector } from './tiktok.js';
import type { SourceCollector } from './types.js';

export function getCollector(platform: Platform): SourceCollector {
  if (config.SOURCE_MODE === 'fixtures') return fixtureCollector(platform);
  return { instagram: instagramCollector, meta: metaAdsCollector, tiktok: tiktokCollector }[platform];
}
