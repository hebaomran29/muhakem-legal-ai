import { BASE_URL, http } from './client';
import type { RouterAPIRequest, RouterAPIResponse } from './types';

export async function routeViaAPI(req: RouterAPIRequest): Promise<RouterAPIResponse> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<RouterAPIResponse>('/api/router', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}
