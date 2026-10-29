import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import type { Analysis, Product, ResultVideo, SourceReport } from './types.js';

mkdirSync(dirname(config.DB_PATH), { recursive: true });
export const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  input_type TEXT NOT NULL,
  input_text TEXT NOT NULL,
  options TEXT NOT NULL,
  status TEXT NOT NULL,
  product TEXT,
  analysis TEXT,
  sources TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS videos (
  key TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_video_id TEXT NOT NULL,
  url TEXT NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  advertiser TEXT,
  posted_at TEXT,
  phash TEXT
);
CREATE TABLE IF NOT EXISTS search_results (
  search_id TEXT NOT NULL,
  video_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  rank INTEGER NOT NULL,
  previously_seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (search_id, video_key)
);
CREATE INDEX IF NOT EXISTS idx_results_video ON search_results(video_key);
CREATE TABLE IF NOT EXISTS shortlist (
  video_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
`);

export interface SearchRow {
  id: string;
  input_type: 'keyword' | 'url' | 'image';
  input_text: string;
  options: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  product: string | null;
  analysis: string | null;
  sources: string | null;
  error: string | null;
  created_at: number;
  finished_at: number | null;
}

export const repo = {
  createSearch(id: string, inputType: SearchRow['input_type'], inputText: string, options: object) {
    db.prepare(
      `INSERT INTO searches (id,input_type,input_text,options,status,created_at) VALUES (?,?,?,?, 'queued', ?)`,
    ).run(id, inputType, inputText, JSON.stringify(options), Date.now());
  },
  getSearch(id: string): SearchRow | undefined {
    return db.prepare(`SELECT * FROM searches WHERE id=?`).get(id) as SearchRow | undefined;
  },
  setStatus(id: string, status: SearchRow['status'], error?: string) {
    db.prepare(`UPDATE searches SET status=?, error=?, finished_at=? WHERE id=?`).run(
      status,
      error ?? null,
      status === 'done' || status === 'failed' ? Date.now() : null,
      id,
    );
  },
  saveProduct(id: string, product: Product, analysis: Analysis) {
    const { imageBase64: _omit, ...publicProduct } = product;
    db.prepare(`UPDATE searches SET product=?, analysis=? WHERE id=?`).run(
      JSON.stringify(publicProduct),
      JSON.stringify(analysis),
      id,
    );
  },
  saveSources(id: string, sources: SourceReport[]) {
    db.prepare(`UPDATE searches SET sources=? WHERE id=?`).run(JSON.stringify(sources), id);
  },

  upsertVideo(v: ResultVideo, phash?: string) {
    db.prepare(
      `INSERT INTO videos (key,platform,platform_video_id,url,video_url,thumbnail_url,caption,advertiser,posted_at,phash)
       VALUES (@key,@platform,@platformVideoId,@url,@videoUrl,@thumbnailUrl,@caption,@advertiser,@postedAt,@phash)
       ON CONFLICT(key) DO UPDATE SET thumbnail_url=excluded.thumbnail_url, video_url=excluded.video_url,
         caption=excluded.caption, phash=COALESCE(excluded.phash, videos.phash)`,
    ).run({
      key: v.key,
      platform: v.platform,
      platformVideoId: v.platformVideoId,
      url: v.url,
      videoUrl: v.videoUrl ?? null,
      thumbnailUrl: v.thumbnailUrl,
      caption: v.caption,
      advertiser: v.advertiser ?? null,
      postedAt: v.postedAt ?? null,
      phash: phash ?? null,
    });
  },
  saveResults(searchId: string, results: ResultVideo[]) {
    const ins = db.prepare(
      `INSERT OR REPLACE INTO search_results (search_id,video_key,score,reason,status,rank,previously_seen)
       VALUES (?,?,?,?,?,?,?)`,
    );
    const tx = db.transaction((rows: ResultVideo[]) => {
      rows.forEach((r, i) => ins.run(searchId, r.key, r.score, r.reason, r.status, i, r.previouslySeen ? 1 : 0));
    });
    tx(results);
  },

  /** How many earlier searches used the same input; repeat searches page deeper into each source. */
  priorSearchCount(inputText: string, exceptSearchId: string): number {
    const r = db.prepare(`SELECT COUNT(*) AS n FROM searches WHERE input_text=? AND id!=? AND status='done'`).get(inputText, exceptSearchId) as { n: number };
    return r.n;
  },

  /** Keys of videos shown to the user in any search other than `exceptSearchId`. */
  seenKeys(exceptSearchId: string): Set<string> {
    const rows = db
      .prepare(`SELECT DISTINCT video_key FROM search_results WHERE search_id != ?`)
      .all(exceptSearchId) as { video_key: string }[];
    return new Set(rows.map((r) => r.video_key));
  },
  /** Perceptual hashes of previously shown videos, for cross-search near-duplicate checks. */
  seenPhashes(exceptSearchId: string): string[] {
    const rows = db
      .prepare(
        `SELECT DISTINCT v.phash FROM videos v JOIN search_results r ON r.video_key=v.key
         WHERE r.search_id != ? AND v.phash IS NOT NULL`,
      )
      .all(exceptSearchId) as { phash: string }[];
    return rows.map((r) => r.phash);
  },

  results(searchId: string): ResultVideo[] {
    const rows = db
      .prepare(
        `SELECT v.*, r.score, r.reason, r.status, r.previously_seen, r.rank,
                EXISTS(SELECT 1 FROM shortlist s WHERE s.video_key=v.key) AS shortlisted
         FROM search_results r JOIN videos v ON v.key=r.video_key
         WHERE r.search_id=? ORDER BY r.rank`,
      )
      .all(searchId) as any[];
    return rows.map(mapVideo);
  },
  history(limit = 50) {
    return db
      .prepare(
        `SELECT s.id, s.input_type, s.input_text, s.status, s.created_at, s.product, s.sources,
           (SELECT COUNT(*) FROM search_results r WHERE r.search_id=s.id) AS total
         FROM searches s ORDER BY s.created_at DESC LIMIT ?`,
      )
      .all(limit) as any[];
  },

  shortlist(): ResultVideo[] {
    const rows = db
      .prepare(
        `SELECT v.*, 0 AS score, '' AS reason, 'match' AS status, 0 AS previously_seen, 1 AS shortlisted,
           COALESCE((SELECT r.score FROM search_results r WHERE r.video_key=v.key ORDER BY r.rowid DESC LIMIT 1),0) AS score2,
           COALESCE((SELECT r.reason FROM search_results r WHERE r.video_key=v.key ORDER BY r.rowid DESC LIMIT 1),'') AS reason2
         FROM shortlist s JOIN videos v ON v.key=s.video_key ORDER BY s.created_at DESC`,
      )
      .all() as any[];
    return rows.map((r) => mapVideo({ ...r, score: r.score2, reason: r.reason2 }));
  },
  addShortlist(key: string) {
    db.prepare(`INSERT OR IGNORE INTO shortlist (video_key, created_at) VALUES (?,?)`).run(key, Date.now());
  },
  removeShortlist(key: string) {
    db.prepare(`DELETE FROM shortlist WHERE video_key=?`).run(key);
  },
};

function mapVideo(r: any): ResultVideo {
  return {
    key: r.key,
    platform: r.platform,
    platformVideoId: r.platform_video_id,
    url: r.url,
    videoUrl: r.video_url ?? undefined,
    thumbnailUrl: r.thumbnail_url ?? '',
    caption: r.caption ?? '',
    advertiser: r.advertiser ?? undefined,
    postedAt: r.posted_at ?? undefined,
    score: r.score,
    reason: r.reason ?? '',
    status: r.status,
    previouslySeen: !!r.previously_seen,
    shortlisted: !!r.shortlisted,
  };
}
