import { useEffect } from 'react';
import { Scale } from 'lucide-react';
import { SessionChat } from '../components/SessionChat';
import { useSessionChat } from '../lib/useSessionChat';
import type { ChatProps } from './ContractGen';

/* ══════════════════════════════════════════════════════════════
   Consultation — استشارة قانونية تفاعلية (محادثة حقيقية مع
   legal_agent.py عبر /api/consultation/chat، من غير أي كروت نتائج
   بحث ثابتة). دي شاشة منفصلة عن Research.tsx (البحث القانوني) —
   الاتنين كانوا بيتشاركوا نفس الشاشة قبل كده وده كان سبب اللخبطة
   بين "استشارة" و"بحث" في الواجهة.

   لو embedded (الحالة العادية جوه Workspace): بتستخدم chatProps
   الجاي من فوق (اللي فيه الرسايل الحقيقية من legal_agent.py، وأول
   سؤال بيتزرع مرة واحدة من Workspace.handleThinkingComplete عبر
   chat.seed — مش من هنا، عشان نتجنب أي seed مزدوج).

   لو مش embedded (استخدام مستقل مستقبلي): بتدير useSessionChat خاصة
   بيها وتزرع initialPrompt بنفسها — بالظبط نفس نمط Research.tsx. */
export function Consultation({
  initialPrompt,
  embedded = false,
  chatProps,
}: {
  initialPrompt?: string;
  embedded?: boolean;
  chatProps?: ChatProps;
}) {
  const localChat = useSessionChat();
  const { messages, typing, typingStatus, send, seed, context, clearContext } =
    embedded && chatProps
      ? { ...chatProps, send: chatProps.onSend, context: chatProps.contextLabel, seed: () => {}, clearContext: chatProps.onClearContext ?? (() => {}) }
      : localChat;

  useEffect(() => {
    if (initialPrompt && !embedded) seed(initialPrompt);
  }, [initialPrompt, seed, embedded]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-sand-50">
      <div className="shrink-0 px-6 md:px-10 py-5 bg-white border-b border-sand-200">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <span className="grid place-items-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600">
            <Scale className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[0.7rem] font-700 tracking-[0.18em] text-primary-500 uppercase leading-tight">
              استشارة قانونية
            </div>
            <h1 className="font-display font-700 text-ink text-base leading-tight">الرأي القانوني</h1>
          </div>
        </div>
      </div>

      <SessionChat
        sessionId={embedded ? 'workspace' : 'consultation'}
        messages={messages}
        typing={typing}
        typingStatus={typingStatus}
        onSend={send}
        placeholder="اسأل عن أي مسألة قانونية، أو تابعي استشارتك..."
        contextLabel={context}
        onClearContext={clearContext}
      />
    </div>
  );
}
