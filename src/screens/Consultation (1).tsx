import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip, Scale, X } from 'lucide-react';
import { ConsultationResult } from '../components/ConsultationResult';
import { useSessionChat } from '../lib/useSessionChat';
import type { ChatProps } from './ContractGen';

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
  const chat = embedded && chatProps
    ? {
        messages: chatProps.messages,
        typing: chatProps.typing,
        typingStatus: chatProps.typingStatus,
        send: chatProps.onSend,
        seed: () => {},
        context: chatProps.contextLabel,
        clearContext: chatProps.onClearContext,
      }
    : localChat;
  const { messages, typing, typingStatus, send, seed, context, clearContext } = chat;
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialPrompt && !embedded) seed(initialPrompt);
  }, [initialPrompt, seed, embedded]);

  const submit = () => {
    const value = input.trim();
    if (!value || typing) return;
    send(value);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-sand-50">
      <header className="shrink-0 border-b border-sand-200 bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between" dir="rtl">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-500 text-white shadow-soft">
              <Scale className="h-4 w-4" />
            </span>
            <div>
              <div className="text-[0.65rem] font-700 tracking-[0.18em] text-primary-500">استشارة قانونية</div>
              <h1 className="mt-0.5 text-lg font-700 text-ink">الرأي القانوني</h1>
            </div>
          </div>
          {context && (
            <button type="button" onClick={clearContext} className="flex max-w-[45%] items-center gap-1.5 truncate rounded-full border border-primary-100 bg-primary-50 px-3 py-1.5 text-xs font-600 text-primary-700">
              {context}
              <X className="h-3 w-3 shrink-0" />
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <ConsultationResult messages={messages} typing={typing} typingStatus={typingStatus} />
      </main>

      <div className="shrink-0 border-t border-sand-200/80 bg-white/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-sand-200 bg-white p-1.5 shadow-soft transition-all duration-200 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-500/10" dir="rtl">
          <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sand-400 transition-colors hover:bg-sand-50 hover:text-sand-600" title="رفع ملف">
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            disabled={typing}
            onChange={(event) => {
              setInput(event.target.value);
              event.target.style.height = 'auto';
              event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && input.trim()) {
                event.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={typing ? 'يُحضّر الرأي القانوني...' : 'اسأل عن أي مسألة قانونية، أو تابع استشارتك...'}
            className="max-h-[140px] flex-1 resize-none bg-transparent px-2 py-2 text-right text-sm leading-7 text-ink outline-none placeholder:text-sand-400 disabled:cursor-wait disabled:opacity-60"
          />
          <button type="button" onClick={submit} disabled={!input.trim() || typing} className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all ${input.trim() && !typing ? 'bg-primary-500 text-white shadow-soft hover:bg-primary-600' : 'bg-sand-100 text-sand-300'}`}>
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
