import { useState, useRef, useEffect, useCallback } from 'react';
import { Scale, Paperclip, ArrowUp, ChevronDown, Check, X, GitCompare, BookOpen, Pencil, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn';

export type ChangeCard = {
  section_id: string;
  section_title: string;
  old_text: string;
  new_text: string;
};

export type SessionMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  changeCard?: ChangeCard;
  warnings?: string[];
};

type Props = {
  sessionId: string;
  messages: SessionMessage[];
  onSend: (text: string) => void;
  typing?: boolean;
  typingStatus?: string;
  placeholder?: string;
  contextLabel?: string | null;
  onClearContext?: () => void;
  className?: string;
};

/* ── Map typing status text to icon ── */
function statusIcon(status: string) {
  const s = (status || '').toLowerCase();
  if (s.includes('بحث') || s.includes('مرجع')) return <BookOpen className="w-3 h-3" />;
  if (s.includes('حدث') || s.includes('نتيجة') || s.includes('صياغ') || s.includes('كتابة')) return <Pencil className="w-3 h-3" />;
  return <Scale className="w-3 h-3" />;
}

export function SessionChat({
  sessionId,
  messages,
  onSend,
  typing = false,
  typingStatus = '',
  placeholder = 'اسأل عن أي بند أو اطلب تعديلًا...',
  contextLabel,
  onClearContext,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [input, setInput] = useState('');
  const [diffModal, setDiffModal] = useState<ChangeCard | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const hasConversation = messages.length > 0 || typing;

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, typing, typingStatus, scrollToBottom]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const activePlaceholder = contextLabel
    ? `اكتب ما تريد تعديله في «${contextLabel}»...`
    : placeholder;

  /* ── Pre-conversation: minimal input bar only ── */
  if (!hasConversation) {
    return (
      <div
        className={cn(
          'shrink-0 bg-white/60 backdrop-blur-md border-t border-sand-200/60',
          className,
        )}
        data-session-chat={sessionId}
      >
        <div className="px-3 py-2.5">
          <div className="flex items-end gap-1.5 rounded-3xl bg-white border border-sand-200 focus-within:border-primary-300 focus-within:shadow-lift transition-all duration-200 ease-out-expo shadow-soft">
            <button
              className="grid place-items-center w-8 h-8 rounded-2xl text-sand-400 hover:bg-sand-50 hover:text-sand-600 transition-colors duration-200 shrink-0 mb-1 mr-1"
              title="رفع ملف"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={activePlaceholder}
              className="flex-1 resize-none bg-transparent outline-none text-ink placeholder:text-sand-400 text-[0.82rem] leading-relaxed py-2.5 max-h-[160px] transition-[height] duration-150 ease-out-expo"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              className={cn(
                'shrink-0 grid place-items-center rounded-full transition-all duration-200 ease-out-expo m-1 w-9 h-9',
                input.trim()
                  ? 'bg-primary-500 text-white shadow-soft hover:bg-primary-600 hover:scale-105'
                  : 'bg-sand-100 text-sand-300 cursor-not-allowed',
              )}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Active conversation: full chat panel slides up ── */
  return (
    <>
      <div
        className={cn(
          'shrink-0 bg-white/60 backdrop-blur-md flex flex-col transition-[height] duration-200 ease-out-expo border-t border-sand-200/60 animate-chat-reveal',
          expanded ? 'h-[220px]' : 'h-[44px]',
          className,
        )}
        data-session-chat={sessionId}
      >
        {/* ── Header ── */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between px-4 h-[44px] shrink-0 group"
        >
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-6 h-6 rounded-lg bg-primary-500 text-white shadow-soft">
              <Scale className="w-3 h-3" />
            </span>
            <div className="text-right leading-tight">
              <div className="font-display font-700 text-ink text-[0.78rem]">مساعد مُحَكَّم</div>
              <div className="text-[0.56rem] text-sand-400">اسأل عن أي بند أو اطلب تعديلًا</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {contextLabel && (
              <span className="flex items-center gap-1 rounded-full bg-primary-50 border border-primary-100 px-2 py-0.5 text-[0.58rem] font-600 text-primary-600">
                {contextLabel}
                {onClearContext && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onClearContext(); }}
                    className="cursor-pointer hover:text-primary-800"
                  >
                    <X className="w-2.5 h-2.5" />
                  </span>
                )}
              </span>
            )}
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-sand-400 transition-transform duration-200',
                expanded && 'rotate-180',
              )}
            />
          </div>
        </button>

        {expanded && (
          <>
            {/* ── Messages ── */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0 no-scrollbar">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex animate-msg-in',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  {m.role === 'assistant' && (
                    <span className="grid place-items-center w-6 h-6 rounded-full bg-primary-500 text-white shrink-0 mt-0.5 ml-1.5 shadow-soft">
                      <Scale className="w-3 h-3" />
                    </span>
                  )}
                  <div className="max-w-[80%] space-y-1">
                    <div
                      className={cn(
                        'px-3.5 py-2 text-[0.78rem] leading-[1.75] shadow-soft',
                        m.role === 'user'
                          ? 'rounded-2xl rounded-br-md bg-primary-500 text-white'
                          : 'rounded-2xl rounded-bl-md bg-white border border-sand-200 text-ink',
                      )}
                    >
                      {m.text}
                    </div>
                    {m.changeCard && (
                      <button
                        onClick={() => setDiffModal(m.changeCard!)}
                        className="w-full flex items-center gap-2 rounded-xl bg-white border border-sand-200 px-3 py-1.5 text-right hover:border-primary-200 hover:shadow-soft transition-all duration-200"
                      >
                        <span className="grid place-items-center w-5 h-5 rounded-lg bg-success/15 text-success shrink-0">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[0.72rem] font-700 text-ink leading-tight">
                            تم تعديل {m.changeCard.section_title}
                          </div>
                        </div>
                        <span className="flex items-center gap-1 text-[0.58rem] font-600 text-primary-600 shrink-0">
                          <GitCompare className="w-2.5 h-2.5" />
                          عرض
                        </span>
                      </button>
                    )}
                    {m.warnings && m.warnings.length > 0 && (
                      <div className="flex items-start gap-1.5 rounded-xl bg-warning-50/60 border border-warning-200/60 px-3 py-1.5">
                        <AlertTriangle className="w-3 h-3 text-warning-600 shrink-0 mt-0.5" strokeWidth={2} />
                        <div className="flex-1 min-w-0 space-y-0.5">
                          {m.warnings.map((w, wi) => (
                            <div key={wi} className="text-[0.66rem] text-warning-700 leading-snug">{w}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* ── Typing status ── */}
              {typing && (
                <div className="flex justify-start animate-msg-in">
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-primary-500 text-white shrink-0 mt-0.5 ml-1.5 shadow-soft">
                    <Scale className="w-3 h-3" />
                  </span>
                  <div className="rounded-2xl rounded-bl-md bg-white border border-sand-200 px-3.5 py-2 shadow-soft">
                    <span className="flex items-center gap-1.5 text-[0.76rem] text-sand-600 animate-pulse-soft">
                      <span className="text-primary-500">{statusIcon(typingStatus)}</span>
                      {typingStatus || 'يفكّر...'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Input ── */}
            <div className="shrink-0 px-3 pb-2.5 pt-1.5">
              <div className="flex items-end gap-1.5 rounded-3xl bg-white border border-sand-200 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-500/10 transition-all duration-200 shadow-soft">
                <button
                  className="grid place-items-center w-8 h-8 rounded-2xl text-sand-400 hover:bg-sand-50 hover:text-sand-600 transition-colors duration-200 shrink-0 mb-1 mr-1"
                  title="رفع ملف"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <textarea
                  ref={taRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder={activePlaceholder}
                  className="flex-1 resize-none bg-transparent outline-none text-ink placeholder:text-sand-400 text-[0.82rem] leading-relaxed py-2.5 max-h-[160px] transition-[height] duration-150 ease-out-expo"
                />
                <button
                  onClick={send}
                  disabled={!input.trim()}
                  className={cn(
                    'shrink-0 grid place-items-center rounded-full transition-all duration-200 ease-out-expo m-1 w-9 h-9',
                    input.trim()
                      ? 'bg-primary-500 text-white shadow-soft hover:bg-primary-600 hover:scale-105'
                      : 'bg-sand-100 text-sand-300 cursor-not-allowed',
                  )}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Diff Modal */}
      {diffModal && <DiffModal change={diffModal} onClose={() => setDiffModal(null)} />}
    </>
  );
}

/* ── Diff Modal ── */
function DiffModal({ change, onClose }: { change: ChangeCard; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl bg-white border border-sand-200 shadow-lift animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-sand-200">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary-50 text-primary-600">
              <GitCompare className="w-4 h-4" />
            </span>
            <div>
              <div className="font-display font-700 text-ink text-[0.9rem]">مقارنة التغيير</div>
              <div className="text-[0.62rem] text-sand-400">{change.section_title}</div>
            </div>
          </div>
          <button onClick={onClose} className="grid place-items-center w-8 h-8 rounded-lg text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[0.66rem] font-700 tracking-wide uppercase text-danger">
              <span className="w-2 h-2 rounded-full bg-danger" /> النسخة القديمة
            </div>
            <div className="rounded-2xl bg-danger-50/60 border border-danger-200/60 p-4">
              <p className="text-[0.84rem] leading-[1.95] text-sand-700 whitespace-pre-wrap">{change.old_text}</p>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2 text-[0.66rem] font-700 tracking-wide uppercase text-success">
              <span className="w-2 h-2 rounded-full bg-success" /> النسخة الجديدة
            </div>
            <div className="rounded-2xl bg-success-50/60 border border-success-200/60 p-4">
              <p className="text-[0.84rem] leading-[1.95] text-ink whitespace-pre-wrap">{change.new_text}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-sand-200 px-6 py-4">
          <button onClick={onClose} className="w-full h-11 rounded-2xl bg-sand-100 text-ink font-600 text-sm hover:bg-sand-200 transition-colors duration-200">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
