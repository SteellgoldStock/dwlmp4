import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { access, stat, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import type { DownloadJob, Health } from '../shared/types.js';
import { PublicError } from './urls.js';

export const MAX_BYTES = 200 * 1024 * 1024;
export const MAX_DURATION = 20 * 60;
export const ENGINE_PATH =
  process.env.YTDLP_PATH ||
  path.resolve('.bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
export const FFMPEG_PATH =
  process.env.FFMPEG_PATH || (typeof ffmpegStatic === 'string' ? ffmpegStatic : '');

export function engineArguments(url: string, directory: string): string[] {
  return [
    '--ignore-config',
    '--no-plugin-dirs',
    '--no-cache-dir',
    '--no-playlist',
    '--playlist-items',
    '1',
    '--no-cookies',
    '--no-colors',
    '--newline',
    '--progress',
    '--no-simulate',
    '--socket-timeout',
    '20',
    '--retries',
    '2',
    '--fragment-retries',
    '2',
    '--abort-on-unavailable-fragments',
    '--concurrent-fragments',
    '2',
    '--max-filesize',
    String(MAX_BYTES),
    '--match-filters',
    `duration <=? ${MAX_DURATION} & !is_live`,
    '--format',
    'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b',
    '--format-sort',
    'res:1080,vcodec:h264,acodec:aac',
    '--merge-output-format',
    'mp4',
    '--remux-video',
    'mp4',
    '--ffmpeg-location',
    FFMPEG_PATH,
    '--output',
    path.join(directory, 'video.%(ext)s'),
    '--print',
    'before_dl:metadata:%(.{title,uploader,duration})j',
    '--progress-template',
    'download:progress:%(progress._percent_str)s',
    '--print',
    'after_move:finished:%(id)s',
    '--',
    url,
  ];
}

export function readableEngineError(stderr: string): string {
  if (/no such option|unrecognized arguments|invalid.*option/i.test(stderr))
    return 'Le moteur de téléchargement est incompatible. Mettez-le à jour avec « npm run setup:engine » sur le serveur.';
  if (/max.filesize|larger than|too large/i.test(stderr))
    return 'Cette vidéo dépasse la limite de 200 Mo.';
  if (/does not pass filter|rejected by filter/i.test(stderr))
    return 'Cette vidéo dépasse 20 minutes, ou il s’agit d’un direct.';
  if (/private|login|log.in|sign.in|cookies|authentication|not authorized/i.test(stderr)) {
    return 'Cette vidéo exige une connexion ou n’est pas publique. Les contenus privés ne sont pas pris en charge.';
  }
  if (
    /429|too many requests|rate.limit|captcha|challenge|403|blocked|unable to extract|empty response/i.test(
      stderr,
    )
  ) {
    return 'La plateforme bloque la récupération pour le moment. Réessayez plus tard, ou avec une autre vidéo publique.';
  }
  if (/not available|unavailable|not found|404|removed|deleted|no video/i.test(stderr)) {
    return 'Cette vidéo est indisponible, supprimée, ou ce lien ne contient pas de vidéo.';
  }
  if (/ffmpeg|ffprobe/i.test(stderr))
    return 'La conversion MP4 n’a pas pu aboutir. Vérifiez l’installation de FFmpeg sur le serveur.';
  return 'Impossible de récupérer cette vidéo. Vérifiez qu’elle est publique, puis réessayez. La plateforme peut aussi en bloquer l’accès.';
}

export async function engineHealth(): Promise<Health> {
  try {
    await Promise.all([access(ENGINE_PATH, constants.X_OK), access(FFMPEG_PATH, constants.X_OK)]);
    return { ready: true };
  } catch {
    return {
      ready: false,
      message:
        'Le moteur de téléchargement n’est pas installé. Lancez « npm run setup:engine » sur le serveur et vérifiez FFmpeg.',
    };
  }
}

export type EngineUpdate = Partial<
  Pick<DownloadJob, 'status' | 'progress' | 'title' | 'uploader' | 'duration'>
>;
export type EngineRunner = (
  url: string,
  directory: string,
  signal: AbortSignal,
  update: (data: EngineUpdate) => void,
) => Promise<string>;

export const runEngine: EngineRunner = (url, directory, signal, update) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new PublicError('Le délai de récupération a été dépassé. Réessayez.'));
      return;
    }
    const child = spawn(ENGINE_PATH, engineArguments(url, directory), {
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    let finished = false;
    let forcedError: string | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = () => {
      const kill = (type: NodeJS.Signals) => {
        if (!child.pid) return;
        try {
          if (process.platform === 'win32') child.kill(type);
          else process.kill(-child.pid, type);
        } catch {
          /* The process may already have exited. */
        }
      };
      kill('SIGTERM');
      killTimer ??= setTimeout(() => kill('SIGKILL'), 3000);
      killTimer.unref();
    };
    signal.addEventListener('abort', terminate, { once: true });
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (line.startsWith('metadata:')) {
        try {
          const metadata = JSON.parse(line.slice(9)) as Record<string, unknown>;
          if (typeof metadata.duration === 'number' && metadata.duration > MAX_DURATION) {
            forcedError = 'Cette vidéo dépasse la limite de 20 minutes.';
            terminate();
            return;
          }
          update({
            title: typeof metadata.title === 'string' ? metadata.title.slice(0, 300) : undefined,
            uploader:
              typeof metadata.uploader === 'string' ? metadata.uploader.slice(0, 100) : undefined,
            duration: typeof metadata.duration === 'number' ? metadata.duration : undefined,
            status: 'downloading',
            progress: 5,
          });
        } catch {
          /* Ignore non-JSON diagnostic output. */
        }
      } else if (line.startsWith('progress:')) {
        const percent = Number.parseFloat(line.slice(9).trim());
        if (Number.isFinite(percent))
          update({
            status: percent >= 100 ? 'converting' : 'downloading',
            progress: Math.min(95, Math.max(5, percent * 0.9 + 5)),
          });
      } else if (line.startsWith('finished:')) {
        finished = true;
        update({ status: 'converting', progress: 98 });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-16_384);
    });
    // Also enforce the size limit when the source does not advertise Content-Length.
    let checking = false;
    const sizeTimer = setInterval(() => {
      if (checking) return;
      checking = true;
      void readdir(directory)
        .then(async (entries) => {
          const sizes = await Promise.all(
            entries.map(
              async (name) => (await stat(path.join(directory, name)).catch(() => null))?.size ?? 0,
            ),
          );
          if (
            sizes.some((size) => size > MAX_BYTES) ||
            sizes.reduce((sum, size) => sum + size, 0) > MAX_BYTES * 2
          ) {
            forcedError = 'Cette vidéo dépasse la limite de 200 Mo.';
            terminate();
          }
        })
        .catch(() => {})
        .finally(() => {
          checking = false;
        });
    }, 1000);
    sizeTimer.unref();
    const cleanup = () => {
      clearInterval(sizeTimer);
      if (killTimer) clearTimeout(killTimer);
      signal.removeEventListener('abort', terminate);
      lines.close();
    };
    child.once('error', () => {
      cleanup();
      reject(
        new PublicError(
          'Le moteur n’a pas pu démarrer. Relancez « npm run setup:engine » sur le serveur.',
          503,
        ),
      );
    });
    child.once('close', (code) => {
      cleanup();
      if (signal.aborted)
        reject(
          new PublicError(
            'La récupération a pris trop de temps (3 minutes maximum). Réessayez plus tard.',
          ),
        );
      else if (forcedError) reject(new PublicError(forcedError));
      else if (code !== 0 || !finished) reject(new PublicError(readableEngineError(stderr)));
      else resolve(path.join(directory, 'video.mp4'));
    });
  });
