import { useState, useCallback, useRef, useEffect } from 'react';
import type { SessionMessage, ChangeCard } from '../components/SessionChat';
import { sendConsultationChat } from './api';

export type TaskKind = 'contract' | 'review' | 'memo' | 'research' | 'consultation';

const replies: Record<string, string[]> = {
  contract: [
    'تمت إضافة البند المطلوب. هل تريد تعديل صياغة أخرى؟',
    'حاضر، أحدث الأجر في المادة الثالثة. هل من تعديلات أخرى؟',
    'أضفت شرط الإنهاء المسبق (٣٠ يومًا) كما طلبت.',
    'تم تعديل مدة العقد لتصبح سنتين بدلًا من سنة.',
  ],
  review: [
    'أعدت مراجعة البند المحدد. المخاطرة لا تزال قائمة — راجع التفاصيل في النافذة.',
    'البند الآمن لا يحتاج تعديل. هل تريد مراجعة بند آخر؟',
    'تم تحديث تقرير المراجعة بناءً على سؤالك.',
  ],
  memo: [
    'أضفت دفعًا شكليًا جديدًا بناءً على طلبك. هل تريد إضافة دفع موضوعي أيضًا؟',
    'حاضر، أحدث قسم الطلبات ليشمل طلب التأجيل.',
    'تم تعديل التحليل القانوني وفق المادة ١٠٤.',
  ],
  research: [
    'وجدت ٣ أحكام إضافية مرتبطة بسؤالك. هل أضيفها للنتائج؟',
    'تم تحديث الإجابة بناءً على المصادر الجديدة. راجع الأعلى.',
    'نعم، المادة ١٤٧ تنطبق على حالتك. تم توثيق المصدر.',
  ],
  consultation: [
    'بناءً على ما ذكرته، الوضع القانوني يتطلب تقديم إخطار رسمي قبل ٣٠ يومًا.',
    'يمكنك رفع دعوى أمام المحكمة العامة لطلب التعويض عن الضرر الفعلي.',
    'وفقًا للمادة ١٢٠ من نظام المدنيات، يحق لك فسخ العقد مع تعويض.',
    'أنصح بتوثيق الاتفاقية كتابيًا وتوقيعها من الطرفين لتجنب النزاع مستقبلًا.',
  ],
};

const statusMessages: Record<string, string[]> = {
  contract: ['يصيغ البند...', 'يراجع العقد...', 'يحدّث المستند...'],
  review: ['يراجع العقد...', 'يراجع المرجع القانوني...', 'يحدّث المستند...'],
  memo: ['يحلل الدفوع...', 'يراجع المرجع القانوني...', 'يحدّث المذكرة...'],
  research: ['يبحث في المصادر...', 'يراجع الأحكام...', 'يحدّث النتائج...'],
  consultation: ['يحلل السؤال...', 'يراجع المراجع القانونية...', 'يصياغ الرد...'],
};

const changeClauses: Record<string, { label: string; old: string; neu: string }[]> = {
  contract: [
    { label: 'البند الرابع', old: 'يلتزم الموظف بالحفاظ على سرية معلومات الموظِف.', neu: 'يلتزم الموظف بالحفاظ على سرية معلومات الموظِف لمدة سنتين من تاريخ انتهاء العقد.' },
    { label: 'المادة الثالثة', old: 'أجر شهري قدره ثمانية عشر ألف ريال.', neu: 'أجر شهري قدره عشرون ألف ريال، مع بدل سكن يعادل ثلاثة أشهر.' },
  ],
  review: [
    { label: 'البند الخامس', old: 'يحق لأي طرف فسخ العقد في أي وقت دون إشعار.', neu: 'لا يجوز فسخ العقد دون إشعار مكتوب قبل ٣٠ يومًا، مع تعويض يتناسب مع الضرر الفعلي.' },
    { label: 'البند الثالث', old: 'يُحسم ١٠٪ من الأجر في حال التأخر عن الدفع.', neu: 'يُقدر التعويض وفق الضرر الفعلي المثبت، وبما لا يتجاوز قيمة أجر شهرين.' },
  ],
  memo: [
    { label: 'قسم التحليل القانوني', old: 'شرط الجزاء الثابت (١٠٪) لا يصلح أساسًا للخصم.', neu: 'شرط الجزاء الثابت (١٠٪) لا يصلح أساسًا للخصم دون إثبات الضرر الفعلي، وفق المادة ١٠٤ من نظام المرافعات.' },
    { label: 'قسم الطلبات', old: 'يلتمس رفض الدعوى.', neu: 'يلتمس رفض الدعوى مع إلزام المدعي بالمصاريف وأتعاب المحاماة.' },
  ],
  research: [],
  consultation: [],
};

export function useSessionChat() {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [typingStatus, setTypingStatus] = useState('');
  const [context, setContext] = useState<string | null>(null);
  const idRef = useRef(0);
  const statusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // db session id بتاع الاستشارة (لو المستخدم مسجّل دخول) — بيتحفظ من أول
  // رد يرجع من /api/consultation/chat وبيتبعت في أي رسالة تالية عشان
  // الأسئلة التابعة تفتكر السياق (ConversationState في الباك إند).
  const consultationSessionIdRef = useRef<string | null>(null);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearInterval(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearStatusTimer(), [clearStatusTimer]);

  const startTypingCycle = useCallback((kind: TaskKind) => {
    const statuses = statusMessages[kind] ?? statusMessages.consultation;
    let si = 0;
    setTyping(true);
    setTypingStatus(statuses[0] || 'يفكّر...');
    clearStatusTimer();
    statusTimerRef.current = setInterval(() => {
      si = (si + 1) % statuses.length;
      setTypingStatus(statuses[si]);
    }, 1400);
  }, [clearStatusTimer]);

  const askConsultation = useCallback(async (text: string): Promise<SessionMessage> => {
    try {
      const res = await sendConsultationChat(text, consultationSessionIdRef.current);
      if (res.session_id) consultationSessionIdRef.current = res.session_id;
      return { id: `s-a${idRef.current++}`, role: 'assistant', text: res.reply };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ غير متوقع';
      return {
        id: `s-a${idRef.current++}`,
        role: 'assistant',
        text: `تعذّر الحصول على إجابة الاستشارة (${msg}). حاول مرة أخرى.`,
      };
    }
  }, []);

  const send = useCallback(
    (text: string, kind: TaskKind = 'consultation') => {
      const userMsg: SessionMessage = {
        id: `s-u${idRef.current++}`,
        role: 'user',
        text,
      };
      setMessages((m) => [...m, userMsg]);
      startTypingCycle(kind);

      if (kind === 'consultation') {
        askConsultation(text).then((assistantMsg) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');
          setMessages((m) => [...m, assistantMsg]);
        });
        return;
      }

      setTimeout(() => {
        clearStatusTimer();
        setTyping(false);
        setTypingStatus('');

        const pool = replies[kind] ?? replies.consultation;
        const reply = pool[Math.floor(Math.random() * pool.length)];

        const changePool = changeClauses[kind] ?? [];
        const changeCard: ChangeCard | undefined =
          changePool.length > 0 && Math.random() > 0.4
            ? (() => {
                const c = changePool[Math.floor(Math.random() * changePool.length)];
                return { section_id: c.label, section_title: c.label, old_text: c.old, new_text: c.neu };
              })()
            : undefined;

        const assistantMsg: SessionMessage = {
          id: `s-a${idRef.current++}`,
          role: 'assistant',
          text: reply,
          changeCard,
        };
        setMessages((m) => [...m, assistantMsg]);
      }, 1800 + Math.random() * 800);
    },
    [clearStatusTimer, startTypingCycle, askConsultation],
  );

  const seed = useCallback(
    (initialText: string, kind: TaskKind = 'consultation') => {
      const userMsg: SessionMessage = {
        id: `s-seed-u`,
        role: 'user',
        text: initialText,
      };

      if (kind === 'consultation') {
        let shouldSeed = false;
        setMessages((prev) => {
          if (prev.length > 0) return prev;
          shouldSeed = true;
          return [userMsg];
        });
        if (!shouldSeed) return;
        startTypingCycle(kind);
        askConsultation(initialText).then((assistantMsg) => {
          clearStatusTimer();
          setTyping(false);
          setTypingStatus('');
          setMessages((prev) => [...prev, assistantMsg]);
        });
        return;
      }

      setMessages((prev) => {
        if (prev.length > 0) return prev;
        const replyMsg: SessionMessage = {
          id: `s-seed-a`,
          role: 'assistant',
          text: replies[kind]?.[0] ?? replies.consultation[0],
        };
        return [userMsg, replyMsg];
      });
    },
    [startTypingCycle, askConsultation, clearStatusTimer],
  );

  const reset = useCallback(() => {
    clearStatusTimer();
    setMessages([]);
    setTyping(false);
    setTypingStatus('');
    setContext(null);
    consultationSessionIdRef.current = null;
  }, [clearStatusTimer]);

  const setContextLabel = useCallback((label: string | null) => {
    setContext(label);
  }, []);

  const clearContext = useCallback(() => setContext(null), []);

  return { messages, typing, typingStatus, send, seed, reset, context, setContextLabel, clearContext };
}