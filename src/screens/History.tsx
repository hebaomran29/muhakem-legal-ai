import {
  FileText,
  Scale,
  Gavel,
  Book,
  Search,
  Pin,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  CircleDashed,
  Calendar,
} from 'lucide-react';
import { Badge } from '../components/ui';
import { cn } from '../lib/cn';
import type { ScreenId, ChatKind } from '../lib/types';
import { useSessions, type SessionCard } from '../lib/sessionStore';
import { useState, useMemo } from 'react';

const kindMeta: Record<ChatKind, { icon: typeof FileText; tone: 'primary' | 'accent' | 'gold' | 'neutral'; label: string }> = {
  'contract-review': { icon: FileText, tone: 'accent', label: 'مراجعة عقد' },
  'contract-gen': { icon: FileText, tone: 'primary', label: 'صياغة عقد' },
  memo: { icon: Book, tone: 'gold', label: 'مذكرة دفاع' },
  research: { icon: Scale, tone: 'primary', label: 'بحث قانوني' },
  case: { icon: Gavel, tone: 'neutral', label: 'قضية' },
};

const toneStyles = {
  primary: { bg: 'bg-primary-50', text: 'text-primary-600', ring: 'group-hover:ring-primary-200', bar: 'from-primary-500 to-primary-400' },
  accent:  { bg: 'bg-accent-50',  text: 'text-accent-600',  ring: 'group-hover:ring-accent-200',  bar: 'from-accent-500 to-accent-400' },
  gold:    { bg: 'bg-gold-50',    text: 'text-gold-600',    ring: 'group-hover:ring-gold-200',    bar: 'from-gold-400 to-gold-300' },
  neutral: { bg: 'bg-sand-100',   text: 'text-sand-600',    ring: 'group-hover:ring-sand-200',    bar: 'from-sand-400 to-sand-300' },
};

const filterLabels: Record<string, ChatKind | null> = {
  'الكل': null,
  'مثبّتة': null, // handled specially
  'مراجعة عقد': 'contract-review',
  'مذكرة دفاع': 'memo',
  'بحث قانوني': 'research',
  'صياغة عقد': 'contract-gen',
};

const filters = Object.keys(filterLabels);

/** يرجّع النص النسبي للتاريخ */
function relativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return 'اليوم';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'اليوم';
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 7) return `قبل ${days} أيام`;
  if (days < 30) return `قبل ${Math.floor(days / 7)} أسبوع`;
  return `قبل ${Math.floor(days / 30)} شهر`;
}

function timeOnly(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

export function History({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const { sessions, togglePin, remove } = useSessions();
  const [filter, setFilter] = useState('الكل');
  const [search, setSearch] = useState('');
  const [opening, setOpening] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = sessions;

    // Filter by kind
    if (filter !== 'الكل' && filter !== 'مثبّتة') {
      const targetKind = filterLabels[filter];
      if (targetKind) result = result.filter((s) => s.kind === targetKind);
    }

    // Filter pinned
    if (filter === 'مثبّتة') {
      result = result.filter((s) => s.pinned);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.preview.toLowerCase().includes(q) ||
          s.meta.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }

    return result;
  }, [sessions, filter, search]);

  const handleOpen = (session: SessionCard) => {
    setOpening(session.id);
    setTimeout(() => {
      // افتح الجلسة عن طريق dispatch event
      window.dispatchEvent(
        new CustomEvent('muhakem-open-session', { detail: session }),
      );
      onNavigate('landing');
      setTimeout(() => setOpening(null), 600);
    }, 350);
  };

  return (
    <div className="h-full overflow-y-auto px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 animate-fade-up">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-700 text-ink text-2xl md:text-3xl">سجل المحادثات</h1>
              <span className="text-[0.7rem] font-700 text-sand-500 bg-sand-100 rounded-full px-2.5 py-1 tnum">
                {sessions.length} جلسة
              </span>
            </div>
            <p className="text-sand-500 text-sm mt-1">كل جلساتك القانونية محفوظة — يمكن إعادة فتح أي جلسة</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white border border-sand-200 px-3 h-10 w-64 shadow-soft">
            <Search className="w-4 h-4 text-sand-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في السجل..."
              className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-sand-400"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-sand-400 hover:text-ink">
                <span className="text-xs">✕</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6 animate-fade-up animate-delay-100">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-full px-3.5 h-9 text-[0.78rem] font-600 transition-all',
                filter === f
                  ? 'bg-primary-500 text-white shadow-soft'
                  : 'bg-white border border-sand-200 text-sand-600 hover:bg-sand-50',
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {filtered.map((session) => {
            const m = kindMeta[session.kind] || kindMeta['contract-gen'];
            const Icon = m.icon;
            const tone = toneStyles[m.tone];
            const isPinned = session.pinned;
            const isOpening = opening === session.id;

            return (
              <div
                key={session.id}
                onClick={() => handleOpen(session)}
                className={cn(
                  'group relative text-right rounded-2xl bg-white border border-sand-200 p-5 shadow-soft cursor-pointer overflow-hidden',
                  'transition-all duration-200 ease-out-expo',
                  'hover:shadow-card hover:-translate-y-0.5 hover:border-sand-300',
                  isOpening && 'scale-[0.97] opacity-50',
                )}
              >
                {/* Glow */}
                <div
                  className={cn(
                    'pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                    tone.bar,
                  )}
                  style={{ maskImage: 'radial-gradient(circle, black 40%, transparent 70%)' }}
                />

                {/* Top row: icon + title + pin */}
                <div className="relative flex items-start gap-3">
                  <div
                    className={cn(
                      'grid place-items-center w-11 h-11 rounded-2xl shrink-0 ring-1 ring-transparent transition-all duration-200 group-hover:scale-105',
                      tone.bg,
                      tone.text,
                      tone.ring,
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-700 text-ink text-[0.98rem] truncate">{session.title}</h3>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral" size="sm">{m.label}</Badge>
                      {session.tags.map((tag) => (
                        <Badge key={tag} tone="gold" size="sm">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                  {/* Pin + Delete buttons */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePin(session.id); }}
                      className={cn(
                        'grid place-items-center w-8 h-8 rounded-lg transition-all duration-200 shrink-0',
                        isPinned
                          ? 'text-gold-400 hover:bg-gold-50'
                          : 'text-sand-300 hover:bg-sand-100 hover:text-sand-500',
                      )}
                      title={isPinned ? 'إلغاء التثبيت' : 'تثبيت الجلسة'}
                    >
                      <Pin className={cn('w-3.5 h-3.5', isPinned && 'fill-gold-400')} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(session.id); }}
                      className="grid place-items-center w-8 h-8 rounded-lg text-sand-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="حذف الجلسة"
                    >
                      <span className="text-sm">✕</span>
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <p className="relative mt-3 text-[0.82rem] text-sand-600 leading-relaxed">{session.preview}</p>

                {/* Meta row */}
                <div className="relative mt-4 pt-3 border-t border-sand-200 flex items-center justify-between gap-2">
                  {/* Left: status */}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.66rem] font-600',
                      'bg-success/8 text-success',
                    )}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    مكتملة
                  </span>

                  {/* Right: dates */}
                  <div className="flex items-center gap-3 text-[0.66rem] text-sand-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {relativeDate(session.createdAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeOnly(session.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Hover bar */}
                <div className="relative mt-3 h-0.5 w-full rounded-full bg-sand-100 overflow-hidden">
                  <div className={cn('h-full w-0 group-hover:w-full rounded-full bg-gradient-to-l transition-all duration-500 ease-out-expo', tone.bar)} />
                </div>

                {/* Open hint */}
                <div className="relative mt-2.5 flex items-center justify-end">
                  <span className="flex items-center gap-1 text-[0.72rem] font-600 text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    فتح الجلسة <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16 text-sand-400">
            <Search className="w-8 h-8 mx-auto mb-3" />
            <p className="text-sm">{sessions.length === 0 ? 'لا توجد جلسات بعد — ابدأ بمهمة جديدة' : 'لا توجد جلسات مطابقة'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
