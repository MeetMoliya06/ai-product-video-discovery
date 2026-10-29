import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config } from '../config.js';

export class UnsafeUrlError extends Error {}

/** True for loopback, private, link-local, CGNAT, multicast and cloud-metadata addresses. */
export function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('::ffff:')) return isPrivateIp(ip.slice(7)); // IPv4-mapped IPv6
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('ff');
}

/** Throws UnsafeUrlError unless the URL is http(s) and every resolved address is public. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UnsafeUrlError('Only http(s) URLs are allowed');
  if (url.username || url.password) throw new UnsafeUrlError('URLs with credentials are not allowed');
  if (config.ALLOW_PRIVATE_URLS) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new UnsafeUrlError('Internal hostnames are not allowed');
  }
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new UnsafeUrlError('Hostname could not be resolved');
  });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError('URL resolves to a private or internal address');
  return url;
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

/**
 * fetch() that validates the target before every hop (so redirects can't reach internal hosts),
 * caps redirects, time and body size.
 * Residual risk: DNS rebinding between our lookup and the socket connect; mitigate with an egress proxy in production.
 */
export async function safeFetch(
  raw: string,
  { maxBytes = 5_000_000, timeoutMs = 10_000, maxRedirects = 4, headers = {} }: SafeFetchOptions = {},
): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertSafeUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProductVideoBot/1.0)', accept: '*/*', ...headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`Upstream responded with HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error('Response too large');

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Response too large');
      chunks.push(Buffer.from(chunk));
    }
    return { body: Buffer.concat(chunks), contentType: res.headers.get('content-type') ?? '', finalUrl: url.toString() };
  }
  throw new Error('Too many redirects');
}
