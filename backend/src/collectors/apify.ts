import { config } from '../config.js';
import { FatalSourceError } from '../net/resilience.js';

/** Run an Apify actor synchronously and return its dataset items. Maps HTTP failures to retryable vs fatal. */
export async function runActor<T = any>(actor: string, input: object, timeoutS = 120): Promise<T[]> {
  if (!config.APIFY_TOKEN) throw new FatalSourceError('APIFY_TOKEN is not set', 'failed');
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=${timeoutS}&format=json&clean=true`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.APIFY_TOKEN}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout((timeoutS + 15) * 1000),
  });
  if (res.status === 401 || res.status === 403) throw new FatalSourceError('Apify rejected the token', 'failed');
  if (res.status === 402) throw new FatalSourceError('Apify usage limit reached (out of credits)', 'blocked');
  if (res.status === 429) throw new Error('Apify rate limit (429)'); // retryable
  if (res.status === 404) throw new FatalSourceError(`Apify actor not found: ${actor}`, 'failed');
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}
