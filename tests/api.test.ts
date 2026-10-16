import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { DownloadService } from '../server/downloads.js';
import type { EngineRunner } from '../server/engine.js';
import { PublicError } from '../server/urls.js';

const services: DownloadService[] = [];
const videoUrl = 'https://www.instagram.com/reel/ABC/';
const fixture = Buffer.from('test-video-payload');
const fakeEngine: EngineRunner = async (_url, directory, _signal, update) => {
  update({
    title: 'Pâtes / du dimanche! 🍝',
    uploader: 'Une cuisine',
    duration: 38,
    status: 'downloading',
    progress: 50,
  });
  await writeFile(path.join(directory, 'video.mp4'), fixture);
  return path.join(directory, 'video.mp4');
};
function service(options: ConstructorParameters<typeof DownloadService>[0] = {}) {
  const instance = new DownloadService({
    run: fakeEngine,
    health: async () => ({ ready: true }),
    ...options,
  });
  services.push(instance);
  return instance;
}
afterEach(async () => {
  await Promise.all(services.splice(0).map((item) => item.close()));
});

describe('download API and lifecycle (injected engine)', () => {
  it('prepares and serves an attachment, without exposing filesystem paths', async () => {
    const store = service();
    const app = createApp(store);
    const created = await request(app).post('/api/downloads').send({ url: videoUrl }).expect(202);
    expect(created.body.status).toBe('processing');
    expect(created.body.id).toMatch(/^[\da-f-]{36}$/);
    await vi.waitFor(() => expect(store.get(created.body.id).status).toBe('ready'));
    const result = await request(app).get(`/api/downloads/${created.body.id}`).expect(200);
    expect(result.body).toMatchObject({
      title: 'Pâtes / du dimanche! 🍝',
      uploader: 'Une cuisine',
      duration: 38,
      progress: 100,
      size: fixture.length,
    });
    expect(result.body).not.toHaveProperty('file');
    expect(result.body).not.toHaveProperty('directory');
    expect(result.body).not.toHaveProperty('url');
    const file = await request(app).get(`/api/downloads/${created.body.id}/file`).expect(200);
    expect(file.headers['content-type']).toContain('video/mp4');
    expect(file.headers['content-disposition']).toContain('Pates  du dimanche.mp4');
    expect(file.headers['cache-control']).toBe('no-store');
    expect(file.body).toEqual(fixture);
  });
  it('rejects unsupported URLs before running the engine', async () => {
    const run = vi.fn<EngineRunner>();
    const app = createApp(service({ run }));
    await request(app).post('/api/downloads').send({ url: 'https://127.0.0.1/admin' }).expect(400);
    expect(run).not.toHaveBeenCalled();
  });
  it('returns an actionable missing-engine response', async () => {
    const app = createApp(
      service({ health: async () => ({ ready: false, message: 'Installez le moteur.' }) }),
    );
    const health = await request(app).get('/api/health').expect(200);
    expect(health.body.ready).toBe(false);
    const result = await request(app).post('/api/downloads').send({ url: videoUrl }).expect(503);
    expect(result.body.error).toContain('Installez');
  });
  it('blocks cross-origin submissions and form-encoded requests', async () => {
    const app = createApp(service());
    await request(app)
      .post('/api/downloads')
      .set('Origin', 'https://evil.test')
      .send({ url: videoUrl })
      .expect(403);
    await request(app)
      .post('/api/downloads')
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ url: videoUrl })
      .expect(403);
    await request(app).post('/api/downloads').type('form').send({ url: videoUrl }).expect(415);
  });
  it('limits body size and rejects malformed JSON', async () => {
    const app = createApp(service());
    await request(app)
      .post('/api/downloads')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
    await request(app)
      .post('/api/downloads')
      .send({ url: 'x'.repeat(5000) })
      .expect(413);
  });
  it('returns 404 for unknown jobs and endpoints', async () => {
    const app = createApp(service());
    await request(app).get('/api/downloads/not-found').expect(404);
    await request(app).get('/api/downloads/not-found/file').expect(404);
    const result = await request(app).get('/api/not-found').expect(404);
    expect(result.headers['content-type']).toContain('application/json');
  });
  it('limits concurrent jobs and denies unfinished file downloads', async () => {
    const run: EngineRunner = (_url, _directory, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new PublicError('Interrompu.')), {
          once: true,
        });
      });
    const store = service({ run });
    const app = createApp(store);
    const first = await request(app).post('/api/downloads').send({ url: videoUrl }).expect(202);
    await request(app).post('/api/downloads').send({ url: videoUrl }).expect(202);
    await request(app).post('/api/downloads').send({ url: videoUrl }).expect(429);
    await request(app).get(`/api/downloads/${first.body.id}/file`).expect(409);
  });
  it('propagates public errors, without leaking internal diagnostics', async () => {
    const store = service({
      run: async () => {
        throw new PublicError('Cette vidéo est privée.');
      },
    });
    const job = await store.create(videoUrl);
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('error'));
    expect(store.get(job.id).error).toBe('Cette vidéo est privée.');
    const internal = service({
      run: async () => {
        throw new Error('/secret/path with token');
      },
    });
    const other = await internal.create(videoUrl);
    await vi.waitFor(() => expect(internal.get(other.id).status).toBe('error'));
    expect(internal.get(other.id).error).not.toContain('/secret');
  });
  it('aborts slow jobs', async () => {
    const store = service({
      timeoutMs: 30,
      run: (_url, _directory, signal) =>
        new Promise((_resolve, reject) => {
          if (signal.aborted) reject(new Error('aborted'));
          else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });
    const job = await store.create(videoUrl);
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('error'));
    expect(store.get(job.id).error).toContain('trop de temps');
  });
  it('expires files and removes their temporary directories', async () => {
    const store = service({ retentionMs: 120 });
    const job = await store.create(videoUrl);
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('ready'), { interval: 10 });
    const file = store.file(job.id).path;
    await new Promise((resolve) => setTimeout(resolve, 140));
    expect(() => store.get(job.id)).toThrow('expiré');
    await store.cleanup();
    await expect(access(path.dirname(file))).rejects.toThrow();
  });
  it('cleans up on shutdown and stops accepting jobs', async () => {
    const store = service();
    const job = await store.create(videoUrl);
    await vi.waitFor(() => expect(store.get(job.id).status).toBe('ready'));
    const file = store.file(job.id).path;
    await store.close();
    await expect(access(path.dirname(file))).rejects.toThrow();
    await expect(store.create(videoUrl)).rejects.toThrow('arrêt');
  });
  it('sets security headers on production responses', async () => {
    const response = await request(createApp(service(), true)).get('/api/health').expect(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('rate-limits excessive submissions', async () => {
    const app = createApp(service());
    for (let i = 0; i < 10; i++)
      await request(app).post('/api/downloads').send({ url: 'bad' }).expect(400);
    const response = await request(app).post('/api/downloads').send({ url: 'bad' }).expect(429);
    expect(response.body.error).toContain('Dix demandes');
  });
});
