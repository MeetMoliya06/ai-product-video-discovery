export class TimeoutError extends Error {}
/** Error that retrying will not fix (auth, quota, blocked). */
export class FatalSourceError extends Error {
  constructor(
    message: string,
    public kind: 'blocked' | 'failed' = 'failed',
  ) {
    super(message);
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new TimeoutError(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  { retries = 2, baseMs = 800 }: { retries?: number; baseMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (err instanceof FatalSourceError || attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** attempt + Math.random() * 200));
    }
  }
  throw lastErr;
}

/** Run `fn` over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
