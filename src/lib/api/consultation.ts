import { BASE_URL, http } from './client';
import type { ConsultationChatResponse } from './types';

export async function sendConsultationChat(
  message: string,
  sessionId?: string | null,
): Promise<ConsultationChatResponse> {
  if (!BASE_URL) return mockSendConsultationChat(message);
  return http<ConsultationChatResponse>('/api/consultation/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
  });
}

function mockSendConsultationChat(_message: string): Promise<ConsultationChatResponse> {
  return Promise.resolve({
    session_id: null,
    reply:
      'عذرًا، لا يمكن معالجة الاستشارة حاليًا — الخادم غير متصل. قم بتوصيل الباك إند عبر متغير VITE_API_BASE_URL في ملف .env لتشغيل الاستشارات بالذكاء الاصطناعي.',
    needs_clarification: false,
    routing: null,
  });
}
