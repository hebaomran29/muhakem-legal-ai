import { useState, useEffect } from 'react';
import {
  X,
  Scale,
  FileText,
  Check,
  AlertTriangle,
  XCircle,
  FileBarChart,
} from 'lucide-react';
import { DocumentToolbar } from '../components/DocumentToolbar';
import { SessionChat } from '../components/SessionChat';
import { useSessionChat } from '../lib/useSessionChat';
import { contractClauses } from '../lib/mock';
import { cn } from '../lib/cn';
import type { Clause, RiskLevel, ScreenId } from '../lib/types';
import type { ChatProps } from './ContractGen';
import { Report } from './Report';

/* ── Highlighter colors — like marker over paper ── */
const hlNormal: Record<RiskLevel, string> = {
  safe: 'rgba(187, 247, 208, 0.45)',
  review: 'rgba(253, 230, 138, 0.5)',
  risk: 'rgba(254, 205, 211, 0.4)',
};
const hlHover: Record<RiskLevel, string> = {
  safe: 'rgba(187, 247, 208, 0.62)',
  review: 'rgba(253, 230, 138, 0.68)',
  risk: 'rgba(254, 205, 211, 0.57)',
};
const hlActive: Record<RiskLevel, string> = {
  safe: 'rgba(134, 239, 172, 0.55)',
  review: 'rgba(252, 211, 77, 0.6)',
  risk: 'rgba(253, 164, 175, 0.5)',
};

const riskMeta: Record<RiskLevel, { label: string; tone: string; icon: React.ReactNode; chip: string }> = {
  safe: { label: 'سليم', tone: 'text-success-700', icon: <Check className="w-4 h-4" />, chip: 'bg-success-50 text-success-600' },
  review: { label: 'يحتاج مراجعة', tone: 'text-warning-700', icon: <AlertTriangle className="w-4 h-4" />, chip: 'bg-warning-50 text-warning-600' },
  risk: { label: 'عالي المخاطر', tone: 'text-rose-700', icon: <XCircle className="w-4 h-4" />, chip: 'bg-rose-50 text-rose-600' },
};

const barColor: Record<RiskLevel, string> = {
  safe: 'bg-success-500',
  review: 'bg-warning-500',
  risk: 'bg-rose-500',
};

const dotColor: Record<RiskLevel, string> = {
  safe: 'bg-success-500',
  review: 'bg-warning-500',
  risk: 'bg-rose-500',
};

const preamble =
  'إنه في يوم الاثنين الموافق ١٥/٠٦/١٤٤٧هـ، بين: شركة الأفق للتجارة ذ.م.م، ممثلة بمديرها التنفيذي السيد/ خالد بن عبدالله العتيبي (يُشار إليه بـ «الطرف الأول»)، وبين السيد/ عمر بن سعيد الحربي، يحمل الهوية الوطنية رقم ……… (يُشار إليه بـ «الطرف الثاني»). وقد اتفق الطرفان على ما يلي:';

export function Review({
  initialPrompt,
  onNavigate,
  embedded = false,
  chatProps,
}: {
  initialPrompt?: string;
  onNavigate?: (s: ScreenId) => void;
  embedded?: boolean;
  chatProps?: ChatProps;
}) {
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const localChat = useSessionChat();
  const { messages, typing, typingStatus, send, seed, context, setContextLabel, clearContext } =
    embedded && chatProps
      ? { ...chatProps, send: chatProps.onSend, context: chatProps.contextLabel, seed: () => {}, setContextLabel: chatProps.setContextLabel ?? (() => {}), clearContext: chatProps.onClearContext ?? (() => {}) }
      : localChat;

  useEffect(() => {
    if (initialPrompt && !embedded) seed(initialPrompt);
  }, [initialPrompt, seed, embedded]);

  const active = contractClauses.find((c) => c.id === openId) ?? null;
  const handleClose = () => setOpenId(null);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  const handleClick = (c: Clause) => {
    setOpenId(c.id);
    setContextLabel(`البند ${c.number} — ${c.title}`);
  };

  return (
    <div className="h-full flex flex-col bg-sand-100/40">
      {/* ── Thin toolbar ── */}
      <div className="shrink-0 border-b border-sand-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <DocumentToolbar
            editing={editing}
            onToggleEdit={() => setEditing((v) => !v)}
            onReport={onNavigate ? () => onNavigate('report') : undefined}
            showReport={!!onNavigate}
          />
          <button
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 rounded-xl bg-accent-500 text-white px-3.5 h-9 text-[0.78rem] font-600 hover:bg-accent-600 transition-colors shadow-soft"
            title="تقرير"
          >
            <FileBarChart className="w-4 h-4" />
            <span>تقرير</span>
          </button>
        </div>
      </div>

      {/* ── Document ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <article className="bg-white rounded-[2px] border border-sand-200/50 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_6px_20px_rgba(0,0,0,0.05)] overflow-hidden animate-fade-up">
            {/* Header */}
            <div className="text-center pt-9 pb-5 border-b border-sand-100">
              <h1 className="font-display font-700 text-ink text-[1.4rem] tracking-tight">
                عقد عمل فردي
              </h1>
              <p className="mt-1 text-[0.7rem] text-sand-400">
                بموجب أنظمة العمل المرعية
              </p>
            </div>

            {/* Body — continuous paragraphs */}
            <div className="px-10 md:px-14 py-7 font-sans text-[0.9rem] text-ink leading-[2.15] text-justify">
              <p className="text-center leading-[2] mb-5 text-ink/85">{preamble}</p>

              <div className="space-y-2.5">
                {contractClauses.map((c) => {
                  const isActive = openId === c.id;
                  const isHover = hoverId === c.id;
                  const bg = isActive
                    ? hlActive[c.status]
                    : isHover
                      ? hlHover[c.status]
                      : hlNormal[c.status];

                  return (
                    <p key={c.id} className="leading-[2.15]">
                      <span
                        className={cn(
                          'inline-block w-1.5 h-1.5 rounded-full mr-1.5 -mb-0.5 transition-opacity',
                          dotColor[c.status],
                          isActive || isHover ? 'opacity-100' : 'opacity-40',
                        )}
                      />
                      <span
                        onClick={() => handleClick(c)}
                        onMouseEnter={() => setHoverId(c.id)}
                        onMouseLeave={() => setHoverId(null)}
                        className="box-decoration-clone rounded-[2px] px-1 -mx-0.5 cursor-pointer transition-[background-color] duration-100"
                        style={{ backgroundColor: bg }}
                      >
                        <span className="font-700 text-ink">
                          البند {c.number}: {c.title}.{' '}
                        </span>
                        {c.body}
                      </span>
                    </p>
                  );
                })}
              </div>

              {/* Signature */}
              <div className="pt-7 mt-6 border-t border-sand-100">
                <p className="text-center text-[0.78rem] text-sand-500 mb-5">
                  حُرر هذا العقد من نسختين أصليتين، يعتد بكل منهما حجةً قانونية
                </p>
                <div className="grid grid-cols-2 gap-10">
                  {['الطرف الأول', 'الطرف الثاني'].map((party) => (
                    <div key={party} className="text-center space-y-2.5">
                      <p className="text-[0.76rem] font-700 text-ink">{party}</p>
                      <div className="h-12 rounded-lg border-2 border-dashed border-sand-200 grid place-items-center text-[0.68rem] text-sand-400">
                        التوقيع والختم
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center pt-6 text-[0.62rem] text-sand-300">— ١ —</div>
            </div>
          </article>
        </div>
      </div>

      {/* ── Popup over the text ── */}
      {active && <ClausePopup clause={active} onClose={handleClose} />}

      {/* ── Report overlay ── */}
      {showReport && (
        <ReportOverlay onClose={() => setShowReport(false)} onNavigate={onNavigate} />
      )}

      <SessionChat
        sessionId={embedded ? 'workspace' : 'review'}
        messages={messages}
        typing={typing}
        typingStatus={typingStatus}
        onSend={send}
        placeholder="اسأل عن مخاطر هذا العقد... أو اطلب تعديل بند..."
        contextLabel={context}
        onClearContext={clearContext}
      />
    </div>
  );
}

/* ── Report overlay — full-screen slide-in ── */
function ReportOverlay({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate?: (s: ScreenId) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-sand-100 animate-fade-in overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-sand-200">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <span className="text-[0.78rem] font-700 text-sand-500">تقرير</span>
          <button
            onClick={onClose}
            className="grid place-items-center w-8 h-8 rounded-xl text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <Report onNavigate={(s) => { if (s === 'review') onClose(); else onNavigate?.(s); }} />
    </div>
  );
}

/* ── Popup — only reason, legal article, risk score ── */
function ClausePopup({ clause, onClose }: { clause: Clause; onClose: () => void }) {
  const meta = riskMeta[clause.status];

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 grid place-items-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white border border-sand-200 shadow-lift animate-scale-in overflow-hidden">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 border-b border-sand-100">
            <div className="min-w-0">
              <div className="text-[0.58rem] font-700 tracking-[0.16em] text-sand-400 uppercase mb-1">
                البند {clause.number}
              </div>
              <h2 className="font-display font-700 text-ink text-[1.05rem] leading-tight">
                {clause.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="shrink-0 grid place-items-center w-8 h-8 rounded-xl text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Risk level + score */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <span className={cn('grid place-items-center w-9 h-9 rounded-xl', meta.chip)}>
                  {meta.icon}
                </span>
                <div>
                  <div className="text-[0.56rem] font-700 tracking-wide uppercase text-sand-400">
                    مستوى الخطورة
                  </div>
                  <div className={cn('text-[0.85rem] font-700 leading-tight', meta.tone)}>
                    {meta.label}
                  </div>
                </div>
              </div>

              <div className="text-left">
                <div className="text-[0.56rem] font-700 tracking-wide uppercase text-sand-400 mb-1">
                  درجة الخطورة
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-sand-200 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', barColor[clause.status])}
                      style={{ width: `${clause.riskScore}%` }}
                    />
                  </div>
                  <span className="text-[0.8rem] font-700 text-ink tnum">{clause.riskScore}%</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-sand-100" />

            {/* Reason only */}
            {clause.reason ? (
              <div>
                <div className="text-[0.58rem] font-700 tracking-wide uppercase text-sand-400 mb-2">
                  سبب التصنيف
                </div>
                <p className="text-[0.84rem] leading-[1.95] text-sand-700">{clause.reason}</p>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 rounded-xl bg-success-50 px-4 py-3">
                <Check className="w-4 h-4 text-success-600 shrink-0" />
                <p className="text-[0.82rem] font-600 text-success-700">
                  هذا البند سليم ولا يحتاج تعديل.
                </p>
              </div>
            )}

            {/* Legal article + basis */}
            {clause.legalRef && (
              <div className="flex items-start gap-2.5 rounded-xl bg-primary-50/70 border border-primary-100/60 px-4 py-3">
                <Scale className="w-4 h-4 text-primary-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <div>
                    <div className="text-[0.56rem] font-700 tracking-wide uppercase text-sand-400">
                      المرجع
                    </div>
                    <p className="text-[0.8rem] font-600 text-primary-700 leading-relaxed">
                      {clause.legalRef}
                    </p>
                  </div>
                  {clause.legalBasis && (
                    <div>
                      <div className="text-[0.56rem] font-700 tracking-wide uppercase text-sand-400">
                        الأساس القانوني
                      </div>
                      <p className="text-[0.78rem] text-sand-700 leading-[1.8]">
                        {clause.legalBasis}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
