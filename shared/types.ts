export type Platform = 'instagram' | 'tiktok';
export type DownloadStatus = 'processing' | 'downloading' | 'converting' | 'ready' | 'error';

export interface DownloadJob {
  id: string;
  platform: Platform;
  status: DownloadStatus;
  progress: number;
  title?: string;
  uploader?: string;
  duration?: number;
  size?: number;
  expiresAt?: string;
  error?: string;
}

export interface Health {
  ready: boolean;
  message?: string;
}
