import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { DownloadJob, Health } from '../shared/types.js';
import { engineHealth, MAX_BYTES, runEngine, type EngineRunner } from './engine.js';
import { PublicError, resolveVideoUrl, validateVideoUrl } from './urls.js';

const RETENTION_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 3 * 60 * 1000;
const MAX_ACTIVE = 2;
const MAX_STORED = 20;

interface InternalJob {
  public: DownloadJob;
  directory?: string;
  file?: string;
  controller: AbortController;
  expires: number;
}

interface ServiceOptions {
  run?: EngineRunner;
  health?: () => Promise<Health>;
  resolveUrl?: typeof resolveVideoUrl;
  retentionMs?: number;
  timeoutMs?: number;
}

export class DownloadService {
  private jobs = new Map<string, InternalJob>();
  private running = new Set<Promise<void>>();
  private maintenance: ReturnType<typeof setInterval>;
  private closed = false;
  private run: EngineRunner;
  health: () => Promise<Health>;

  constructor(private options: ServiceOptions = {}) {
    this.run = options.run ?? runEngine;
    this.health = options.health ?? engineHealth;
    this.maintenance = setInterval(() => {
      void this.cleanup();
    }, 60_000);
    this.maintenance.unref();
  }

  async create(input: unknown): Promise<DownloadJob> {
    const video = validateVideoUrl(input);
    if (this.closed) throw new PublicError('Le serveur est en cours d’arrêt.', 503);
    const health = await this.health();
    if (!health.ready)
      throw new PublicError(health.message || 'Le moteur de téléchargement est indisponible.', 503);
    await this.cleanup();
    if (this.closed) throw new PublicError('Le serveur est en cours d’arrêt.', 503);
    const active = [...this.jobs.values()].filter(
      (job) => !['ready', 'error'].includes(job.public.status),
    ).length;
    if (active >= MAX_ACTIVE)
      throw new PublicError(
        'Deux vidéos sont déjà en cours de récupération. Patientez un instant.',
        429,
      );
    if (this.jobs.size >= MAX_STORED)
      throw new PublicError(
        'Le stockage temporaire est plein. Réessayez après expiration des vidéos (30 minutes).',
        429,
      );
    const job: InternalJob = {
      public: { id: randomUUID(), platform: video.platform, status: 'processing', progress: 2 },
      controller: new AbortController(),
      expires: Infinity,
    };
    this.jobs.set(job.public.id, job);
    const task = this.process(job, video.url);
    this.running.add(task);
    void task.finally(() => {
      this.running.delete(task);
    });
    return { ...job.public };
  }

  get(id: string): DownloadJob {
    return { ...this.find(id).public };
  }

  file(id: string): { path: string; name: string } {
    const job = this.find(id);
    if (job.public.status !== 'ready' || !job.file)
      throw new PublicError('Cette vidéo n’est pas encore prête.', 409);
    const title =
      (job.public.title || `${job.public.platform}-video`)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim()
        .slice(0, 90) || 'video';
    return { path: job.file, name: `${title}.mp4` };
  }

  private find(id: string): InternalJob {
    const job = this.jobs.get(id);
    if (!job || job.expires <= Date.now())
      throw new PublicError(
        'Cette vidéo a expiré ou n’existe pas. Collez à nouveau son lien.',
        404,
      );
    return job;
  }

  private async process(job: InternalJob, url: string): Promise<void> {
    const timeout = setTimeout(() => job.controller.abort(), this.options.timeoutMs ?? TIMEOUT_MS);
    timeout.unref();
    try {
      job.directory = await mkdtemp(path.join(tmpdir(), 'a-garder-'));
      const resolved = await (this.options.resolveUrl ?? resolveVideoUrl)(
        url,
        job.controller.signal,
      );
      const file = await this.run(resolved, job.directory, job.controller.signal, (update) => {
        job.public = {
          ...job.public,
          ...update,
          progress: Math.max(job.public.progress, update.progress ?? 0),
        };
      });
      if (job.controller.signal.aborted)
        throw new PublicError('Le délai de récupération a été dépassé. Réessayez.');
      if (path.resolve(file) !== path.join(job.directory, 'video.mp4'))
        throw new Error('Unexpected output file');
      const info = await stat(file);
      if (!info.isFile() || info.size === 0) throw new Error('Empty video');
      if (info.size > MAX_BYTES) throw new PublicError('Cette vidéo dépasse la limite de 200 Mo.');
      // Drop intermediates; keep only the MP4 for the retention period.
      for (const entry of await readdir(job.directory)) {
        if (entry !== 'video.mp4')
          await rm(path.join(job.directory, entry), { recursive: true, force: true });
      }
      job.file = file;
      job.expires = Date.now() + (this.options.retentionMs ?? RETENTION_MS);
      job.public = {
        ...job.public,
        status: 'ready',
        progress: 100,
        size: info.size,
        expiresAt: new Date(job.expires).toISOString(),
      };
    } catch (error) {
      job.public = {
        ...job.public,
        status: 'error',
        error: job.controller.signal.aborted
          ? 'La récupération a pris trop de temps. Réessayez plus tard.'
          : error instanceof PublicError
            ? error.message
            : 'Une erreur est survenue pendant la préparation de la vidéo. Réessayez.',
      };
      job.expires = Date.now() + (this.options.retentionMs ?? RETENTION_MS);
      if (job.directory) await rm(job.directory, { recursive: true, force: true }).catch(() => {});
    } finally {
      clearTimeout(timeout);
    }
  }

  async cleanup(): Promise<void> {
    for (const [id, job] of this.jobs) {
      if (job.expires <= Date.now()) {
        this.jobs.delete(id);
        if (job.directory)
          await rm(job.directory, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    clearInterval(this.maintenance);
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.allSettled(this.running);
    await Promise.all(
      [...this.jobs.values()].map((job) =>
        job.directory
          ? rm(job.directory, { recursive: true, force: true }).catch(() => {})
          : undefined,
      ),
    );
    this.jobs.clear();
  }
}
