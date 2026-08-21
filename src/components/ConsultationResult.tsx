import { useMemo, useState } from 'react';
import { BookOpen, ChevronDown, Gavel, Scale, Sparkles } from 'lucide-react';
import type { ConsultationRouting } from '../lib/api';

export type ConsultationMeta = {
  needsClarification?: boolean;
  routing?: ConsultationRouting | null;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  consultation?: ConsultationMeta;
};

type Props = {
  messages: Message[];
  typing: boolean;
  typingStatus: string;
};

type Citation = {
  id: string;
  number: string;
  excerpt: string;
  law: string | null;
};

function getCitations(answer: string, laws: string[]): Citation[] {
  const matches = Array.from(
    answer.matchAll(/(?:المادة|مادة)\s*(?:رقم\s*)?([0-9٠-٩]+(?:\s*مكرر)?)/g),
  );
  const unique = new Set<string>();

  return matches.flatMap((match, index) => {
    const number = match[1];
    if (unique.has(number)) return [];
    unique.add(number);
    const start = Math.max(0, (match.index ?? 0) - 110);
    const end = Math.min(answer.length, (match.index ?? 0) + match[0].length + 180);
    return [{
      id: `${number}-${index}`,
      number,
      excerpt: answer.slice(start, end).trim(),
      law: laws[index] ?? laws[0] ?? null,
    }];
  });
}

function routingLabel(routing: ConsultationRouting | null | undefined): string | null {
  if (!routing) return null;
  if (routing.mode === 'confident') return 'توجيه موثوق';
  if (routing.mode === 'multi') return 'أكثر من قانون مرتبط';
  if (routing.mode === 'ambiguous') return 'بانتظار التوضيح';
  return 'مراجعة قانونية';
}

export function ConsultationResult({ messages, typing, typingStatus }: Props) {
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const assistantMessages = messages.filter((message) => message.role === 'assistant');
  const latest = assistantMessages[assistantMessages.length - 1];
  const routing = latest?.consultation?.routing;
  const laws = routing?.laws ?? routing?.candidates ?? [];
  const citations = useMemo(
    () => getCitations(latest?.text ?? '', laws),
    [latest?.text, laws],
  );
  const userMessages = messages.filter((message) => message.role === 'user');
  const latestQuestion = userMessages[userMessages.length - 1]?.text;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-7 sm:px-6 lg:px-8" dir="rtl">
      {latestQuestion && (
        <div className="mb-7 flex items-start gap-3 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-right animate-fade-up">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-xl bg-white text-primary-600 shadow-soft">
            <Scale className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="mb-0.5 text-[0.65rem] font-700 tracking-[0.16em] text-primary-600">سؤالك</div>
            <p className="text-[0.84rem] leading-7 text-primary-900">{latestQuestion}</p>
          </div>
        </div>
      )}

      {typing && (
        <div className="mb-7 rounded-[1.75rem] border border-sand-200 bg-white p-6 shadow-card animate-fade-up">
          <div className="flex items-center gap-3 text-sand-600">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-600">
              <Sparkles className="h-4 w-4 animate-pulse-soft" />
            </span>
            <div>
              <div className="text-sm font-700 text-ink">يُحضّر الرأي القانوني</div>
              <div className="mt-0.5 text-xs text-sand-500">{typingStatus || 'يراجع المراجع القانونية...'}</div>
            </div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-sand-100">
            <div className="h-full w-1/2 rounded-full bg-primary-400 animate-consultation-progress" />
          </div>
        </div>
      )}

      {latest && !typing && (
        <section className="animate-fade-up" aria-labelledby="consultation-answer-title">
          <div className="mb-3 flex items-center justify-between px-1">
            <div>
              <div className="text-[0.65rem] font-700 tracking-[0.18em] text-primary-500">الرأي القانوني</div>
              <h2 id="consultation-answer-title" className="mt-1 text-xl font-700 text-ink">الإجابة</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary-500 text-white shadow-soft">
              <Sparkles className="h-4 w-4" />
            </span>
          </div>
          <article className="rounded-[1.75rem] border border-sand-200 bg-white p-5 shadow-card sm:p-7">
            <p className="whitespace-pre-wrap break-words text-[0.96rem] leading-[2.05] text-ink sm:text-[1rem]">{latest.text}</p>
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-sand-100 pt-4">
              {routingLabel(routing) && <span className="rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-[0.68rem] font-700 text-primary-700">{routingLabel(routing)}</span>}
              {laws.map((law) => <span key={law} className="rounded-full border border-gold-100 bg-gold-50 px-3 py-1 text-[0.68rem] font-600 text-gold-700">{law}</span>)}
              {latest.consultation?.needsClarification && <span className="rounded-full border border-warning-200 bg-warning-50 px-3 py-1 text-[0.68rem] font-700 text-warning-800">يحتاج توضيحًا</span>}
            </div>
          </article>
        </section>
      )}

      {!typing && citations.length > 0 && (
        <section className="mt-9 animate-fade-up" aria-labelledby="legal-sources-title">
          <div className="mb-4 flex items-end justify-between px-1">
            <div>
              <div className="text-[0.65rem] font-700 tracking-[0.16em] text-sand-400">LEGAL REFERENCES</div>
              <h2 id="legal-sources-title" className="mt-1 text-lg font-700 text-ink">المواد القانونية</h2>
            </div>
            <span className="rounded-full bg-sand-100 px-2.5 py-1 text-[0.68rem] font-700 text-sand-600">{citations.length} استشهاد</span>
          </div>
          <div className="space-y-3">
            {citations.map((citation) => {
              const isOpen = openCitation === citation.id;
              return (
                <article key={citation.id} className="overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-soft transition-all duration-200 hover:border-primary-200 hover:shadow-card">
                  <button type="button" onClick={() => setOpenCitation(isOpen ? null : citation.id)} className="flex w-full items-center gap-3 px-4 py-4 text-right">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600"><BookOpen className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="text-sm font-700 text-ink">المادة {citation.number}</span><span className="rounded-full bg-sand-100 px-2 py-0.5 text-[0.62rem] font-600 text-sand-600">استشهاد من الإجابة</span></span>
                      {citation.law && <span className="mt-1 block truncate text-xs text-sand-500">{citation.law}</span>}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-sand-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && <div className="border-t border-sand-100 bg-sand-50/70 px-4 pb-4 pt-3"><p className="rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm leading-7 text-sand-700">{citation.excerpt}</p></div>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {!typing && laws.length > 0 && citations.length === 0 && (
        <section className="mt-9 animate-fade-up" aria-labelledby="law-routing-title">
          <div className="mb-4 px-1"><div className="text-[0.65rem] font-700 tracking-[0.16em] text-sand-400">RETRIEVED SOURCES</div><h2 id="law-routing-title" className="mt-1 text-lg font-700 text-ink">القوانين المرتبطة</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">{laws.map((law) => <div key={law} className="flex items-center gap-3 rounded-2xl border border-sand-200 bg-white p-4 shadow-soft"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-50 text-primary-600"><BookOpen className="h-4 w-4" /></span><span className="text-sm font-600 leading-6 text-ink">{law}</span></div>)}</div>
        </section>
      )}

      {!typing && latest && citations.length === 0 && laws.length === 0 && <div className="mt-7 flex items-center gap-2 px-1 text-xs text-sand-400"><Gavel className="h-3.5 w-3.5" />لم تُرجع الاستشارة مصادر تفصيلية إضافية.</div>}
    </div>
  );
}
