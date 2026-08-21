import { BASE_URL, http } from './client';
import type { ReviewJobProgress, ReviewResult } from './types';

export async function uploadReviewFile(file: File): Promise<{ job_id: string; session_id: string; status: 'queued' }> {
  if (!BASE_URL) throw new Error('No API base URL');
  const form = new FormData();
  form.append('file', file);
  return http<{ job_id: string; session_id: string; status: 'queued' }>('/api/review/upload', {
    method: 'POST',
    body: form,
  });
}

export async function getReviewJob(jobId: string): Promise<ReviewJobProgress> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ReviewJobProgress>(`/api/review/${jobId}`);
}

export function pollReviewJob(
  jobId: string,
  onUpdate: (progress: ReviewJobProgress) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ReviewJobProgress> {
  const { intervalMs = 1500, signal } = opts;
  return new Promise((resolve, reject) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    if (signal?.aborted) {
      stop();
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal?.addEventListener('abort', () => {
      stop();
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
    const tick = async () => {
      if (stopped) return;
      try {
        const progress = await getReviewJob(jobId);
        if (stopped) return;
        onUpdate(progress);
        if (progress.status === 'completed') {
          stop();
          resolve(progress);
          return;
        }
        if (progress.status === 'failed') {
          stop();
          reject(new Error(progress.error || 'فشلت مراجعة العقد'));
          return;
        }
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === 'AbortError')) {
          // transient errors are retried on the next tick
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    void tick();
  });
}

export async function getReviewSession(sessionId: string): Promise<ReviewResult> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ReviewResult>(`/api/review/session/${sessionId}`);
}
