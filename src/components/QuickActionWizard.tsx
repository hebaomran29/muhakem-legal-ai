import { useState } from 'react';
import { X, ChevronLeft, Sparkles } from 'lucide-react';
import { cn } from '../lib/cn';
import type { TaskKind } from '../lib/useSessionChat';

export interface WizardStep {
  id: string;
  question: string;
  hint?: string;
  placeholder: string;
  options?: string[];
}

const wizardConfig: Record<TaskKind, { title: string; steps: WizardStep[] }> = {
  contract: {
    title: 'صياغة عقد',
    steps: [
      {
        id: 'type',
        question: 'ما نوع العقد؟',
        hint: 'اختر النوع الأقرب أو اكتب نوعًا مخصصًا',
        placeholder: 'مثال: عقد عمل، عقد إيجار، عقد شراكة...',
        options: ['عقد عمل', 'عقد إيجار', 'عقد شراكة', 'عقد مقاولة', 'عقد توريد'],
      },
      {
        id: 'parties',
        question: 'من هم أطراف العقد؟',
        hint: 'اذكر الطرف الأول والطرف الثاني',
        placeholder: 'مثال: شركة الأفق للتجارة — السيد عمر الحربي',
      },
      {
        id: 'keyTerms',
        question: 'ما الشروط الأساسية؟',
        hint: 'المدة، الأجر، وعد المنافسة، أو أي شروط خاصة',
        placeholder: 'مثال: مدة سنة، أجر ١٨٠٠٠ ريال شهريًا...',
      },
    ],
  },
  review: {
    title: 'مراجعة عقد',
    steps: [
      {
        id: 'doc',
        question: 'ما العقد المراد مراجعته؟',
        hint: 'صف العقد أو الصق نصه',
        placeholder: 'الصق نص العقد هنا، أو اصفه...',
        options: ['لصق نص العقد', 'رفع ملف العقد'],
      },
      {
        id: 'focus',
        question: 'ما الذي تريد التركيز عليه؟',
        hint: 'حدد المخاطر أو البنود التي تهمك',
        placeholder: 'مثال: البنود المالية، حماية البيانات...',
        options: ['مراجعة شاملة', 'البنود المالية', 'بنود الإنهاء', 'بنود المسؤولية'],
      },
    ],
  },
  memo: {
    title: 'مذكرة دفاع',
    steps: [
      {
        id: 'case',
        question: 'ما موضوع القضية؟',
        hint: 'صف طبيعة الدعوى والأطراف',
        placeholder: 'مثال: دعوى مطالبة مالية — مدعي ضد شركة...',
      },
      {
        id: 'court',
        question: 'أمام أي محكمة؟',
        hint: 'المحكمة والدائرة إن وجدت',
        placeholder: 'مثال: محكمة التنفيذ بالرياض',
        options: ['محكمة عامة', 'محكمة تنفيذ', 'محكمة تجارية', 'محكمة عمالية'],
      },
      {
        id: 'position',
        question: 'ما موقفك في القضية؟',
        hint: 'هل أنت مدعى عليه أم مدعي؟ وما الدفوع الأساسية؟',
        placeholder: 'مثال: مدعى عليه — الدفع بانعدام الشرط الجزائي...',
      },
    ],
  },
  research: {
    title: 'بحث قانوني',
    steps: [
      {
        id: 'topic',
        question: 'ما موضوع البحث؟',
        hint: 'اكتب السؤال القانوني أو المادة',
        placeholder: 'مثال: المادة ١٤٧ من القانون المدني',
      },
      {
        id: 'scope',
        question: 'ما نطاق البحث؟',
        hint: 'حدد نوع المصادر التي تريد',
        placeholder: 'اختر النطاق',
        options: ['كل المصادر', 'المواد القانونية', 'الأحكام القضائية', 'القضايا المشابهة'],
      },
    ],
  },
  consultation: {
    title: 'استشارة قانونية',
    steps: [
      {
        id: 'question',
        question: 'ما سؤالك القانوني؟',
        hint: 'اكتب استشارتك بالتفصيل',
        placeholder: 'مثال: ما حكم الشرط الجزائي في عقد العمل؟',
      },
    ],
  },
};

export function QuickActionWizard({
  kind,
  onClose,
  onComplete,
}: {
  kind: TaskKind;
  onClose: () => void;
  onComplete: (data: Record<string, string>, kind: TaskKind) => void;
}) {
  const config = wizardConfig[kind];
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const step = config.steps[stepIdx];
  const isLast = stepIdx === config.steps.length - 1;
  const currentAnswer = answers[step.id] ?? '';

  const canProceed = currentAnswer.trim().length > 0;

  const handleNext = () => {
    if (!canProceed) return;
    if (isLast) {
      onComplete(answers, kind);
    } else {
      setStepIdx((i) => i + 1);
    }
  };

  const handleBack = () => {
    if (stepIdx === 0) {
      onClose();
    } else {
      setStepIdx((i) => i - 1);
    }
  };

  const setAnswer = (val: string) => {
    setAnswers((a) => ({ ...a, [step.id]: val }));
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/30 backdrop-blur-sm animate-fade-in z-40"
        onClick={onClose}
      />

      {/* Wizard panel */}
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto relative w-full max-w-lg rounded-3xl bg-white border border-sand-200 shadow-lift animate-scale-in overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-sand-200 bg-gradient-to-l from-primary-50/50 to-white">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-primary-500 text-white shadow-soft">
                <Sparkles className="w-4 h-4" />
              </span>
              <div>
                <div className="font-display font-700 text-ink text-[0.92rem] leading-tight">{config.title}</div>
                <div className="text-[0.62rem] text-sand-400">
                  الخطوة {stepIdx + 1} من {config.steps.length}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid place-items-center w-8 h-8 rounded-lg text-sand-400 hover:bg-sand-100 hover:text-ink transition-colors duration-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Progress dots */}
          {config.steps.length > 1 && (
            <div className="flex items-center gap-1.5 px-6 pt-4">
              {config.steps.map((s, i) => (
                <div
                  key={s.id}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-200',
                    i === stepIdx ? 'flex-1 bg-primary-500' : i < stepIdx ? 'w-6 bg-primary-300' : 'w-6 bg-sand-200',
                  )}
                />
              ))}
            </div>
          )}

          {/* Body */}
          <div className="px-6 py-6">
            <div key={step.id} className="animate-fade-up">
              <h3 className="font-display font-700 text-ink text-lg leading-tight">{step.question}</h3>
              {step.hint && (
                <p className="mt-1.5 text-[0.78rem] text-sand-500">{step.hint}</p>
              )}

              {/* Options */}
              {step.options && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {step.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswer(opt)}
                      className={cn(
                        'px-3.5 py-2 rounded-xl text-[0.8rem] font-600 border transition-all duration-200',
                        currentAnswer === opt
                          ? 'bg-primary-500 text-white border-primary-500 shadow-soft'
                          : 'bg-white text-sand-700 border-sand-200 hover:border-primary-300 hover:bg-primary-50/40',
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Text input */}
              <div className={cn('mt-4', step.options && currentAnswer && !step.options.includes(currentAnswer) && '')}>
                <textarea
                  value={step.options && step.options.includes(currentAnswer) ? '' : currentAnswer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={step.placeholder}
                  rows={3}
                  autoFocus
                  dir="rtl"
                  className={cn(
                    'w-full resize-none rounded-2xl bg-sand-50 border border-sand-200 px-4 py-3 text-[0.86rem] text-ink placeholder:text-sand-400 outline-none transition-all duration-200',
                    'focus:border-primary-300 focus:bg-white focus:ring-2 focus:ring-primary-500/10',
                  )}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-sand-200 bg-sand-50/50">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-[0.82rem] font-600 text-sand-600 hover:text-ink transition-colors duration-200"
            >
              <ChevronLeft className="w-4 h-4 rotate-180" />
              {stepIdx === 0 ? 'إلغاء' : 'السابق'}
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className={cn(
                'flex items-center gap-2 h-10 px-5 rounded-xl font-600 text-[0.84rem] transition-all duration-200',
                canProceed
                  ? 'bg-primary-500 text-white hover:bg-primary-600 shadow-soft active:scale-[0.98]'
                  : 'bg-sand-100 text-sand-400 cursor-not-allowed',
              )}
            >
              {isLast ? 'ابدأ الآن' : 'متابعة'}
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
