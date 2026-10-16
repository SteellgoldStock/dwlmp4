import { describe, expect, it, vi } from 'vitest';
import { resolveVideoUrl, validateVideoUrl } from '../server/urls.js';

describe('video URL validation', () => {
  it.each([
    [
      'https://www.instagram.com/reel/AbC-123_/?igsh=tracking',
      'https://www.instagram.com/reel/AbC-123_/',
      'instagram',
      false,
    ],
    [' https://instagram.com/p/ABC/ ', 'https://www.instagram.com/p/ABC/', 'instagram', false],
    [
      'https://m.instagram.com/reels/ABC/#tracking',
      'https://www.instagram.com/reels/ABC/',
      'instagram',
      false,
    ],
    [
      'https://www.instagram.com/chef.name/reel/ABC/?igsh=tracking',
      'https://www.instagram.com/reel/ABC/',
      'instagram',
      false,
    ],
    [
      'https://www.tiktok.com/@chef.test/video/1234567890123456789?is_from_webapp=1',
      'https://www.tiktok.com/@chef.test/video/1234567890123456789',
      'tiktok',
      false,
    ],
    ['https://vm.tiktok.com/Z123Ab/?share=1', 'https://vm.tiktok.com/Z123Ab/', 'tiktok', true],
    ['https://www.tiktok.com/t/Z123Ab/', 'https://www.tiktok.com/t/Z123Ab/', 'tiktok', true],
  ])('accepts and canonicalizes %s', (input, url, platform, short) => {
    expect(validateVideoUrl(input)).toEqual({ url, platform, short });
  });

  it.each([
    '',
    null,
    3,
    {},
    'not a URL',
    'https://127.0.0.1/video/1',
    'http://instagram.com/reel/ABC/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://instagram.com.evil.test/reel/ABC/',
    'https://instagram.com@evil.test/reel/ABC/',
    'https://user:pass@instagram.com/reel/ABC/',
    'https://instagram.com:8080/reel/ABC/',
    'https://www.instagram.com/chef/',
    'https://www.instagram.com/stories/chef/123/',
    'https://www.instagram.com/reel/ABC/%2f../',
    'https://www.tiktok.com/@chef',
    'https://www.tiktok.com/@chef/photo/123',
    'https://vm.tiktok.com/@chef/video/123',
    'https://www.tiktok.com/live',
    'x'.repeat(2049),
  ])('rejects unsupported or unsafe input %j', (input) => {
    expect(() => validateVideoUrl(input)).toThrow();
  });
});

describe('short-link redirects', () => {
  const signal = new AbortController().signal;
  it('does not request direct video URLs', async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      resolveVideoUrl('https://www.instagram.com/reel/ABC/', signal, request),
    ).resolves.toBe('https://www.instagram.com/reel/ABC/');
    expect(request).not.toHaveBeenCalled();
  });
  it('resolves TikTok redirects without automatically following them', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://www.tiktok.com/@chef/video/123?tracking=1' },
      }),
    );
    await expect(resolveVideoUrl('https://vm.tiktok.com/Zabc/', signal, request)).resolves.toBe(
      'https://www.tiktok.com/@chef/video/123',
    );
    expect(request).toHaveBeenCalledWith('https://vm.tiktok.com/Zabc/', {
      redirect: 'manual',
      signal,
    });
  });
  it.each([
    'http://127.0.0.1:8000/private',
    'https://evil.test/steal',
    'file:///etc/passwd',
    'https://instagram.com/reel/ABC/',
  ])('blocks redirect to %s before making another request', async (location) => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location } }));
    await expect(resolveVideoUrl('https://vm.tiktok.com/Zabc/', signal, request)).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('stops redirect loops', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(null, { status: 302, headers: { location: '/Zabc/' } }),
      );
    await expect(resolveVideoUrl('https://vm.tiktok.com/Zabc/', signal, request)).rejects.toThrow(
      'Trop de redirections',
    );
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('explains failed short links', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }));
    await expect(resolveVideoUrl('https://vm.tiktok.com/Zabc/', signal, request)).rejects.toThrow(
      'lien complet',
    );
  });
});
