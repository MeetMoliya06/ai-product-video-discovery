import { describe, expect, it } from 'vitest';
import { assertSafeUrl, isPrivateIp, UnsafeUrlError } from '../src/net/ssrfGuard.js';

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks %s', (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700::1111'])('allows %s', (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe('assertSafeUrl', () => {
  it.each(['http://localhost/x', 'http://127.0.0.1:8080', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd', 'ftp://x.com/a', 'http://user:pw@example.com', 'not a url', 'http://metadata.google.internal/'])(
    'rejects %s',
    async (u) => expect(assertSafeUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError),
  );
  it('accepts a public IP literal', async () => expect((await assertSafeUrl('https://8.8.8.8/')).hostname).toBe('8.8.8.8'));
});
