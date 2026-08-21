import { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Scale,
  FileText,
  Check,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { DocumentToolbar } from '../components/DocumentToolbar';
import { SessionChat } from '../components/SessionChat';
import { useSessionChat } from '../lib/useSessionChat';
import { pollReviewJob, uploadReviewFile } from '../lib/api';
import type { ReviewResult } from '../lib/api';
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

export function Review({
  initialPrompt,
  onNavigate,
  embedded = false,
  chatProps,
  reviewData: initialReviewData = null,
  sourceText: initialSourceText = '',
  filename: initialFilename = '',
  onReviewComplete,
}: {
  initialPrompt?: string;
  onNavigate?: (s: ScreenId) => void;
  embedded?: boolean;
  chatProps?: ChatProps;
  reviewData?: ReviewResult | null;
  sourceText?: string;
  filename?: string;
  onReviewComplete?: (sessionId: string, result: ReviewResult, sourceText: string, filename: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewResult | null>(initialReviewData);
  const [sourceText, setSourceText] = useState(initialSourceText);
  const [filename, setFilename] = useState(initialFilename);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localChat = useSessionChat();
  const { messages, typing, typingStatus, send, seed, context, setContextLabel, clearContext } =
    embedded && chatProps
      ? { ...chatProps, send: chatProps.onSend, context: chatProps.contextLabel, seed: () => {}, setContextLabel: chatProps.setContextLabel ?? (() => {}), clearContext: chatProps.onClearContext ?? (() => {}) }
      : localChat;

  useEffect(() => {
    if (initialPrompt && !embedded) seed(initialPrompt);
  }, [initialPrompt, seed, embedded]);

  useEffect(() => {
    setReviewData(initialReviewData);
    setSourceText(initialSourceText);
    setFilename(initialFilename);
  }, [initialReviewData, initialSourceText, initialFilename]);

  const clauses: Clause[] = (reviewData?.clauses ?? []).map((clause, index) => ({
    id: `${clause.number}-${index}`,
    number: clause.number,
    title: clause.title,
    body: clause.excerpt,
    status: clause.status,
    riskScore: clause.risk_score,
    reason: clause.reason,
    decision: clause.recommendation,
    legalRef: clause.legal_ref ?? '',
    legalBasis: clause.legal_basis ?? '',
    recommendation: clause.recommendation,
  }));
  const active = clauses.find((c) => c.id === openId) ?? null;
  const handleClose = () => setOpenId(null);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setReviewData(null);
    setSourceText('');
    setFilename(file.name);
    setUploadProgress(0);
    setUploadStage('رفع الملف');
    try {
      const { job_id } = await uploadReviewFile(file);
      const completed = await pollReviewJob(job_id, (progress) => {
        setUploadProgress(Math.round((progress.progress ?? 0) * 100));
        setUploadStage(progress.stage || 'جارٍ المعالجة');
      });
      if (!completed.result) throw new Error('لم تصل نتيجة المراجعة');
      setReviewData(completed.result);
      setSourceText(completed.source_text ?? '');
      onReviewComplete?.(completed.session_id, completed.result, completed.source_text ?? '', file.name);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'فشلت مراجعة الملف');
    } finally {
      setUploading(false);
    }
  }, [onReviewComplete]);

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
            showReport={false}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,.csv,.png,.jpg,.jpeg,.tif,.tiff,.webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.currentTarget.value = '';
            }}
          />
          <button
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl bg-accent-500 text-white px-3.5 h-9 text-[0.78rem] font-600 hover:bg-accent-600 disabled:opacity-50 transition-colors shadow-soft"
          >
            <FileText className="w-4 h-4" />
            <span>{uploading ? `${uploadProgress}%` : 'رفع عقد للمراجعة'}</span>
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
                {reviewData?.title || filename || 'مراجعة عقد'}
              </h1>
              <p className="mt-1 text-[0.7rem] text-sand-400">
                {reviewData ? `درجة المخاطر العامة: ${reviewData.overall_score}%` : 'ارفعي ملفًا لبدء المراجعة القانونية'}
              </p>
            </div>

            {/* Body — extracted source and analyzed clauses */}
            <div className="px-10 md:px-14 py-7 font-sans text-[0.9rem] text-ink leading-[2.15] text-justify">
              {uploading && (
                <div className="mb-5 rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-primary-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>{uploadStage || 'جارٍ معالجة الملف'}</span>
                    <span className="font-700">{uploadProgress}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-primary-100 overflow-hidden"><div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              )}
              {uploadError && <div className="mb-5 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-rose-700 text-sm">{uploadError}</div>}
              {!reviewData && !uploading && (
                <div className="py-16 text-center text-sand-500">اختاري ملف PDF أو Word أو صورة لبدء مراجعة حقيقية.</div>
              )}
              {reviewData && sourceText && <p className="text-center leading-[2] mb-5 text-ink/85 whitespace-pre-wrap">{sourceText}</p>}

              <div className="space-y-2.5">
                {clauses.map((c) => {
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
