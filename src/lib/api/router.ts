import { BASE_URL, http } from './client';
import type { RouterAPIRequest, RouterAPIResponse } from './types';

// Router لا يجب أن يحجز الصفحة؛ بعد 2.2 ثانية نستخدم fallback بالكلمات المفتاحية.
export const ROUTER_TIMEOUT_MS = 2200;

export async function routeViaAPI(req: RouterAPIRequest): Promise<RouterAPIResponse> {
  if (!BASE_URL) throw new Error('No API base URL');
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);
  try {
    return await http<RouterAPIResponse>('/api/router', {
      method: 'POST',
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}
