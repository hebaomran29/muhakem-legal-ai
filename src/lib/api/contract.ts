import { BASE_URL, http } from './client';
import type {
  ContractChatResponse,
  ContractJobProgress,
} from './types';

export async function createContractJob(
  query: string,
): Promise<{ job_id: string; status: 'queued'; db_session_id: string | null }> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<{ job_id: string; status: 'queued'; db_session_id: string | null }>(
    '/api/contract/generate',
    { method: 'POST', body: JSON.stringify({ query }) },
  );
}

export async function getContractJob(jobId: string): Promise<ContractJobProgress> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ContractJobProgress>(`/api/contract/${jobId}`);
}

export async function sendContractChat(
  jobId: string,
  message: string,
): Promise<ContractChatResponse> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ContractChatResponse>('/api/contract/chat', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId, message }),
  });
}

export function pollContractJob(
  jobId: string,
  onUpdate: (progress: ContractJobProgress) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ContractJobProgress> {
  const { intervalMs = 3000, signal } = opts;
  return new Promise((resolve, reject) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };

    if (signal) {
      if (signal.aborted) {
        stop();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', stop, { once: true });
    }

    const tick = async () => {
      if (stopped) return;
      try {
        const progress = await getContractJob(jobId);
        if (stopped) return;
        onUpdate(progress);
        if (progress.status === 'completed') {
          stop();
          resolve(progress);
          return;
        }
        if (progress.status === 'failed') {
          stop();
          reject(new Error(progress.error || 'فشل توليد العقد'));
          return;
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          stop();
          reject(error);
          return;
        }
        // Keep polling through transient network errors.
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}

export function getContractDownloadUrl(jobId: string): string {
  return `${BASE_URL}/api/contract/${jobId}/download`;
}

export function downloadContractDocx(jobId: string): void {
  const url = getContractDownloadUrl(jobId);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = '';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
