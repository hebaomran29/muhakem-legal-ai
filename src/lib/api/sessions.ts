import { http } from './client';
import type { RemoteChatMessage, RemoteSession } from './types';

export async function listRemoteSessions(): Promise<RemoteSession[]> {
  const response = await http<{ sessions: RemoteSession[] }>('/api/sessions');
  return response.sessions;
}

export async function getRemoteSession(id: string): Promise<{
  session: RemoteSession;
  result: Record<string, unknown> | null;
  chat_history: RemoteChatMessage[];
}> {
  return http(`/api/sessions/${id}`);
}

export async function resumeMemoSession(sessionId: string): Promise<{
  job_id: string;
  status: 'completed';
  db_session_id: string | null;
  chat_history: RemoteChatMessage[];
}> {
  return http(`/api/memo/${sessionId}/resume`, { method: 'POST' });
}

export async function resumeContractSession(sessionId: string): Promise<{
  job_id: string;
  status: 'completed';
  db_session_id: string | null;
  chat_history: RemoteChatMessage[];
}> {
  return http(`/api/contract/${sessionId}/resume`, { method: 'POST' });
}

export async function deleteRemoteSession(id: string): Promise<void> {
  await http(`/api/sessions/${id}`, { method: 'DELETE' });
}

export async function pinRemoteSession(id: string, pinned: boolean): Promise<void> {
  await http(`/api/sessions/${id}/pin`, {
    method: 'POST',
    body: JSON.stringify({ pinned }),
  });
}
