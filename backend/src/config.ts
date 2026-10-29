import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  PORT: z.coerce.number().default(8080),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  DB_PATH: z.string().default('./data/app.db'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // fixtures = deterministic fake sources (no keys needed); live = Apify
  SOURCE_MODE: z.enum(['live', 'fixtures']).default('fixtures'),
  APIFY_TOKEN: z.string().optional(),
  APIFY_IG_ACTOR: z.string().default('apify~instagram-hashtag-scraper'),
  APIFY_META_ACTOR: z.string().default('apify~facebook-ads-scraper'),
  APIFY_TIKTOK_ACTOR: z.string().default('clockworks~tiktok-hashtag-scraper'),
  META_ADS_COUNTRY: z.string().default('US'),
  ENABLE_TIKTOK: bool,

  // Vision provider: auto picks the first configured of gemini (free tier) > ollama (local, free) > anthropic.
  VISION_PROVIDER: z.enum(['auto', 'gemini', 'ollama', 'anthropic', 'none']).default('auto'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
  OLLAMA_URL: z.string().optional(), // e.g. http://localhost:11434
  OLLAMA_MODEL: z.string().default('qwen2.5vl:7b'),
  ANTHROPIC_API_KEY: z.string().optional(),
  VISION_MODEL: z.string().default('claude-haiku-5-5'), // anthropic model
  VISION_RPM: z.coerce.number().default(15), // client-side cap on model calls per minute (free tiers are low)
  VISION_BATCH: z.coerce.number().default(8), // thumbnails judged per model call

  // pipeline tuning
  TARGET_PER_SOURCE: z.coerce.number().default(20),
  MATCH_THRESHOLD: z.coerce.number().default(60), // >= shown as a match
  WEAK_THRESHOLD: z.coerce.number().default(40), // >= weak (marked), below discarded
  MAX_ROUNDS: z.coerce.number().default(4),
  CANDIDATES_PER_ROUND: z.coerce.number().default(40),
  SCORE_CONCURRENCY: z.coerce.number().default(4),
  SOURCE_TIMEOUT_MS: z.coerce.number().default(150_000),
  PHASH_DISTANCE: z.coerce.number().default(8),
  CAPTION_SIM: z.coerce.number().default(0.85),
  CACHE_TTL_S: z.coerce.number().default(86_400),
  ALLOW_PRIVATE_URLS: bool, // tests / local dev only
});

export const config = schema.parse(process.env);
export type Config = typeof config;
