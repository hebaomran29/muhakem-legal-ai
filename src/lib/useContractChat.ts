import { useState, useCallback, useRef, useEffect } from 'react';
import { sendContractChat, type ContractChatResponse, type ContractChatChangeCard, type ContractClause, type SwitchTaskSignal } from './api';

export type ContractChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  changeCard?: ContractChatChangeCard;
};

export type ContractChatState = {
  messages: ContractChatMessage[];
  typing: boolean;
  typingStatus: string;
  send: (text: string) => void;
  reset: () => void;
  context: string | null;
  setContextLabel: (label: string | null) => void;
  clearContext: () => void;
};

export function useContractChat(
  jobId: string | null,
  onClausesUpdate?: (clauses: ContractClause[]) => void,
  onSwitchTask?: (signal: SwitchTaskSignal) => void,
): ContractChatState {
  const [messages, setMessages] = useState<ContractChatMessage[]>([]);
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
      const userMsg: ContractChatMessage = {
        id: `cc-u${idRef.current++}`,
        role: 'user',
        text,
      };
      setMessages((m) => [...m, userMsg]);
      setTyping(true);

      const statuses = ['يحلل طلبك...', 'يراجع البند...', 'يعيد صياغة النص...'];
      let si = 0;
      setTypingStatus(statuses[0]);
      clearStatusTimer();
      statusTimerRef.current = setInterval(() => {
        si = (si + 1) % statuses.length;
        setTypingStatus(statuses[si]);
      }, 1400);

      sendContractChat(jobId, text)
        .then((res: ContractChatResponse) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');

          const assistantMsg: ContractChatMessage = {
            id: `cc-a${idRef.current++}`,
            role: 'assistant',
            text: res.reply,
            changeCard: res.change_card ?? undefined,
          };
          setMessages((m) => [...m, assistantMsg]);

          // 🔀 طلب مهمة مختلفة تمامًا — نسيب الشاشة الأعلى تعمل transition
          if (res.switch_task) {
            onSwitchTask?.(res.switch_task);
            return;
          }

          // حدّث البنود الفعلية
          if (res.updated_clauses && onClausesUpdate) {
            onClausesUpdate(res.updated_clauses as ContractClause[]);
          }
        })
        .catch((err) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');
          const assistantMsg: ContractChatMessage = {
            id: `cc-a${idRef.current++}`,
            role: 'assistant',
            text: `حدث خطأ: ${err instanceof Error ? err.message : 'تعذّر الاتصال بالخادم'}`,
          };
          setMessages((m) => [...m, assistantMsg]);
        });
    },
    [jobId, clearStatusTimer, onClausesUpdate, onSwitchTask],
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
