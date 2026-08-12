import { useEffect, useState } from 'react';
import {
  UploadCloud,
  FileText,
  ScanLine,
  ListTree,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '../components/ui';
import { cn } from '../lib/cn';
import type { ScreenId } from '../lib/types';

const stages = [
  { id: 'upload', label: 'رفع الملف', sub: 'Uploading', icon: UploadCloud, dur: 900 },
  { id: 'ocr', label: 'التعرف الضوئي', sub: 'OCR Complete', icon: ScanLine, dur: 1100 },
  { id: 'extract', label: 'استخراج البنود', sub: 'Clause Extraction', icon: ListTree, dur: 1000 },
  { id: 'analyze', label: 'التحليل الذكي', sub: 'AI Analysis', icon: Sparkles, dur: 1200 },
  { id: 'validate', label: 'التحقق', sub: 'Validation', icon: ShieldCheck, dur: 900 },
];

export function Upload({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const [stage, setStage] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (stage >= stages.length) {
      setDone(true);
      return;
    }
    const t = setTimeout(() => setStage((s) => s + 1), stages[stage].dur);
    return () => clearTimeout(t);
  }, [stage]);

  const progress = Math.min(100, Math.round((stage / stages.length) * 100));

  return (
    <div className="relative h-full overflow-y-auto flex items-center justify-center px-6 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 right-1/4 w-[32rem] h-[32rem] rounded-full bg-primary-500/6 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[26rem] h-[26rem] rounded-full bg-gold-400/6 blur-3xl" />
      </div>
      <div className="relative w-full max-w-2xl">
        {/* File card */}
        <div className="relative rounded-3xl bg-white border border-sand-200 shadow-card card-sheen overflow-hidden animate-fade-up">
          {/* top strip */}
          <div className="h-1.5 w-full bg-sand-100 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-primary-500 via-primary-400 to-gold-400 transition-all duration-700 ease-out-expo relative"
              style={{ width: `${progress}%` }}
            >
              <span className="absolute inset-0 bg-gradient-to-l from-transparent via-white/40 to-transparent animate-shimmer" />
            </div>
          </div>

          <div className="p-6 md:p-8">
            <div className="flex items-start gap-4">
              <div className="relative grid place-items-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 text-primary-600 shrink-0">
                <FileText className="w-7 h-7" />
                {!done && (
                  <span className="absolute inset-0 rounded-2xl ring-2 ring-primary-300/50 animate-ping" />
                )}
                {done && (
                  <span className="absolute -top-1 -left-1 grid place-items-center w-5 h-5 rounded-full bg-success text-white ring-2 ring-white animate-pop">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-700 text-ink text-[1.05rem] truncate">
                  عقد_شراكة_شركة_XYZ.pdf
                </div>
                <div className="text-[0.75rem] text-sand-500 mt-0.5 flex items-center gap-2">
                  <span>٢٫٤ ميجابايت</span>
                  <span className="w-1 h-1 rounded-full bg-sand-300" />
                  <span>٧ بنود</span>
                  <span className="w-1 h-1 rounded-full bg-sand-300" />
                  <span>PDF</span>
                </div>
              </div>
              <div className="text-left">
                <div className="text-[0.7rem] font-600 text-sand-500">التقدّم</div>
                <div className="font-display font-700 text-primary-600 text-lg tnum">{progress}%</div>
              </div>
            </div>

            {/* Stages */}
            <div className="mt-7 space-y-2.5">
              {stages.map((s, i) => {
                const Icon = s.icon;
                const isDone = i < stage;
                const isActive = i === stage;
                const isPending = i > stage;
                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-3.5 py-3 transition-all duration-500',
                      isActive && 'bg-primary-50',
                      isDone && 'opacity-70',
                      isPending && 'opacity-40',
                    )}
                  >
                    <div
                      className={cn(
                        'grid place-items-center w-9 h-9 rounded-xl shrink-0 transition-all duration-500',
                        isDone && 'bg-success text-white',
                        isActive && 'bg-primary-500 text-white',
                        isPending && 'bg-sand-100 text-sand-400',
                      )}
                    >
                      {isDone ? (
                        <Check className="w-4 h-4 animate-pop" />
                      ) : isActive ? (
                        <Icon className="w-4 h-4 animate-pulse-soft" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div
                        className={cn(
                          'text-[0.88rem] font-600',
                          isDone && 'text-ink',
                          isActive && 'text-primary-700',
                          isPending && 'text-sand-500',
                        )}
                      >
                        {s.label}
                      </div>
                      <div className="text-[0.68rem] text-sand-400 tracking-wide">{s.sub}</div>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-pulse-soft" />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-pulse-soft" style={{ animationDelay: '0.2s' }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-400 animate-pulse-soft" style={{ animationDelay: '0.4s' }} />
                      </div>
                    )}
                    {isDone && (
                      <span className="text-[0.66rem] font-600 text-success bg-success-50 px-2 py-0.5 rounded-full">
                        تم
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Done state */}
            {done && (
              <div className="mt-6 rounded-2xl bg-gradient-to-l from-primary-50 to-gold-50 border border-primary-100 p-4 animate-fade-up">
                <div className="flex items-center gap-3">
                  <div className="grid place-items-center w-10 h-10 rounded-full bg-success text-white animate-pop">
                    <Check className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-display font-700 text-ink">اكتمل التحليل</div>
                    <div className="text-[0.75rem] text-sand-600">
                      تم استخراج ٧ بنود · ٢ عالي المخاطر · ٢ يحتاج مراجعة
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    iconRight={<ArrowLeft className="w-4 h-4" />}
                    onClick={() => onNavigate('review')}
                  >
                    فتح العقد
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-5 text-center text-[0.72rem] text-sand-400">
          تتم معالجة المستندات محليًا وبسرية تامة — لا تُشارك مع أي طرف خارجي
        </p>
      </div>
    </div>
  );
}
