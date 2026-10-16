import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { ENGINE_PATH, FFMPEG_PATH, runEngine, type EngineUpdate } from '../server/engine.js';

// Exercise the actual executables with our own local video, independently of social-site availability.
it.skipIf(!existsSync(ENGINE_PATH) || !existsSync(FFMPEG_PATH))(
  'downloads and remuxes a real local fixture through yt-dlp + FFmpeg',
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'a-garder-integration-'));
    const source = path.join(directory, 'source.mkv');
    const generated = spawnSync(
      FFMPEG_PATH,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=green:s=64x64:r=5',
        '-t',
        '1',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        source,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    );
    expect(generated.status, generated.stderr).toBe(0);
    const fixture = await readFile(source);
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'video/x-matroska',
        'Content-Length': fixture.length,
      });
      response.end(fixture);
    });
    try {
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test server port');
      const updates: EngineUpdate[] = [];
      // Public API validation still rejects localhost; only this internal test calls the runner directly.
      const file = await runEngine(
        `http://127.0.0.1:${address.port}/fixture.mkv`,
        directory,
        AbortSignal.timeout(15_000),
        (update) => updates.push(update),
      );
      expect(file).toBe(path.join(directory, 'video.mp4'));
      expect((await stat(file)).size).toBeGreaterThan(100);
      expect((await readFile(file)).subarray(4, 8).toString()).toBe('ftyp');
      expect(updates.some((update) => update.title)).toBe(true);
      expect(updates.some((update) => update.status === 'downloading')).toBe(true);
      expect(updates.at(-1)).toMatchObject({ status: 'converting', progress: 98 });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  },
  25_000,
);
