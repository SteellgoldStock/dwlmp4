import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { engineArguments, ENGINE_PATH, MAX_BYTES, readableEngineError } from '../server/engine.js';

describe('engine invocation', () => {
  it.skipIf(!existsSync(ENGINE_PATH))(
    'the installed yt-dlp accepts all arguments (no network access)',
    () => {
      const result = spawnSync(
        ENGINE_PATH,
        [
          '--list-extractors',
          ...engineArguments('https://www.instagram.com/reel/ABC/', '/tmp/unused-test-job'),
        ],
        { encoding: 'utf8', timeout: 30_000 },
      );
      expect(result.stderr).not.toContain('no such option');
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('TikTok');
      expect(result.stdout).toContain('Instagram');
    },
  );
  it('uses explicit safe options and keeps URL as a separate argument', () => {
    const url = 'https://www.instagram.com/reel/ABC/';
    const args = engineArguments(url, '/tmp/test-job');
    expect(args.slice(-2)).toEqual(['--', url]);
    expect(args).toContain('--ignore-config');
    expect(args).toContain('--no-plugin-dirs');
    expect(args).toContain('--no-cookies');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--no-simulate');
    expect(args[args.indexOf('--max-filesize') + 1]).toBe(String(MAX_BYTES));
    expect(args[args.indexOf('--output') + 1]).toBe('/tmp/test-job/video.%(ext)s');
    expect(args).not.toContain('--enable-file-urls');
    expect(args).not.toContain('--cookies-from-browser');
  });
  it.each([
    ['ERROR: private video, login required', 'connexion'],
    ['ERROR: HTTP Error 429: Too Many Requests', 'bloque'],
    ['ERROR: HTTP Error 403: Forbidden', 'bloque'],
    ['ERROR: Video not available', 'indisponible'],
    ['File is larger than max-filesize', '200 Mo'],
    ['does not pass filter (duration <=? 1200)', '20 minutes'],
    ['ffmpeg exited with code 1', 'FFmpeg'],
    ['some unexpected extractor failure', 'Impossible de récupérer'],
  ])('converts diagnostics into a useful message: %s', (diagnostic, expected) => {
    expect(readableEngineError(diagnostic)).toContain(expected);
  });
});
