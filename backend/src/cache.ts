import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

export const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
redis.on('error', (e: Error) => logger.warn({ err: e.message }, 'redis error'));

/** JSON cache; failures degrade to a cache miss rather than failing the search. */
export async function cached<T>(key: string, ttlS: number, produce: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  try {
    const hit = await redis.get(key);
    if (hit) return { value: JSON.parse(hit) as T, hit: true };
  } catch {
    /* fall through */
  }
  const value = await produce();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlS);
  } catch {
    /* ignore */
  }
  return { value, hit: false };
}
