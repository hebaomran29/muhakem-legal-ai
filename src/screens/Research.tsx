import { useState, useEffect } from 'react';
import { Scale, BookMarked, FileText, Send, Layers, MessageSquare } from 'lucide-react';
import { Badge } from '../components/ui';
import { SessionChat, type SessionMessage } from '../components/SessionChat';
import { useSessionChat } from '../lib/useSessionChat';
import { cn } from '../lib/cn';
import type { ChatProps } from './ContractGen';

type ResultType = 'law' | 'ruling' | 'case';

interface Result {
  id: string;
  type: ResultType;
  match: number;
  title: string;
  excerpt: string;
  source: string;
}

const mockResults: Result[] = [
  {
    id: 'r1',
    type: 'law',
    match: 98,
    title: 'المادة ١٤٧ من القانون المدني',
    excerpt: 'العقد شريعة المتعاقدين، فلا يجوز نقضه ولا تعديله إلا باتفاق الطرفين أو لأسباب يقررها القانون.',
    source: 'القانون المدني المصري',
  },
  {
    id: 'r2',
    type: 'ruling',
    match: 95,
    title: 'حكم محكمة النقض رقم ٢٠٢١/٤٥١',
    excerpt: 'أجازت المحكمة تقييد شرط الجزاء إذا جاوز قيمة الضرر الفعلي.',
    source: 'محكمة النقض — الدائرة المدنية',
  },
  {
    id: 'r3',
    type: 'law',
    match: 92,
    title: 'المادة ٢٢٠ من القانون المدني',
    excerpt: 'إذا لم يتعين الاتفاق على تعويض وجب القضاء بالتعويض عن الضرر الفعلي.',
    source: 'القانون المدني المصري',
  },
  {
    id: 'r4',
    type: 'case',
    match: 88,
    title: 'قضية مشابهة — شرط الجزاء التعسفي',
    excerpt: 'قضت المحكمة الابتدائية بتخفيض شرط الجزاء من ٥٠٠٠ جنيه إلى ٢٠٠٠ جنيه استناداً للمادة ١٩٠.',
    source: 'محكمة الجيزة الابتدائية',
  },
  {
    id: 'r5',
    type: 'law',
    match: 84,
    title: 'المادة ١٩٠ من القانون المدني',
    excerpt: 'يجوز للقاضي أن يخفض مقدار التعويض الاتفاقي إذا أثبت المدين أن التقدير كان مبالغاً فيه.',
    source: 'القانون المدني المصري',
  },
  {
    id: 'r6',
    type: 'ruling',
    match: 79,
    title: 'حكم محكمة الاستئناف رقم ٢٠٢٣/١١٢',
    excerpt: 'أكدت المحكمة أن شرط الجزاء يُطبق بحده الأقصى عند الإخلال الجسيم بالعقد.',
    source: 'محكمة استئناف القاهرة',
  },
];

type FilterTab = 'all' | 'law' | 'ruling' | 'case';

const tabs: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'law', label: 'مواد قانونية' },
  { id: 'ruling', label: 'أحكام قضائية' },
  { id: 'case', label: 'قضايا مشابهة' },
];

const typeConfig: Record<ResultType, {
  badge: string;
  badgeTone: 'primary' | 'danger' | 'warning';
  icon: React.ReactNode;
  bar: string;
}> = {
  law: {
    badge: 'مادة قانونية',
    badgeTone: 'primary',
    icon: <Scale className="w-4 h-4 text-primary-500" />,
    bar: 'bg-primary-500',
  },
  ruling: {
    badge: 'حكم قضائي',
    badgeTone: 'danger',
    icon: <BookMarked className="w-4 h-4 text-danger-500" />,
    bar: 'bg-danger-500',
  },
  case: {
    badge: 'قضية مشابهة',
    badgeTone: 'warning',
    icon: <FileText className="w-4 h-4 text-warning-500" />,
    bar: 'bg-warning-500',
  },
};

export function Research({ initialPrompt, embedded = false, chatProps }: { initialPrompt?: string; embedded?: boolean; chatProps?: ChatProps }) {
  const [query, setQuery] = useState(initialPrompt ?? '');
  const [submitted, setSubmitted] = useState(!!initialPrompt);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const localChat = useSessionChat();
  const { messages, typing, typingStatus, send, seed, context, setContextLabel, clearContext } =
    embedded && chatProps
      ? { ...chatProps, send: chatProps.onSend, context: chatProps.contextLabel, seed: () => {}, setContextLabel: chatProps.setContextLabel ?? (() => {}), clearContext: chatProps.onClearContext ?? (() => {}) }
      : localChat;

  useEffect(() => {
    if (initialPrompt && !embedded) {
      setQuery(initialPrompt);
      setSubmitted(true);
      seed(initialPrompt);
    }
  }, [initialPrompt, seed, embedded]);

  const handleSubmit = () => {
    if (!query.trim()) return;
    setSubmitted(true);
    setActiveTab('all');
    seed(query);
  };

  const filtered = submitted
    ? mockResults.filter((r) => activeTab === 'all' || r.type === activeTab)
    : [];

  return (
    <div className="h-full flex flex-col overflow-hidden bg-sand-50">
      {/* Search header */}
      <div className="shrink-0 px-6 md:px-10 py-8 bg-white border-b border-sand-200">
        <div className="max-w-2xl mx-auto text-center">
          <div className="text-[0.7rem] font-700 tracking-[0.2em] text-primary-500 uppercase mb-1">بحث قانوني</div>
          <h1 className="font-display font-700 text-ink text-2xl mb-1">البحث القانوني</h1>
          <p className="text-sand-500 text-sm mb-6">ابحث في القوانين والأحكام أو اطلب استشارة قانونية</p>

          {/* Search box */}
          <div className="relative flex items-center rounded-2xl border-2 border-primary-400 bg-white shadow-card focus-within:border-primary-500 transition-colors duration-200">
            <input
              type="text"
              dir="rtl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="اكتب سؤالك القانوني أو استشارتك..."
              className="flex-1 bg-transparent outline-none text-ink placeholder:text-sand-400 text-[0.95rem] px-5 py-3.5 text-right"
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!query.trim()}
              className={cn(
                'shrink-0 grid place-items-center w-10 h-10 rounded-xl m-1.5 transition-all duration-200',
                query.trim()
                  ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-soft'
                  : 'bg-sand-100 text-sand-400 cursor-not-allowed',
              )}
            >
              <Send className="w-4 h-4" style={{ transform: 'scaleX(-1)' }} />
            </button>
          </div>
        </div>
      </div>

      {submitted && (
        <>
          {/* Filter tabs + meta */}
          <div className="shrink-0 px-6 md:px-10 py-3 border-b border-sand-200 bg-white/80 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
              {/* Tabs */}
              <div className="flex items-center gap-1.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-full text-[0.75rem] font-600 transition-all duration-200',
                      activeTab === t.id
                        ? 'bg-primary-500 text-white shadow-soft'
                        : 'bg-sand-100 text-sand-600 hover:bg-sand-200',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Meta */}
              <div className="flex items-center gap-2.5 text-[0.72rem] text-sand-500">
                <span>{filtered.length} نتيجة</span>
                <span className="w-px h-3 bg-sand-300" />
                <button className="flex items-center gap-1 text-primary-600 font-600 hover:text-primary-700 transition-colors duration-200">
                  <Layers className="w-3 h-3" />
                  RAG فعّال
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6 min-h-0">
            <div className="max-w-2xl mx-auto space-y-3">
              {filtered.map((r, i) => {
                const cfg = typeConfig[r.type];
                return (
                  <div
                    key={r.id}
                    className="group relative bg-white rounded-2xl border border-sand-200 shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all duration-200 ease-out-expo overflow-hidden animate-fade-up cursor-pointer"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="px-5 pt-4 pb-5">
                      {/* Top row */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="grid place-items-center w-8 h-8 rounded-xl bg-sand-50 border border-sand-200 group-hover:scale-110 transition-transform duration-200">
                            {cfg.icon}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={cfg.badgeTone} size="sm">{cfg.badge}</Badge>
                          <span className={cn(
                            'text-[0.7rem] font-700 px-2 py-0.5 rounded-full',
                            r.type === 'law' && 'bg-primary-50 text-primary-600',
                            r.type === 'ruling' && 'bg-danger-50 text-danger-600',
                            r.type === 'case' && 'bg-warning-50 text-warning-600',
                          )}>
                            تطابق {r.match}%
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="font-display font-700 text-ink text-[0.95rem] text-right mb-1.5">
                        {r.title}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-[0.83rem] text-sand-600 leading-relaxed text-right">
                        {r.excerpt}
                      </p>

                      {/* Source */}
                      <div className="mt-3 text-[0.68rem] text-sand-400 text-right">
                        {r.source}
                      </div>
                    </div>

                    {/* Bottom bar */}
                    <div className={cn('h-1 w-full', cfg.bar)} />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Empty state */}
      {!submitted && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <span className="grid place-items-center w-16 h-16 rounded-2xl bg-primary-50 text-primary-400 mb-4">
            <MessageSquare className="w-7 h-7" />
          </span>
          <h2 className="font-display font-700 text-ink text-lg mb-1.5">ابدأ بحثك أو استشارتك القانونية</h2>
          <p className="text-sand-500 text-sm max-w-sm">
            اكتب سؤالًا قانونيًا أو استشارة — سيبحث محكم في المواد والأحكام ويجيبك مباشرة.
          </p>
        </div>
      )}

      {/* Assistant Dock */}
      <SessionChat
        sessionId={embedded ? 'workspace' : 'research'}
        messages={messages}
        typing={typing}
        typingStatus={typingStatus}
        onSend={send}
        placeholder="اسأل عن نتيجة هذا البحث... أو تابع استشارتك... أو اطلب مصادر إضافية..."
        contextLabel={context}
        onClearContext={clearContext}
      />
    </div>
  );
}
