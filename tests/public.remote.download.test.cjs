const { fetchPublicRemoteUrl, isPublicIpAddress } = require('../shared/server/upload/public.remote.download.ts');

describe('public remote upload downloads', () => {
  test('rejects unsafe URL schemes, IP literals, internal names, credentials, and unusual ports', async () => {
    await expect(fetchPublicRemoteUrl('file:///etc/passwd')).rejects.toThrow(/HTTP or HTTPS/);
    await expect(fetchPublicRemoteUrl('http://127.0.0.1/image.png')).rejects.toThrow(/public hostname/);
    await expect(fetchPublicRemoteUrl('http://[::1]/image.png')).rejects.toThrow(/public hostname/);
    await expect(fetchPublicRemoteUrl('http://metadata.google.internal/image.png')).rejects.toThrow(/not publicly routable/);
    await expect(fetchPublicRemoteUrl('https://user:pass@example.com/image.png')).rejects.toThrow(/credentials/);
    await expect(fetchPublicRemoteUrl('https://example.com:8443/image.png')).rejects.toThrow(/standard HTTP or HTTPS port/);
  });

  test('distinguishes public IPs from private, link-local, and reserved ranges', () => {
    expect(isPublicIpAddress('8.8.8.8', 4)).toBe(true);
    expect(isPublicIpAddress('10.0.0.1', 4)).toBe(false);
    expect(isPublicIpAddress('169.254.169.254', 4)).toBe(false);
    expect(isPublicIpAddress('192.168.1.1', 4)).toBe(false);
    expect(isPublicIpAddress('2606:4700:4700::1111', 6)).toBe(true);
    expect(isPublicIpAddress('fd00::1', 6)).toBe(false);
    expect(isPublicIpAddress('fe80::1', 6)).toBe(false);
    expect(isPublicIpAddress('2001:db8::1', 6)).toBe(false);
  });
});
