import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { repo } from '../db.js';
import { subscribe } from '../events.js';
import { assertSafeUrl, UnsafeUrlError } from '../net/ssrfGuard.js';
import { enqueueSearch } from '../queue.js';
import { saveUpload } from '../uploads.js';
import { config } from '../config.js';

const body = z
  .object({
    query: z.string().trim().min(2).max(300).optional(),
    imageDataUrl: z.string().max(8_000_000).regex(/^data:image\/(png|jpe?g|webp|gif);base64,/).optional(),
    options: z.object({ tiktok: z.boolean().default(false), showSeen: z.boolean().default(false) }).default({}),
  })
  .refine((b) => b.query || b.imageDataUrl, { message: 'Provide a product name, a product link, or an image' });

const isUrl = (s: string) => /^https?:\/\//i.test(s);

export async function searchRoutes(app: FastifyInstance) {
  app.post('/api/search', { bodyLimit: 10_000_000, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', message: parsed.error.issues.map((i) => i.message).join('; ') });
    const { query, imageDataUrl, options } = parsed.data;
    if (options.tiktok && !config.ENABLE_TIKTOK) return reply.code(400).send({ error: 'tiktok_disabled', message: 'TikTok is not enabled on this server (set ENABLE_TIKTOK=true).' });

    const id = randomUUID();
    let inputType: 'keyword' | 'url' | 'image' = 'keyword';
    if (query && isUrl(query)) {
      try {
        await assertSafeUrl(query); // fail fast with a clear 400 before queueing
      } catch (e) {
        if (e instanceof UnsafeUrlError) return reply.code(400).send({ error: 'unsafe_url', message: e.message });
        throw e;
      }
      inputType = 'url';
    }
    if (imageDataUrl) {
      saveUpload(id, Buffer.from(imageDataUrl.split(',')[1], 'base64'));
      if (inputType === 'keyword') inputType = query ? 'keyword' : 'image';
    }
    repo.createSearch(id, inputType, query ?? '(uploaded image)', options);
    await enqueueSearch(id);
    return reply.code(202).send({ searchId: id });
  });

  app.get<{ Params: { id: string } }>('/api/search/:id', async (req, reply) => {
    const row = repo.getSearch(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Search not found' });
    return {
      id: row.id,
      inputType: row.input_type,
      input: row.input_text,
      status: row.status,
      error: row.error,
      options: JSON.parse(row.options),
      product: row.product ? JSON.parse(row.product) : null,
      analysis: row.analysis ? JSON.parse(row.analysis) : null,
      sources: row.sources ? JSON.parse(row.sources) : [],
      results: repo.results(row.id),
      createdAt: row.created_at,
      finishedAt: row.finished_at,
      thresholds: { match: config.MATCH_THRESHOLD, weak: config.WEAK_THRESHOLD },
      sourceMode: config.SOURCE_MODE,
    };
  });

  // Server-Sent Events: replays buffered progress, then streams live.
  app.get<{ Params: { id: string } }>('/api/search/:id/events', (req, reply) => {
    const row = repo.getSearch(req.params.id);
    if (!row) return reply.code(404).send({ error: 'not_found', message: 'Search not found' });
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': config.CORS_ORIGIN,
    });
    const send = (e: object) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    if (row.status === 'done' || row.status === 'failed') {
      // already finished: the client only needs the terminal event, then loads results via GET /api/search/:id
      send(row.status === 'done' ? { type: 'done', at: Date.now() } : { type: 'error', message: row.error ?? 'Search failed', at: Date.now() });
      return res.end();
    }
    const unsub = subscribe(row.id, send);
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      unsub();
    });
  });

  app.get('/api/history', async () =>
    repo.history().map((h) => ({
      id: h.id,
      inputType: h.input_type,
      input: h.input_text,
      status: h.status,
      createdAt: h.created_at,
      total: h.total,
      productTitle: h.product ? JSON.parse(h.product).title : null,
      productImage: h.product ? JSON.parse(h.product).imageUrl ?? null : null,
      sources: h.sources ? JSON.parse(h.sources) : [],
    })),
  );
}
