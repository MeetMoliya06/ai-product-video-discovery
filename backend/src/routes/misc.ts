import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { repo } from '../db.js';
import { redis } from '../cache.js';
import { fetchThumbnail } from '../brain/scoreVideo.js';
import { activeProvider, visionAvailable } from '../brain/vision.js';
import { UnsafeUrlError } from '../net/ssrfGuard.js';

const csv = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

export async function miscRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({
    ok: true,
    redis: (await redis.ping().catch(() => null)) === 'PONG',
    sourceMode: config.SOURCE_MODE,
    vision: visionAvailable(),
    visionProvider: activeProvider(),
    tiktok: config.ENABLE_TIKTOK,
  }));

  // Thumbnail proxy: Instagram/Meta CDN URLs reject hotlinking and expire; proxy through the SSRF-guarded fetcher.
  app.get('/api/thumb', async (req, reply) => {
    const { url } = z.object({ url: z.string().min(8) }).parse(req.query);
    try {
      const jpeg = await fetchThumbnail(url);
      return reply.header('cache-control', 'public, max-age=3600').type('image/jpeg').send(jpeg);
    } catch (e) {
      if (e instanceof UnsafeUrlError) return reply.code(400).send({ error: 'unsafe_url', message: e.message });
      return reply.code(502).send({ error: 'thumbnail_unavailable', message: 'Thumbnail could not be loaded' });
    }
  });

  app.get('/api/shortlist', async () => repo.shortlist());
  app.put<{ Params: { key: string } }>('/api/shortlist/:key', async (req) => {
    repo.addShortlist(decodeURIComponent(req.params.key));
    return { ok: true };
  });
  app.delete<{ Params: { key: string } }>('/api/shortlist/:key', async (req) => {
    repo.removeShortlist(decodeURIComponent(req.params.key));
    return { ok: true };
  });
  app.get('/api/shortlist/export.csv', async (_req, reply) => {
    const rows = repo.shortlist();
    const lines = ['platform,url,score,advertiser,caption,reason', ...rows.map((r) => [r.platform, r.url, r.score, r.advertiser, r.caption, r.reason].map(csv).join(','))];
    return reply.header('content-disposition', 'attachment; filename="shortlist.csv"').type('text/csv').send(lines.join('\n'));
  });
}
