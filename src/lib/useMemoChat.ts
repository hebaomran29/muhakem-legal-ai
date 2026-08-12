import { useState, useCallback, useRef, useEffect } from 'react';
import { sendMemoChat, type ChatResponse, type ChatChangeCard, type MemoSection, type SwitchTaskSignal } from './api';

export type MemoChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  changeCard?: ChatChangeCard;
  warnings?: string[];
};

export type MemoChatState = {
  messages: MemoChatMessage[];
  typing: boolean;
  typingStatus: string;
  send: (text: string) => void;
  reset: () => void;
  context: string | null;
  setContextLabel: (label: string | null) => void;
  clearContext: () => void;
};

export function useMemoChat(
  jobId: string | null,
  onSectionsUpdate?: (sections: MemoSection[]) => void,
  onSwitchTask?: (signal: SwitchTaskSignal) => void,
  initialMessages?: MemoChatMessage[],
): MemoChatState {
  const [messages, setMessages] = useState<MemoChatMessage[]>(initialMessages ?? []);
  // لو initialMessages وصلت بعد أول render (مثلاً استئناف جلسة قديمة بعد ما
  // الفرونت خلص getRemoteSession/resume بشكل غير متزامن)، حدّثي الرسائل —
  // لكن مرة واحدة بس عشان منمسحش رسائل جديدة اتبعتت فعلاً في الشات
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (initialMessages && initialMessages.length > 0) {
      seededRef.current = true;
      setMessages(initialMessages);
    }
  }, [initialMessages]);
  const [typing, setTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('');
  const [context, setContext] = useState<string | null>(null);
  const idRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearStatusTimer(), [clearStatusTimer]);

  const send = useCallback(
    (text: string) => {
      if (!jobId) return;
      const userMsg: MemoChatMessage = {
        id: `mc-u${idRef.current++}`,
        role: 'user',
        text,
      };
      setMessages((m) => [...m, userMsg]);
      setTyping(true);

      const statuses = ['يحلل الطلب...', 'يراجع القسم...', 'يعدّل المذكرة...'];
      let si = 0;
      setTypingStatus(statuses[0]);
      clearStatusTimer();
      statusTimerRef.current = setInterval(() => {
        si = (si + 1) % statuses.length;
        setTypingStatus(statuses[si]);
      }, 1400);

      // Fire the API call
      sendMemoChat(jobId, text)
        .then((res: ChatResponse) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');

          const assistantMsg: MemoChatMessage = {
            id: `mc-a${idRef.current++}`,
            role: 'assistant',
            text: res.reply,
            changeCard: res.change_card ?? undefined,
            warnings: res.warnings?.length ? res.warnings : undefined,
          };
          setMessages((m) => [...m, assistantMsg]);

          // 🔀 المستخدمة طلبت مهمة مختلفة تمامًا (مش تعديل على المذكرة الحالية)
          // مبنسيبش الرسالة تتنفذ محلياً كتعديل — نسيب الشاشة الأعلى تعمل transition
          if (res.switch_task) {
            onSwitchTask?.(res.switch_task);
            return;
          }

          // ⬆️ حدّث الأقسام الفعلية في المذكرة
          if (res.updated_sections && onSectionsUpdate) {
            onSectionsUpdate(res.updated_sections as MemoSection[]);
          }
        })
        .catch((err) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');
          const assistantMsg: MemoChatMessage = {
            id: `mc-a${idRef.current++}`,
            role: 'assistant',
            text: `حدث خطأ: ${err instanceof Error ? err.message : 'تعذّر الاتصال بالخادم'}`,
          };
          setMessages((m) => [...m, assistantMsg]);
        });
    },
    [jobId, clearStatusTimer, onSectionsUpdate, onSwitchTask],
  );

  const reset = useCallback(() => {
    clearStatusTimer();
    setMessages([]);
    setTyping(false);
    setTypingStatus('');
    setContext(null);
  }, [clearStatusTimer]);

  const setContextLabel = useCallback((label: string | null) => setContext(label), []);
  const clearContext = useCallback(() => setContext(null), []);

  return { messages, typing, typingStatus, send, reset, context, setContextLabel, clearContext };
}
