import { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileText, ScanSearch, BookOpenCheck, Scale,
  ShieldCheck, Lock, Zap,
} from 'lucide-react';
import { InputBar } from '../components/InputBar';
import { Badge, Logo, TypingDots } from '../components/ui';
import type { ScreenId } from '../lib/types';
import { cn } from '../lib/cn';
import type { TaskKind } from '../lib/useSessionChat';
import type { TaskType } from '../lib/types';
import { useMemory } from '../lib/memory';
import { routeMessage, type RouterResult } from '../lib/router';

const cards: {
  id: string;
  title: string;
  desc: string;
  icon: typeof FileText;
  tone: 'primary' | 'accent' | 'gold';
}[] = [
  { id: 'draft', title: 'صياغة عقد', desc: 'إنشاء عقد احترافي قابل للتعديل', icon: FileText, tone: 'primary' },
  { id: 'review', title: 'تحليل عقد', desc: 'كشف المخاطر وبنود عالية الخطورة', icon: ScanSearch, tone: 'accent' },
  { id: 'memo', title: 'مذكرة دفاع', desc: 'صياغة مذكرة دفاع متكاملة', icon: Scale, tone: 'gold' },
  { id: 'research', title: 'بحث قانوني', desc: 'بحث في القوانين والأحكام والمواد', icon: BookOpenCheck, tone: 'primary' },
];

const toneMap = {
  primary: {
    iconBg: 'bg-primary-50 text-primary-600',
    ring: 'group-hover:ring-primary-200',
    glow: 'from-primary-500/12',
    bar: 'from-primary-500 to-primary-400',
  },
  accent: {
    iconBg: 'bg-accent-50 text-accent-600',
    ring: 'group-hover:ring-accent-200',
    glow: 'from-accent-500/12',
    bar: 'from-accent-500 to-accent-400',
  },
  gold: {
    iconBg: 'bg-gold-50 text-gold-600',
    ring: 'group-hover:ring-gold-200',
    glow: 'from-gold-400/12',
    bar: 'from-gold-400 to-gold-300',
  },
};

const cardKindMap: Record<string, TaskKind> = {
  draft: 'contract', review: 'review', memo: 'memo', research: 'research',
};
const trust = [
  { icon: ShieldCheck, label: 'سرية كاملة' },
  { icon: Lock, label: 'متوافق قانونيًا' },
  { icon: Zap, label: 'تحديث آني للقوانين' },
];

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export function Landing({
  onNavigate,
  onRoute,
  onQuickAction,
}: {
  onNavigate: (s: ScreenId) => void;
  onRoute: (intent: TaskType, enrichedPrompt: string) => void;
  onQuickAction?: (kind: TaskKind) => void;
}) {
  const { addMessage, getHistoryForRouter, messages: memoryMsgs } = useMemory();

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatMode, setChatMode] = useState(false);
  const [routing, setRouting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, routing]);

  const handleCardClick = (id: string) => {
    const kind = cardKindMap[id];
    if (kind && onQuickAction) onQuickAction(kind);
  };

  const handleSend = useCallback(
    async (text: string) => {
      // 1. احفظ في memory فقط — مفتحش الشات لحد ما نعرف النتيجة
      addMessage('user', text);
      setRouting(true);

      try {
        // 2. Router Agent
        const history = getHistoryForRouter().slice(0, -1);
        const result: RouterResult = await routeMessage(text, history);

        if (result.shouldRoute) {
          // روت فوراً — الشات مفيش داعي يظهر
          onRoute(result.intent, result.enrichedPrompt);
        } else {
          // كمّل الشات — افتح وعرض المحادثة
          setChatMode(true);
          const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text };
          setChatMessages([userMsg]);
          addMessage('assistant', result.response);
          setChatMessages((prev) => [
            ...prev,
            { id: `a-${Date.now()}`, role: 'assistant', text: result.response },
          ]);
        }
      } catch {
        onRoute('consultation', text);
      } finally {
        setRouting(false);
      }
    },
    [addMessage, getHistoryForRouter, onRoute],
  );

  return (
    <div className={cn('relative min-h-full h-full overflow-y-auto')}>
      {/* ── Subtle background ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-[48rem] h-[48rem] rounded-full bg-primary-500/[0.04] blur-3xl" />
        <div className="absolute top-32 -left-24 w-[36rem] h-[36rem] rounded-full bg-gold-400/[0.03] blur-3xl" />
      </div>

      <div className={cn('relative px-6 md:px-10 lg:px-16 py-10 md:py-14', chatMode ? 'max-w-3xl mx-auto' : 'max-w-5xl mx-auto')}>
        {/* ═══ Hero — full or compact ═══ */}
        {chatMode ? (
          <div className="flex items-center gap-3 mb-6 animate-fade-up">
            <Logo size={28} />
            <div>
              <h2 className={cn('font-display font-700 text-ink text-lg leading-tight')}>
                مُحَكِّم
              </h2>
              <p className="text-sand-400 text-[0.7rem]">محادثة جديدة</p>
            </div>
            <div className="mr-auto">
              <Badge tone="primary" size="sm">جلسة قانونية</Badge>
            </div>
          </div>
        ) : (
          <div className="text-center animate-fade-up">
            <h1 className="font-display font-700 text-ink text-4xl md:text-5xl lg:text-[3.75rem] leading-[1.08] text-balance">
              أهلاً بك في{' '}
              <span
                style={{ fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif' }}
                className="text-primary-700 text-[1.15em]"
              >
                مُحَكِّم
              </span>
            </h1>
            <p className="mt-4 text-sand-600 text-base md:text-lg leading-relaxed max-w-xl mx-auto">
              نظام التشغيل الذكي للمحترفين القانونيين
            </p>
            <p className="mt-1.5 text-sand-400 text-sm font-500 tracking-wide">
              The Operating System for Legal Professionals
            </p>
            <div className="mt-5 inline-flex items-center gap-2">
              <span className="h-px w-8 bg-gradient-to-l from-gold-400 to-transparent" />
              <p className="text-[0.78rem] font-700 tracking-wide text-primary-600">
                Don't Read the Law. Shape It.
              </p>
              <span className="h-px w-8 bg-gradient-to-r from-gold-400 to-transparent" />
            </div>
          </div>
        )}

        {/* ═══ Chat messages ═══ */}
        {chatMode && (
          <div className="mb-6 space-y-3 max-w-3xl">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex animate-fade-up',
                  msg.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {msg.role === 'assistant' && (
                  <div className="grid place-items-center w-7 h-7 rounded-full bg-primary-100 text-primary-600 ml-2 shrink-0 mt-0.5">
                    <Scale className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-[0.88rem] leading-[1.85]',
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white border border-sand-200 text-ink shadow-soft',
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {routing && (
              <div className="flex justify-start animate-fade-up">
                <div className="grid place-items-center w-7 h-7 rounded-full bg-primary-100 text-primary-600 ml-2 shrink-0">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <div className="bg-white border border-sand-200 rounded-2xl px-4 py-3 shadow-soft">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* ═══ Input ═══ */}
        <div className={cn(!chatMode && 'mt-10 max-w-3xl mx-auto animate-fade-up animate-delay-200')}>
          <InputBar
            onSend={handleSend}
            onUpload={() => onNavigate('upload')}
            autoFocus
            compact={!chatMode}
            placeholder={chatMode ? 'اكتب رسالتك...' : 'ماذا تريد أن تنجز اليوم؟'}
          />
          {!chatMode && (
            <div className="mt-3.5 flex items-center justify-center gap-x-4 gap-y-1.5 flex-wrap text-[0.7rem] text-sand-400">
              {trust.map((t, i) => (
                <span key={t.label} className="flex items-center gap-1.5">
                  <t.icon className="w-3 h-3 text-primary-500" />
                  {t.label}
                  {i < trust.length - 1 && <span className="w-1 h-1 rounded-full bg-sand-300 mr-3" />}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ═══ Cards — hidden in chat mode ═══ */}
        {!chatMode && (
          <>
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
              {cards.map((c) => {
                const tone = toneMap[c.tone];
                const Icon = c.icon;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleCardClick(c.id)}
                    className="group relative text-right rounded-2xl bg-white/70 border border-sand-200 p-3.5 shadow-soft hover:shadow-card hover:-translate-y-[3px] hover:border-sand-300 transition-all duration-200 ease-out-expo overflow-hidden cursor-pointer focus-ring"
                  >
                    <div
                      className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${tone.glow} to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />
                    <div className="relative flex items-center gap-2.5">
                      <div
                        className={`grid place-items-center w-9 h-9 rounded-xl ${tone.iconBg} ring-1 ring-transparent ${tone.ring} transition-all duration-200 group-hover:scale-110`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <h3 className="font-display font-700 text-ink text-[0.88rem]">{c.title}</h3>
                    </div>
                    <p className="relative mt-2 text-[0.72rem] text-sand-500 leading-relaxed">{c.desc}</p>
                    <div className="relative mt-3 h-0.5 w-full rounded-full bg-sand-100 overflow-hidden">
                      <div className={`h-full w-0 group-hover:w-full rounded-full bg-gradient-to-l ${tone.bar} transition-all duration-500 ease-out-expo`} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-2 text-[0.72rem] text-sand-400">
              <span className="text-sand-500 font-600 ml-1">جرّب:</span>
              <Badge tone="neutral" size="sm">«راجع هذا العقد»</Badge>
              <Badge tone="neutral" size="sm">«أنشئ عقد عمل»</Badge>
              <Badge tone="neutral" size="sm">«ابحث في المادة ١٤٧»</Badge>
              <Badge tone="neutral" size="sm">«اكتب مذكرة دفاع»</Badge>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
