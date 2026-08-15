import { useEffect, useRef, useState, useCallback } from 'react';
import { Check, Info, Scale, AlertCircle } from 'lucide-react';
import type { TaskType } from '../lib/types';
import { cn } from '../lib/cn';
import { createMemoJob, pollMemoJob, type JobProgress, type MemoResult, type GenerateMemoRequest, createContractJob, pollContractJob, type ContractResult, type ContractJobProgress } from '../lib/api';

/* ════════════════════════════════════════════════
   Legal wisdoms per task type
   ════════════════════════════════════════════════ */
const wisdoms: Record<TaskType, string[]> = {
  contract: [
    'العقد القوي لا يكتبه من يعرف القانون فقط...\nبل من يتوقع الخلاف قبل حدوثه.',
    'وضوح البنود يمنع كثيرًا من النزاعات المستقبلية.',
    'كل بند اليوم...\nقد يصبح دليلًا غدًا.',
    'العقد شريعة المتعاقدين...\nلكن العدالة فوق كل عقد.',
    'البنك البسيط الواضح...\nأقوى من البند المعقّد المبهم.',
    'من يملك التفصيل...\nيملك الاتفاق.',
    'العقد الجيد...\nيحمي الطرفين لا أن يغلب أحدهما.',
    'الشرط الجزائي العادل...\nيردع ولا يظلم.',
    'كل شرط غامض...\nهو باب مفتوح للنزاع.',
    'لا توقّع عقدًا...\nإلا وأنت تتخيل أسوأ سيناريو.',
    'صياغة العقد فن...\nقبل أن تكون قانونًا.',
    'الالتزامات المتبادلة...\nهي عمود العقد الفقري.',
    'شرط الإنهاء المسبق...\nيحمي الطرف الأضعف من المفاجآت.',
    'لا يكفي أن يكون العقد صحيحًا...\nبل أن يكون قابلًا للتنفيذ.',
    'كل مصطلح فني في العقد...\nيحتاج تعريفًا واضحًا لا يحتمل تأويلًا.',
    'العقد الذي يُقرأ مرة ويُفهم بالكامل...\nهو العقد الناجح.',
    'ملحقات العقد...\nجزء منه لا استثناء عليه.',
    'شرط الاختصاص القضائي...\nيوفر عليك رحلة تقاضٍ طويلة.',
    'التوازن بين الحقوق والالتزامات...\nهو ما يصنع عقدًا يدوم.',
    'القوة القاهرة...\nيجب تعريفها لا افتراض فهمها.',
    'كل تعديل شفهي على العقد...\nكأنه لم يكن ما لم يُوثَّق.',
    'شرط السرية الغامض...\nلا يحمي أحدًا وقت الحاجة.',
    'مدة العقد وشروط التجديد...\nيجب أن تُكتب بلا لبس.',
    'الضمانات في العقد...\nهي الثقة مكتوبة.',
    'من يهمل تعريف "الإخلال الجوهري"...\nيترك الباب لتفسيرات متعددة.',
    'العقد التجاري الجيد...\nيوازن بين المرونة والحماية.',
    'بند تسوية المنازعات...\nيوفر وقتًا وتكلفة قبل أن يبدأ النزاع أصلًا.',
    'الأجل المحدد بدقة...\nيمنع خلافًا لاحقًا حول تفسير "المعقول".',
    'كل التزام مالي في العقد...\nيحتاج آلية دفع واضحة لا افتراضات.',
    'العقد المُحكم لا يُثقل بالتفاصيل...\nبل يوضّح الجوهري منها فقط.',
    'شرط حظر التنافس...\nيجب أن يكون متناسبًا لا مبالغًا فيه.',
    'التزام السرية بعد انتهاء العقد...\nيحتاج مدة محددة لا "إلى الأبد".',
    'من يوقّع دون قراءة الملاحق...\nيوقّع على مجهول.',
    'العقد الذي يحدد آلية الإخطار بدقة...\nيقطع الطريق على ادعاء "لم أُبلَّغ".',
    'كل بند استثنائي...\nيحتاج صياغة استثنائية لا نسخًا من قالب جاهز.',
  ],
  review: [
    'كل بند غامض...\nهو نزاع مؤجل.',
    'المراجعة القانونية تبحث عن المخاطر...\nقبل الأخطاء.',
    'أفضل العقود...\nهي التي لا تحتاج إلى تفسير.',
    'المخاطر الخفية...\nهي الأخطر.',
    'المراجعة ليست ترفًا...\nبل ضرورة.',
    'لا تثق في عقد...\nحتى تراجعه.',
    'البنود المتوازنة...\nهي التي تصمد.',
    'الثغرة الصغيرة...\nقد تكلفك الكثير.',
    'المراجع الجيد...\nيقرأ ما بين السطور لا السطور فقط.',
    'كل شرط جزائي مبالغ فيه...\nقابل للطعن أمام القضاء.',
    'المراجعة تحمي من الغد...\nلا من الأمس.',
  ],
  memo: [
    'ترتيب الوقائع... قد يكون أقوى من كثرة الدفوع.',
    'ابدأ بما يثبت الحقيقة... ثم انتقل إلى القانون.',
    'أفضل مذكرة... هي التي تجعل القاضي يفهم القضية من أول صفحة.',
    'الدفع الشكلي القوي... يغني عن عشرة دفوع موضوعية ضعيفة.',
    'لا تدفع بما لا تملك دليله... فالثقة الزائفة تكشف نفسها.',
    'كل تناقض في الأوراق... فرصة للدفاع لا تُهدر.',
    'الاستشهاد الدقيق... أقوى من الاستشهاد الكثير.',
    'القانون يُقرأ بعين الواقعة... لا بعين القالب الجاهز.',
    'الشك يُفسَّر لمصلحة المتهم... وهذا ما نبنيه سطراً سطراً.',
    'الوقائع تُروى مرة واحدة... فلتكن الرواية دقيقة.',
    'لكل جريمة ركنها الخاص... ولكل ركن دفعه المناسب.',
    'الطلبات الختامية... هي ما يبقى في ذهن القاضي.',
    'العدالة لا تُبنى على الخطابة... بل على الدليل المحكم.',
    'من يفهم أركان الجريمة جيداً... يعرف أين يهدمها.',
    'البطلان لا يُطلب... بل يُثبت.',
    'القاضي يبحث عن المنطق... لا عن الحماس وحده.',
    'الحقيقة القانونية... هي ما تصمد أمام النقض.',
    'دفاع بلا سند... كسيف بلا حد.',
    'لا تترك للمحكمة... أن تستنتج ما لم تذكره.',
    'الدليل الذي لا يُقدَّم...\nكأنه لم يكن.',
    'المتهم بريء حتى تُثبت إدانته...\nوالقاعدة لا تُناقَش بل تُطبَّق.',
    'أقوى دفوع الدفاع...\nتلك التي تنهي الخصومة لا أن تؤجلها.',
    'من يملك الوقائع...\nيملك القضية.',
    'القانون أداة...\nوليس غاية.',
    'لا تُضيّع وقت المحكمة...\nفيما لا يفيد موكّلك.',
    'المحامي الجيد...\nيكتب مذكرته والقاضي يوافقه لا يخالفه.',
    'النية هي جوهر الجريمة...\nومن يُثبت انتفاءها فقد فكّ الرباط.',
    'لا تُقدّم دفعًا موضوعيًا...\nإلا بعد أن تُحكم الدفوع الشكلية.',
    'شهادة الشهود متى تعارضت...\nيُقدّم العدل.',
    'أحكام النقض ليست مجرد سابقة...\nبل هي تفسير ملزم.',
    'الدفع بعدم القبول...\nيُغنيك عن مناقشة الموضوع.',
    'لا تبدأ بالدفع الضعيف...\nلأنه يُضعف ما بعده.',
    'القاعدة: لا يجوز للقاضي...\nأن يتجاوز طلبات الخصوم.',
    'المستندات تتحدث...\nحتى لو صمت الشهود.',
    'من يقرأ ملف القضية مرتين...\nيكتشف ما لم يراه أحد.',
    'كل كلمة في المذكرة...\nيجب أن تحمل وزنًا قانونيًا.',
    'الإيجاز في الدفاع...\nدليل على قوة الحجة.',
    'لا تترك سؤالاً بلا إجابة...\nإلا إذا كانت الإجابة تضرّ.',
  ],
  research: [
    'ليس كل حكم يصلح للاستدلال.',
    'التشابه في الوقائع...\nأهم من تشابه الكلمات.',
    'القانون لا يُقرأ...\nبل يُفهم في سياقه.',
    'المادة القانونية الواحدة...\nقد تحمل عشرين تفسيرًا.',
    'الأحكام السابقة...\nبوصلة المحامي.',
    'لا تستشهد بحكم...\nإلا بعد قراءته كاملًا.',
    'القانون المتخصص...\nلا يُفهم بالبحث العام.',
    'من يبحث بمنهجية...\nيجد ما يبحث عنه أسرع.',
    'السابقة القضائية...\nأقوى من الرأي الفقهي.',
    'حكم النقض المستقر...\nيرجّح على حكم استئناف منفرد.',
    'البحث الدقيق...\nيوفر وقت المرافعة كلها.',
  ],
  consultation: [
    'الرأي القانوني الجيد...\nيبدأ بفهم السؤال.',
    'كل استشارة...\nيجب أن تستند إلى مرجع.',
    'وضوح الرأي...\nيمنع كثيرًا من النزاعات.',
    'لا تُعطِ رأيًا قطعيًا...\nفي مسألة تحتمل أكثر من تفسير.',
    'الاستشارة الوقائية...\nأرخص من الدعوى.',
    'أحيانًا أفضل النصائح...\nألا تتقدم.',
    'القاعدة العامة...\nتحتاج استثناءات مقنّعة.',
    'من يسأل بدقة...\nيحصل على إجابة دقيقة.',
    'الرأي القانوني بلا مصدر...\nمجرد وجهة نظر.',
    'أفضل استشارة...\nهي التي تمنع المشكلة قبل وقوعها.',
  ],
};

const taskTitle: Record<TaskType, string> = {
  contract:    'صياغة عقد',
  review:       'مراجعة عقد',
  memo:         'إعداد مذكرة دفاع',
  research:     'بحث قانوني',
  consultation: 'استشارة قانونية',
};

/* ════════════════════════════════════════════════
   Timing constants
   ════════════════════════════════════════════════ */
const TYPE_SPEED   = 45;   // ms per character
const HOLD_AFTER   = 1000; // pause after typing completes
const FADE_MS      = 200;  // fade in/out
const READY_HOLD   = 500;  // "تم إعداد النتيجة" hold before transition
const GROUP_SIZE   = 3;    // phrases per group
const POLL_INTERVAL = 3000; // ms between polls

/* ════════════════════════════════════════════════
   Pick N random phrases from a pool, no repeats
   within a single group.
   ════════════════════════════════════════════════ */
function pickRandom(pool: string[], n: number, exclude: Set<string>): string[] {
  const available = pool.filter((w) => !exclude.has(w));
  const source = available.length >= n ? available : pool;
  const copy = [...source];
  const out: string[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/* ════════════════════════════════════════════════
   Component
   ════════════════════════════════════════════════ */
type ThinkingProps = {
  task: TaskType;
  prompt: string;
  onComplete: (result: MemoResult | ContractResult, jobId: string, dbSessionId: string | null) => void;
  onError?: (message: string) => void;
};

export function Thinking({ task, prompt, onComplete, onError }: ThinkingProps) {
  const title = taskTitle[task];
  const pool = wisdoms[task];

  const [typedText, setTypedText] = useState('');
  const [phase, setPhase] = useState<'typing' | 'holding' | 'fading' | 'ready'>('typing');
  const [showReady, setShowReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [stage, setStage] = useState<string>('');

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completedRef = useRef(false);
  const groupQueue = useRef<string[]>([]);
  const usedRef = useRef<Set<string>>(new Set());
  const groupIdx = useRef(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const schedule = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  /* ── Type a single phrase, then advance ── */
  const typePhrase = useCallback((wisdom: string, onDone: () => void) => {
    const chars = wisdom.split('');
    setTypedText('');
    setPhase('typing');

    chars.forEach((_, ci) => {
      schedule(() => setTypedText(wisdom.slice(0, ci + 1)), ci * TYPE_SPEED);
    });

    const totalType = chars.length * TYPE_SPEED;
    schedule(() => setPhase('holding'), totalType);
    schedule(onDone, totalType + HOLD_AFTER);
  }, [schedule]);

  /* ── Run a group of phrases, then pick the next group ── */
  const runGroup = useCallback((group: string[], onGroupDone: () => void) => {
    let i = 0;
    const next = () => {
      if (i >= group.length) {
        onGroupDone();
        return;
      }
      const w = group[i];
      typePhrase(w, () => {
        i++;
        // fade out between phrases within the group (except last)
        if (i < group.length) {
          setPhase('fading');
          schedule(() => next(), FADE_MS);
        } else {
          next();
        }
      });
    };
    next();
  }, [schedule, typePhrase]);

  /* ── Start a new random group ── */
  const startNextGroup = useCallback(() => {
    const group = pickRandom(pool, GROUP_SIZE, usedRef.current);
    group.forEach((w) => usedRef.current.add(w));
    // reset used set if we've exhausted most of the pool
    if (usedRef.current.size >= pool.length - 1) {
      usedRef.current = new Set();
    }
    groupQueue.current = group;
    groupIdx.current = 0;
    runGroup(group, () => {
      // small fade between groups, then loop
      setPhase('fading');
      schedule(() => startNextGroup(), FADE_MS);
    });
  }, [pool, runGroup, schedule]);

  /* ── Fire the job + start polling ── */
  useEffect(() => {
    let abortController: AbortController | null = null;
    let done = false;

    // Only memo & contract use the backend job flow.
    if (task !== 'memo' && task !== 'contract') {
      // Other tasks: keep the old fixed-duration behavior.
      startNextGroup();
      schedule(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete({ sections: [], case_metadata: {}, memo: '' }, '', null);
      }, 3200);
      return () => clearTimers();
    }

    // Memo: fire the job immediately, then poll.
    if (task === 'memo') {
    (async () => {
      try {
        const req: GenerateMemoRequest = { raw_text: prompt };
        const { job_id, db_session_id } = await createMemoJob(req);
        abortController = new AbortController();
        const result = await pollMemoJob(
          job_id,
          (p) => {
            if (p.progress !== undefined) setProgress(p.progress);
            if (p.stage) setStage(p.stage);
          },
          { intervalMs: POLL_INTERVAL, signal: abortController.signal },
        );
        if (done) return;
        done = true;
        setPhase('fading');
        setShowReady(true);
        schedule(() => setPhase('ready'), FADE_MS + 100);
        schedule(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete(result.result ?? { sections: [], case_metadata: {}, memo: '' }, job_id, db_session_id);
          }
        }, FADE_MS + 100 + READY_HOLD);
      } catch (err) {
        if (done) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        done = true;
        const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
        setErrorMsg(msg);
        clearTimers();
        onError?.(msg);
      }
    })();
    startNextGroup();
    return () => {
      done = true;
      abortController?.abort();
      clearTimers();
    };
    }

    // Contract: fire the job, poll, then complete.
    (async () => {
      try {
        const { job_id, db_session_id } = await createContractJob(prompt);
        abortController = new AbortController();
        const result = await pollContractJob(
          job_id,
          (p: ContractJobProgress) => {
            if (p.progress !== undefined) setProgress(p.progress);
            if (p.stage) setStage(p.stage);
          },
          { intervalMs: POLL_INTERVAL, signal: abortController.signal },
        );
        if (done) return;
        done = true;
        setPhase('fading');
        setShowReady(true);
        schedule(() => setPhase('ready'), FADE_MS + 100);
        schedule(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete(result.result ?? { contract_text: '', preamble: '', closing: '', clauses: [], contract_type_key: null, contract_type_ar: '', clause_validation: null, docx_path: null }, job_id, db_session_id);
          }
        }, FADE_MS + 100 + READY_HOLD);
      } catch (err) {
        if (done) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        done = true;
        const msg = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
        setErrorMsg(msg);
        clearTimers();
        onError?.(msg);
      }
    })();
    startNextGroup();

    return () => {
      done = true;
      abortController?.abort();
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFading = phase === 'fading';

  return (
    <div
      className="h-full w-full flex items-center justify-center overflow-hidden relative"
      dir="rtl"
      style={{ background: 'linear-gradient(170deg, #1a1410 0%, #2a1f17 40%, #322318 70%, #241813 100%)' }}
    >
      {/* Wood grain */}
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
        style={{
          backgroundImage: `
            repeating-linear-gradient(94deg, transparent 0px, transparent 42px, rgba(0,0,0,0.06) 42px, rgba(0,0,0,0.06) 43px),
            repeating-linear-gradient(176deg, transparent 0px, transparent 110px, rgba(0,0,0,0.03) 110px, rgba(0,0,0,0.03) 111px)
          `,
        }}
      />
      {/* Warm light */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(212,168,67,0.08) 0%, transparent 65%)' }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.4) 100%)' }}
      />

      {/* ═══ Card ═══ */}
      <div
        className="card-enter relative z-10 bg-white"
        style={{
          width: 'min(440px, 90vw)',
          borderRadius: '24px',
          boxShadow: '0 2px 6px rgba(15,76,92,0.06), 0 18px 48px rgba(15,76,92,0.12), 0 32px 80px -20px rgba(0,0,0,0.35)',
          padding: '2.5rem 2.5rem 1.5rem',
        }}
      >
        {/* ── Logo ── */}
        <div className="flex flex-col items-center mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-gold-500" strokeWidth={1.5} />
            <h2
              className="text-primary-700 text-[1.35rem] font-700 leading-none"
              style={{ fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif' }}
            >
              مُحَكَّم
            </h2>
          </div>
          <p
            className="text-sand-400 text-[0.72rem] tracking-wide"
            style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
          >
            {title}
          </p>
        </div>

        {/* ── Title ── */}
        <h3
          className="text-center text-ink text-[0.92rem] font-600 mb-4"
          style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
        >
          {errorMsg ? (
            <span className="text-danger">تعذّر إعداد الطلب</span>
          ) : (
            <>جارٍ تجهيز طلبك<span className="animate-blink">...</span></>
          )}
        </h3>

        {/* ── Wisdom / error box ── */}
        <div
          className="relative rounded-2xl bg-sand-50 border border-sand-200 px-5 py-4 mb-4"
          style={{ minHeight: '120px' }}
        >
          {/* Label */}
          <div className="flex items-center justify-center gap-1.5 mb-2.5">
            {errorMsg ? (
              <AlertCircle className="w-3.5 h-3.5 text-danger" strokeWidth={1.5} />
            ) : (
              <Scale className="w-3.5 h-3.5 text-gold-500" strokeWidth={1.5} />
            )}
            <span
              className={cn(
                'text-[0.72rem] font-600 tracking-wide',
                errorMsg ? 'text-danger' : 'text-gold-700',
              )}
              style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
            >
              {errorMsg ? 'حدث خطأ' : 'حكمة قانونية'}
            </span>
          </div>

          {/* Content — typewriter or error or ready */}
          <div className="flex items-center justify-center min-h-[60px]">
            {errorMsg ? (
              <p
                className="text-center text-[0.86rem] leading-[1.75] text-danger font-500"
                style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
              >
                {errorMsg}
              </p>
            ) : !showReady ? (
              <p
                className={cn(
                  'text-center text-[1.27rem] leading-[1.85] font-600 whitespace-pre-line',
                  phase === 'typing' && 'wisdom-fade-in',
                  isFading && 'wisdom-fade-out',
                )}
                style={{
                  fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif',
                  color: '#2a1a0e',
                }}
              >
                {typedText}
                {phase === 'typing' && (
                  <span className="inline-block w-0.5 h-4 bg-gold-500 mr-0.5 animate-blink align-middle" />
                )}
              </p>
            ) : (
              <div className="ready-fade-in flex items-center gap-2">
                <span className="grid place-items-center w-5 h-5 rounded-full bg-success/15">
                  <Check className="w-3 h-3 text-success" strokeWidth={3} />
                </span>
                <span
                  className="text-[0.88rem] font-600 text-primary-700"
                  style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
                >
                  تم إعداد النتيجة
                </span>
              </div>
            )}
          </div>

          {/* ── Progress bar (optional, shown when backend reports progress) ── */}
          {!errorMsg && !showReady && progress > 0 && (
            <div className="mt-3">
              <div className="h-1 rounded-full bg-sand-200 overflow-hidden">
                <div
                  className="h-full bg-gold-500 transition-all duration-500 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              {stage && (
                <div
                  className="mt-1.5 text-center text-[0.62rem] text-sand-400"
                  style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
                >
                  {stage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer disclaimer ── */}
        <div className="flex items-start justify-center gap-1.5 pt-1">
          <Info className="w-3 h-3 text-sand-400 shrink-0 mt-0.5" strokeWidth={1.5} />
          <p
            className="text-center text-[0.66rem] leading-[1.5] text-sand-400 max-w-[280px]"
            style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
          >
            جميع النتائج تُنشأ بالاستناد إلى القوانين والمراجع القانونية المتاحة، ويُنصح دائمًا بالمراجعة البشرية قبل الاعتماد النهائي.
          </p>
        </div>
      </div>
    </div>
  );
}