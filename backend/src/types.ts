export type Platform = 'instagram' | 'meta' | 'tiktok';
export const PLATFORMS: Platform[] = ['instagram', 'meta', 'tiktok'];

export interface RawVideo {
  platform: Platform;
  platformVideoId: string;
  url: string; // permalink / ad link
  videoUrl?: string;
  thumbnailUrl: string;
  caption: string;
  advertiser?: string;
  postedAt?: string; // ISO
}

export interface Product {
  title: string;
  description: string;
  imageUrl?: string;
  imageBase64?: string; // normalized jpeg, kept out of API responses
  imageHash?: string;
  sourceUrl?: string;
}

export interface Analysis {
  productType: string;
  colors: string[];
  prints: string;
  logos: string[];
  textOnProduct: string[];
  material: string;
  shape: string;
  summary: string;
  queries: string[]; // general search phrases, best first
  hashtags: string[]; // without '#'
  instagram: { hashtags: string[] };
  meta: { queries: string[] };
  engine: 'vision' | 'text' | 'heuristic';
}

export interface Score {
  score: number;
  reason: string;
  sameProduct: boolean;
  engine: 'vision' | 'heuristic';
}

export type ResultStatus = 'match' | 'weak';

export interface ResultVideo extends RawVideo {
  key: string;
  score: number;
  reason: string;
  status: ResultStatus;
  previouslySeen: boolean;
  shortlisted?: boolean;
}

export type SourceState = 'pending' | 'running' | 'ok' | 'partial' | 'blocked' | 'failed' | 'disabled';

export interface SourceReport {
  platform: Platform;
  target: number;
  matches: number;
  weak: number;
  fetched: number;
  duplicatesRemoved: number;
  seenRemoved: number;
  discarded: number;
  rounds: number;
  state: SourceState;
  notes: string[];
}

export interface ProgressEvent {
  type: 'step' | 'source' | 'done' | 'error';
  step?: string;
  label?: string;
  report?: SourceReport;
  message?: string;
  at: number;
}
