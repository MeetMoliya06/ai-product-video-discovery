export type Platform = 'instagram' | 'meta' | 'tiktok';

export interface Video {
  key: string;
  platform: Platform;
  url: string;
  videoUrl?: string;
  thumbnailUrl: string;
  caption: string;
  advertiser?: string;
  postedAt?: string;
  score: number;
  reason: string;
  status: 'match' | 'weak';
  previouslySeen: boolean;
  shortlisted?: boolean;
}

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
  state: 'pending' | 'running' | 'ok' | 'partial' | 'blocked' | 'failed' | 'disabled';
  notes: string[];
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
  queries: string[];
  hashtags: string[];
  engine: 'vision' | 'text' | 'heuristic';
}

export interface SearchDetail {
  id: string;
  inputType: 'keyword' | 'url' | 'image';
  input: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  product: { title: string; description: string; imageUrl?: string; sourceUrl?: string } | null;
  analysis: Analysis | null;
  sources: SourceReport[];
  results: Video[];
  thresholds: { match: number; weak: number };
  sourceMode: 'live' | 'fixtures';
}

export interface HistoryItem {
  id: string;
  inputType: string;
  input: string;
  status: string;
  createdAt: number;
  total: number;
  productTitle: string | null;
  productImage?: string | null;
  sources: SourceReport[];
}

export interface ProgressEvent {
  type: 'step' | 'source' | 'done' | 'error';
  step?: string;
  label?: string;
  report?: SourceReport;
  message?: string;
}

export interface Health {
  ok: boolean;
  redis: boolean;
  sourceMode: 'live' | 'fixtures';
  vision: boolean;
  tiktok: boolean;
}
