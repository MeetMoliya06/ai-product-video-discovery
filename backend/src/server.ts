import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { activeProvider, visionAvailable, visionModelName } from './brain/vision.js';
import { logger } from './logger.js';
import { startWorker } from './queue.js';
import { miscRoutes } from './routes/misc.js';
import { searchRoutes } from './routes/search.js';

const app = Fastify({ loggerInstance: logger, bodyLimit: 1_000_000 });
await app.register(cors, { origin: config.CORS_ORIGIN });
await app.register(rateLimit, { global: false });

app.setErrorHandler((err: any, _req, reply) => {
  if (err instanceof ZodError) return reply.code(400).send({ error: 'invalid_input', message: err.issues.map((i) => i.message).join('; ') });
  const status = (err as any).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  reply.code(status).send({ error: status >= 500 ? 'internal_error' : 'request_error', message: status >= 500 ? 'Something went wrong' : err.message });
});

await app.register(searchRoutes);
await app.register(miscRoutes);

startWorker();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
if (config.SOURCE_MODE === 'fixtures') logger.warn('SOURCE_MODE=fixtures: serving synthetic videos. Set SOURCE_MODE=live and APIFY_TOKEN for real data.');
if (!visionAvailable()) logger.warn('No vision provider configured (GEMINI_API_KEY / OLLAMA_URL / ANTHROPIC_API_KEY): using heuristic text-only scoring, not visual matching.');
else logger.info({ provider: activeProvider(), model: visionModelName() }, 'vision provider ready');
