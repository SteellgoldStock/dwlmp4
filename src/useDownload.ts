import { useEffect, useRef, useState } from 'react';
import type { DownloadJob, Health } from '../shared/types';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok)
    throw new Error(
      body?.error || 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.',
    );
  if (!body) throw new Error('La réponse du serveur est illisible. Réessayez dans un instant.');
  return body;
}

export function useDownload() {
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const submitLock = useRef(false);
  const active = Boolean(job && job.status !== 'ready' && job.status !== 'error');

  async function checkHealth() {
    setHealth(null);
    try {
      setHealth(await request<Health>('/api/health'));
    } catch {
      setHealth({
        ready: false,
        message: 'Le serveur est injoignable. Vérifiez qu’il est démarré, puis réessayez.',
      });
    }
  }

  useEffect(() => {
    void checkHealth();
  }, []);
  useEffect(() => {
    if (job?.status !== 'ready') return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, [job?.status]);

  useEffect(() => {
    if (!job?.id || !active) return;
    const controller = new AbortController();
    const id = job.id;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    let stopped = false;
    async function poll() {
      try {
        const result = await request<DownloadJob>(`/api/downloads/${id}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        if (stopped) return;
        failures = 0;
        setJob(result);
        setError('');
        setPaused(false);
        if (result.status === 'ready' || result.status === 'error') return;
      } catch (error) {
        if (stopped) return;
        if (++failures >= 3) {
          setPaused(true);
          setError(error instanceof Error ? error.message : 'Le suivi a été interrompu.');
          return;
        }
      }
      if (!stopped)
        timer = setTimeout(() => {
          void poll();
        }, 1500);
    }
    timer = setTimeout(() => {
      void poll();
    }, 800);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [job?.id, active, attempt]);

  async function submit(url: string) {
    if (submitLock.current || active) return;
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    setJob(null);
    try {
      const result = await request<DownloadJob>('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      setJob(result);
      setPaused(false);
    } catch (error) {
      setError(
        error instanceof Error && error.name !== 'TimeoutError'
          ? error.message
          : 'Le serveur met trop de temps à répondre. Réessayez.',
      );
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  function reset() {
    setJob(null);
    setError('');
    setPaused(false);
  }
  function resume() {
    setError('');
    setPaused(false);
    setAttempt((value) => value + 1);
  }
  const expired = Boolean(job?.expiresAt && new Date(job.expiresAt).getTime() <= now);

  return {
    job,
    error,
    submitting,
    active,
    health,
    paused,
    expired,
    submit,
    reset,
    resume,
    checkHealth,
  };
}
