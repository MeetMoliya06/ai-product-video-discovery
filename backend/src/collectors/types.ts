import type { Platform, RawVideo } from '../types.js';

export interface CollectRequest {
  terms: string[]; // hashtags (instagram/tiktok) or keyword phrases (meta) for this round
  limit: number;
  round: number; // 0-based; collectors use it to page deeper
}

export interface SourceCollector {
  platform: Platform;
  collect(req: CollectRequest): Promise<RawVideo[]>;
}
