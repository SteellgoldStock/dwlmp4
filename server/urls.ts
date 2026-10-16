import type { Platform } from '../shared/types.js';

const instagramHosts = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
const tiktokHosts = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
]);

export class PublicError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

function parseAllowedUrl(input: unknown): URL {
  if (typeof input !== 'string' || input.length > 2048 || !input.trim()) {
    throw new PublicError('Collez le lien d’un Reel Instagram ou d’une vidéo TikTok.');
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new PublicError('Ce lien n’est pas valide. Copiez le lien complet, avec https://.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    (!instagramHosts.has(url.hostname) && !tiktokHosts.has(url.hostname))
  ) {
    throw new PublicError('Seuls les liens HTTPS Instagram et TikTok sont acceptés.');
  }
  url.hash = '';
  return url;
}

export function validateVideoUrl(input: unknown): {
  url: string;
  platform: Platform;
  short: boolean;
} {
  const url = parseAllowedUrl(input);
  if (instagramHosts.has(url.hostname)) {
    const match = /^\/(?:[A-Za-z0-9._]{1,30}\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(
      url.pathname,
    );
    if (!match)
      throw new PublicError(
        'Utilisez le lien d’un Reel ou d’une publication vidéo, pas celui d’un profil.',
      );
    return {
      url: `https://www.instagram.com/${match[1]}/${match[2]}/`,
      platform: 'instagram',
      short: false,
    };
  }
  const video = /^\/@([\w.-]+)\/video\/(\d+)\/?$/.exec(url.pathname);
  if (video && !['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)) {
    return {
      url: `https://www.tiktok.com/@${video[1]}/video/${video[2]}`,
      platform: 'tiktok',
      short: false,
    };
  }
  const short =
    (['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname) &&
      /^\/[A-Za-z0-9]+\/?$/.test(url.pathname)) ||
    /^\/t\/[A-Za-z0-9]+\/?$/.test(url.pathname);
  if (!short)
    throw new PublicError(
      'Utilisez le lien d’une vidéo TikTok, pas celui d’un profil ou d’un diaporama photo.',
    );
  url.search = '';
  return { url: url.toString(), platform: 'tiktok', short: true };
}

// Resolve only TikTok HTTPS redirects, never arbitrary user-supplied destinations.
export async function resolveVideoUrl(
  input: string,
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<string> {
  let video = validateVideoUrl(input);
  for (let hop = 0; video.short && hop < 5; hop++) {
    const response = await request(video.url, { redirect: 'manual', signal });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (response.status < 300 || response.status > 399 || !location) {
      throw new PublicError(
        'Le lien court n’a pas pu être résolu. Essayez le lien complet de la vidéo TikTok.',
      );
    }
    const next = validateVideoUrl(new URL(location, video.url).toString());
    if (next.platform !== 'tiktok')
      throw new PublicError('Ce lien court ne redirige pas vers une vidéo TikTok.');
    video = next;
  }
  if (video.short)
    throw new PublicError('Trop de redirections. Essayez le lien complet de la vidéo TikTok.');
  return video.url;
}
