import { useState } from 'react';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Scale,
  Briefcase,
  Calendar,
  Search,
  FileText,
  GraduationCap,
  Landmark,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth, PENDING_ONBOARDING_KEY } from '../../lib/auth';
import type {
  Gender,
  LegalRole,
  YearsOfExperience,
  LegalSpecialization,
  StudyLevel,
  OnboardingProfile,
} from '../../lib/authService';
import { AuthShell, MobileLogo, AuthCard, FormField } from './AuthShared';
import { Branding } from './AuthFlow';

/* ════════════════════════════════════════════════
   Step labels
   ════════════════════════════════════════════════ */

const stepLabels = ['حسابك', 'بياناتك', 'ملفك المهني'];

/* ════════════════════════════════════════════════
   Role options — with descriptions
   ════════════════════════════════════════════════ */

const roleOptions: {
  id: LegalRole;
  labelAr: string;
  descAr: string;
  icon: typeof Scale;
}[] = [
  { id: 'lawyer', labelAr: 'محامي', descAr: 'يمارس العمل القانوني ويمثل العملاء.', icon: Scale },
  { id: 'legal_consultant', labelAr: 'مستشار قانوني', descAr: 'يقدم الاستشارات والمراجعات القانونية.', icon: Landmark },
  { id: 'legal_researcher', labelAr: 'باحث قانوني', descAr: 'يعمل في البحث والتحليل القانوني.', icon: Search },
  { id: 'law_student', labelAr: 'طالب قانون', descAr: 'للدراسة والتدريب والبحث القانوني.', icon: GraduationCap },
];

const expOptions: { id: YearsOfExperience; labelAr: string }[] = [
  { id: 'less_than_1', labelAr: 'أقل من سنة' },
  { id: '1_to_3', labelAr: '1–3' },
  { id: '3_to_5', labelAr: '3–5' },
  { id: '5_to_10', labelAr: '5–10' },
  { id: 'more_than_10', labelAr: '10+' },
];

const lawyerSpecs: { id: LegalSpecialization; labelAr: string }[] = [
  { id: 'criminal', labelAr: 'جنائي' },
  { id: 'civil', labelAr: 'مدني' },
  { id: 'commercial', labelAr: 'تجاري' },
  { id: 'labor', labelAr: 'عمالي' },
  { id: 'personal_status', labelAr: 'أحوال شخصية' },
  { id: 'corporate', labelAr: 'شركات' },
  { id: 'contracts', labelAr: 'عقود' },
  { id: 'administrative', labelAr: 'إداري' },
  { id: 'investment', labelAr: 'استثمار' },
];

const consultantSpecs: { id: LegalSpecialization; labelAr: string }[] = [
  { id: 'contracts', labelAr: 'عقود' },
  { id: 'corporate', labelAr: 'شركات' },
  { id: 'commercial', labelAr: 'تجاري' },
  { id: 'labor', labelAr: 'عمالي' },
  { id: 'investment', labelAr: 'استثمار' },
  { id: 'civil', labelAr: 'مدني' },
  { id: 'personal_status', labelAr: 'أحوال شخصية' },
];

const researcherSpecs: { id: LegalSpecialization; labelAr: string }[] = [
  { id: 'criminal', labelAr: 'القانون الجنائي' },
  { id: 'civil', labelAr: 'القانون المدني' },
  { id: 'commercial', labelAr: 'القانون التجاري' },
  { id: 'administrative', labelAr: 'القانون الإداري' },
  { id: 'investment', labelAr: 'القانون الدولي' },
  { id: 'corporate', labelAr: 'التشريعات' },
  { id: 'contracts', labelAr: 'أحكام النقض' },
];

const studyLevelOptions: { id: StudyLevel; labelAr: string }[] = [
  { id: 'student', labelAr: 'طالب' },
  { id: 'recent_grad', labelAr: 'خريج حديث' },
  { id: 'postgrad', labelAr: 'دراسات عليا' },
];

const studentInterestSpecs: { id: LegalSpecialization; labelAr: string }[] = [
  { id: 'criminal', labelAr: 'جنائي' },
  { id: 'civil', labelAr: 'مدني' },
  { id: 'commercial', labelAr: 'تجاري' },
  { id: 'labor', labelAr: 'عمالي' },
  { id: 'corporate', labelAr: 'شركات' },
  { id: 'contracts', labelAr: 'عقود' },
  { id: 'administrative', labelAr: 'إداري' },
];

const genderOptions: { id: Gender; labelAr: string }[] = [
  { id: 'male', labelAr: 'ذكر' },
  { id: 'female', labelAr: 'أنثى' },
];

const ALL_SPECS = [...lawyerSpecs, ...consultantSpecs, ...researcherSpecs, ...studentInterestSpecs];

/* ════════════════════════════════════════════════
   Password strength
   ════════════════════════════════════════════════ */

function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3; label: string } {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['ضعيفة', 'ضعيفة', 'متوسطة', 'قوية'];
  return { score: score as 0 | 1 | 2 | 3, label: labels[score] };
}

/* ════════════════════════════════════════════════
   Main Component
   ════════════════════════════════════════════════ */

// step: 0=حساب، 1=بياناتك، 2=ملفك المهني، 3=جاهز (session فعّالة فورًا)،
// 4=راجعي إيميلك (المشروع محتاج تأكيد إيميل قبل ما يبقى فيه session)
type Step = 0 | 1 | 2 | 3 | 4;

export function AuthOnboarding({ onBack, onSwitch }: { onBack: () => void; onSwitch: () => void }) {
  const { signUp, completeOnboarding } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0: Account
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [nameErr, setNameErr] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr] = useState(false);
  const [confirmErr, setConfirmErr] = useState(false);

  // Step 1: About you (optional)
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);

  // Step 2: Professional profile
  const [role, setRole] = useState<LegalRole | null>(null);
  const [experience, setExperience] = useState<YearsOfExperience | null>(null);
  const [specializations, setSpecializations] = useState<LegalSpecialization[]>([]);
  const [studyLevel, setStudyLevel] = useState<StudyLevel | null>(null);

  const toggleSpec = (id: LegalSpecialization) => {
    setSpecializations((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleRoleSelect = (r: LegalRole) => {
    setRole(r);
    setExperience(null);
    setSpecializations([]);
    setStudyLevel(null);
  };

  const validateStep0 = (): boolean => {
    setError(null);
    setNameErr(false);
    setEmailErr(false);
    setPwErr(false);
    setConfirmErr(false);
    let ok = true;

    if (fullName.trim().length < 2) { setNameErr(true); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailErr(true); ok = false; }
    if (password.length < 6) { setPwErr(true); ok = false; }
    if (password !== confirmPw) { setConfirmErr(true); ok = false; }
    if (!ok) setError('يرجى مراجعة الحقول المطلوبة.');
    return ok;
  };

  const buildProfile = (): OnboardingProfile => ({
    fullName: fullName.trim(),
    age: age.trim() || undefined,
    gender: gender ?? undefined,
    language: 'ar',
    role: role ?? undefined,
    yearsOfExperience: experience ?? undefined,
    legalSpecializations: specializations,
    studyLevel: studyLevel ?? undefined,
  });

  const handleNext = async () => {
    if (step === 0 && !validateStep0()) return;

    if (step < 2) {
      setStep((step + 1) as Step);
      return;
    }

    // Step 2 → إنشاء الحساب فعليًا + تخزين الملف المهني
    if (step === 2) {
      if (!role) {
        setError('يرجى اختيار دورك المهني.');
        return;
      }
      setSubmitting(true);
      setError(null);
      const { error: authErr, needsEmailConfirmation } = await signUp(email.trim(), password);
      setSubmitting(false);
      if (authErr) {
        setError(authErr);
        return;
      }

      if (needsEmailConfirmation) {
        // مفيش session فورية — بنسيب بيانات الملف المهني مخزّنة مؤقتًا
        // وهتتطبّق تلقائيًا أول ما تسجّل دخول بعد تأكيد الإيميل
        try {
          sessionStorage.setItem(PENDING_ONBOARDING_KEY, JSON.stringify(buildProfile()));
        } catch {
          /* لو التخزين المحلي مش متاح، الاسم/الملف المهني هيتفقدوا —
             الحساب نفسه لسه بينشئ عادي */
        }
        setStep(4);
        return;
      }

      // في session فورية (تأكيد الإيميل مش مفعّل على المشروع) — نطبّق
      // الملف المهني على طول
      const profileErr = await completeOnboarding(buildProfile());
      if (profileErr) {
        setError(profileErr);
        return;
      }
      setStep(3);
    }
  };

  const handleBack = () => {
    if (step > 0 && step < 3) setStep((step - 1) as Step);
    else if (step === 0) onBack();
  };

  const handleFinish = () => {
    setPreparing(true);
    setTimeout(onSwitch, 1200);
  };

  const canProceed = [
    fullName.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && password.length >= 6 && password === confirmPw,
    true,
    role !== null,
  ];

  /* ════════════════════════════════════════════════
     Preparing transition screen
     ════════════════════════════════════════════════ */
  if (preparing) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden"
        dir="rtl"
        style={{ background: 'linear-gradient(165deg, #04141A 0%, #061F27 35%, #092F3A 70%, #061F27 100%)' }}
      >
        <div className="pointer-events-none absolute -top-40 right-1/4 w-[36rem] h-[36rem] rounded-full bg-primary-500/[0.08] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 w-[28rem] h-[28rem] rounded-full bg-gold-400/[0.06] blur-3xl" />

        <div className="relative z-10 flex flex-col items-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl border-2 border-gold-400/40 splash-ring" />
            <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-white w-16 h-16">
              <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-gold-400" strokeWidth={2} />
            <p className="text-[0.85rem] font-500 text-primary-200/80 tracking-wide">
              جاري تجهيز مساحة العمل الخاصة بك...
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════
     Step 4 — راجعي إيميلك (تأكيد الإيميل مفعّل على المشروع)
     ════════════════════════════════════════════════ */
  if (step === 4) {
    return (
      <AuthShell brandingChildren={<Branding />}>
        <MobileLogo />
        <AuthCard>
          <div className="text-center py-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-success-50 border border-success-200 grid place-items-center mb-4">
              <Check className="w-6 h-6 text-success-600" strokeWidth={2.5} />
            </div>
            <h2 className="font-display font-700 text-ink text-xl leading-tight">اتبعتلك رسالة تأكيد</h2>
            <p className="mt-2 text-sand-500 text-[0.82rem] leading-relaxed">
              افتحي إيميلك ({email.trim()}) ودوسي على رابط التأكيد، بعدها سجّلي دخول من هنا — هنكمّل إعداد ملفك المهني تلقائيًا.
            </p>
            <button
              onClick={onSwitch}
              className="mt-6 inline-flex items-center gap-1.5 text-[0.82rem] font-600 text-primary-600 hover:text-primary-700 transition-colors duration-200 focus-ring rounded"
            >
              رجوع لتسجيل الدخول
            </button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  /* ════════════════════════════════════════════════
     Step 3 — جاهز / ملخص
     ════════════════════════════════════════════════ */
  if (step === 3) {
    const roleLabel = role ? roleOptions.find((r) => r.id === role)?.labelAr : '—';
    const expLabel = experience ? expOptions.find((e) => e.id === experience)?.labelAr : null;
    const specLabels = specializations.map((s) => ALL_SPECS.find((o) => o.id === s)?.labelAr).filter(Boolean);
    const studyLabel = studyLevel ? studyLevelOptions.find((s) => s.id === studyLevel)?.labelAr : null;

    return (
      <AuthShell brandingChildren={<Branding />}>
        <MobileLogo />
        <AuthCard className="max-w-[520px]">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-success-50 border border-success-200 mb-4 animate-scale-pop">
              <Check className="w-7 h-7 text-success-600" strokeWidth={2.5} />
            </div>
            <h2 className="font-display font-700 text-ink text-2xl leading-tight">تم إعداد ملفك بنجاح</h2>
            <p className="mt-1.5 text-sand-500 text-[0.82rem]">مرحبًا، {fullName.trim().split(' ')[0]}</p>
          </div>

          <div className="rounded-2xl bg-sand-50 border border-sand-200 p-5 space-y-3.5 animate-fade-up">
            <SummaryRow icon={User} label="الاسم" value={fullName.trim()} />
            <SummaryRow icon={role === 'law_student' ? GraduationCap : Scale} label="الدور" value={roleLabel ?? '—'} />
            {expLabel && <SummaryRow icon={Briefcase} label="الخبرة" value={expLabel} />}
            {studyLabel && <SummaryRow icon={GraduationCap} label="المستوى" value={studyLabel} />}
            {specLabels.length > 0 && (
              <div className="flex items-start gap-2.5">
                <FileText className="w-4 h-4 text-sand-400 shrink-0 mt-0.5" strokeWidth={1.5} />
                <div className="flex-1">
                  <div className="text-[0.72rem] font-600 text-sand-700 mb-1">مجالات العمل</div>
                  <div className="flex flex-wrap gap-1.5">
                    {specLabels.map((s, i) => (
                      <span key={i} className="text-[0.72rem] font-600 px-2.5 py-1 rounded-lg bg-primary-50 text-primary-700 border border-primary-100">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleFinish}
            className="ripple-container relative w-full mt-6 inline-flex items-center justify-center gap-2 h-12 rounded-2xl text-[0.92rem] font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] bg-gradient-to-b from-success-500 to-success-600 text-white hover:from-success-500 hover:to-success-700 shadow-soft hover:shadow-card"
          >
            <span>ابدأ مع مُحَكِّم</span>
            <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
          </button>

          <p className="mt-4 text-[0.72rem] text-sand-400 text-center leading-relaxed">
            يمكنك الآن البحث، مراجعة العقود، إعداد المذكرات، والاستفادة من مساعدك القانوني.
          </p>
        </AuthCard>
      </AuthShell>
    );
  }

  /* ════════════════════════════════════════════════
     Steps 0–2
     ════════════════════════════════════════════════ */
  return (
    <AuthShell brandingChildren={<Branding />}>
      <MobileLogo />

      <AuthCard className="max-w-[520px]">
        {/* Progress indicator */}
        <div className="mb-6">
          <div className="flex items-center gap-1">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex-1 flex items-center gap-1">
                <div className="flex-1 flex flex-col items-center">
                  <div
                    className={cn(
                      'grid place-items-center w-7 h-7 rounded-full border-2 transition-all duration-300 ease-out-expo',
                      i < step
                        ? 'bg-gold-400 border-gold-400 text-white'
                        : i === step
                          ? 'bg-white border-gold-400 text-gold-600 shadow-soft'
                          : 'bg-white border-sand-200 text-sand-400',
                    )}
                  >
                    {i < step ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <span className="text-[0.68rem] font-700">{i + 1}</span>}
                  </div>
                  <span className={cn('mt-1.5 text-[0.62rem] font-600 transition-colors duration-200', i <= step ? 'text-ink' : 'text-sand-400')}>
                    {label}
                  </span>
                </div>
                {i < 2 && (
                  <div className={cn('h-0.5 w-6 rounded-full transition-all duration-300 -mt-5', i < step ? 'bg-gold-400' : 'bg-sand-200')} />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-200 px-3.5 py-3 animate-fade-down" role="alert">
            <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[0.78rem] text-danger-700 font-500 leading-relaxed">{error}</p>
          </div>
        )}

        {/* Step 0: Account */}
        {step === 0 && (
          <div key="step-0" className="animate-slide-up">
            <StepHeader label="إعداد الحساب" title="لنبدأ بحسابك" desc="أنشئ حسابك للوصول إلى مساحة عملك القانونية." />

            <div className="space-y-3.5">
              <FormField
                label="الاسم الكامل"
                icon={User}
                value={fullName}
                onChange={(v) => { setFullName(v); if (nameErr) setNameErr(false); }}
                placeholder="أدخل اسمك الكامل"
                error={nameErr}
                autoFocus
              />

              <FormField
                label="البريد الإلكتروني"
                icon={Mail}
                type="email"
                value={email}
                onChange={(v) => { setEmail(v); if (emailErr) setEmailErr(false); }}
                placeholder="أدخل بريدك الإلكتروني"
                error={emailErr}
                dir="ltr"
                autoComplete="email"
              />

              <div>
                <FormField
                  label="كلمة المرور"
                  icon={Lock}
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(v) => { setPassword(v); if (pwErr) setPwErr(false); }}
                  placeholder="أدخل كلمة المرور"
                  error={pwErr}
                  dir="ltr"
                  autoComplete="new-password"
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShowPw((p) => !p)}
                      className="shrink-0 mx-3 grid place-items-center w-7 h-7 rounded-lg text-sand-400 hover:text-sand-600 hover:bg-sand-100 transition-all duration-200 ease-out-expo focus-ring"
                      aria-label={showPw ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPw ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                    </button>
                  }
                />
                {password.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 animate-fade-in">
                    <div className="flex-1 flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            'h-1 flex-1 rounded-full transition-all duration-300',
                            i < passwordStrength(password).score
                              ? passwordStrength(password).score >= 3
                                ? 'bg-success-500'
                                : passwordStrength(password).score >= 2
                                  ? 'bg-warning-500'
                                  : 'bg-danger-400'
                              : 'bg-sand-200',
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-[0.68rem] font-600 text-sand-500 w-12 text-left">{passwordStrength(password).label}</span>
                  </div>
                )}
                <div className="mt-2 text-[0.66rem] text-sand-400 leading-relaxed">٦ أحرف على الأقل • يُفضل استخدام أرقام ورموز</div>
              </div>

              <FormField
                label="تأكيد كلمة المرور"
                icon={Lock}
                type={showPw ? 'text' : 'password'}
                value={confirmPw}
                onChange={(v) => { setConfirmPw(v); if (confirmErr) setConfirmErr(false); }}
                placeholder="أعد إدخال كلمة المرور"
                error={confirmErr}
                dir="ltr"
                autoComplete="new-password"
              />
              {confirmErr && <p className="text-[0.7rem] text-danger-600 font-500 -mt-1">كلمتا المرور غير متطابقتين.</p>}
            </div>
          </div>
        )}

        {/* Step 1: About you (optional) */}
        {step === 1 && (
          <div key="step-1" className="animate-slide-up">
            <StepHeader label="إعداد الحساب" title="بياناتك" desc="بعض المعلومات البسيطة تساعدنا على تخصيص تجربتك." />

            <div className="space-y-4">
              <div>
                <label className="block text-[0.76rem] font-600 text-sand-700 mb-2">
                  النوع <span className="text-sand-400 font-400">(اختياري)</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {genderOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setGender(opt.id)}
                      className={cn(
                        'rounded-xl border py-2.5 text-[0.78rem] font-600 transition-all duration-200 ease-out-expo active:scale-[0.98]',
                        gender === opt.id
                          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-soft'
                          : 'border-sand-200 bg-sand-50/50 text-sand-600 hover:border-sand-300 hover:bg-white',
                      )}
                    >
                      {opt.labelAr}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 text-sand-400" strokeWidth={1.5} />
                  <label className="text-[0.76rem] font-600 text-sand-700">
                    العمر <span className="text-sand-400 font-400">(اختياري)</span>
                  </label>
                </div>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="مثال: ٣٢"
                  min="18"
                  max="100"
                  className="w-full rounded-2xl border bg-sand-50/50 px-4 py-3 text-[0.85rem] text-ink placeholder:text-sand-400 outline-none transition-all duration-200 ease-out-expo border-sand-200 focus:border-primary-400 focus:bg-white focus:shadow-soft"
                />
              </div>
            </div>

            <p className="mt-4 text-[0.68rem] text-sand-400 text-center">يمكنك تخطي هذه الخطوة</p>
          </div>
        )}

        {/* Step 2: Professional profile */}
        {step === 2 && (
          <div key="step-2" className="animate-slide-up">
            <StepHeader label="إعداد الحساب" title="ملفك المهني" desc="ساعدنا في تخصيص تجربة مُحَكِّم بما يناسب طبيعة عملك." />

            <div className="space-y-5">
              <div>
                <label className="block text-[0.76rem] font-600 text-sand-700 mb-2.5">اختر دورك المهني</label>
                <div className="space-y-2.5">
                  {roleOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleRoleSelect(opt.id)}
                      className={cn(
                        'relative w-full rounded-2xl border p-4 text-right transition-all duration-200 ease-out-expo active:scale-[0.99] group',
                        role === opt.id ? 'border-gold-400 bg-gold-50' : 'border-sand-200 bg-sand-50/50 hover:border-sand-300 hover:bg-white',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'grid place-items-center w-10 h-10 rounded-xl shrink-0 transition-colors duration-200',
                          role === opt.id ? 'bg-gold-100 text-gold-600' : 'bg-sand-100 text-sand-500 group-hover:text-sand-600',
                        )}>
                          <opt.icon className="w-5 h-5" strokeWidth={1.5} />
                        </div>
                        <div className="flex-1">
                          <div className={cn('text-[0.85rem] font-700', role === opt.id ? 'text-gold-800' : 'text-sand-800')}>{opt.labelAr}</div>
                          <div className="text-[0.7rem] text-sand-400 mt-0.5 leading-relaxed">{opt.descAr}</div>
                        </div>
                        {role === opt.id && <Check className="w-4 h-4 text-gold-500 shrink-0 mt-1 animate-pop" strokeWidth={2.5} />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {role === 'lawyer' && (
                <div className="space-y-5 animate-fade-up">
                  <ExperiencePicker experience={experience} setExperience={setExperience} />
                  <SpecPicker label="التخصص القانوني" specs={lawyerSpecs} selected={specializations} onToggle={toggleSpec} />
                </div>
              )}

              {role === 'legal_consultant' && (
                <div className="space-y-5 animate-fade-up">
                  <ExperiencePicker experience={experience} setExperience={setExperience} />
                  <SpecPicker label="مجالات الاستشارة" specs={consultantSpecs} selected={specializations} onToggle={toggleSpec} />
                </div>
              )}

              {role === 'legal_researcher' && (
                <div className="space-y-5 animate-fade-up">
                  <SpecPicker label="مجال البحث" specs={researcherSpecs} selected={specializations} onToggle={toggleSpec} />
                </div>
              )}

              {role === 'law_student' && (
                <div className="space-y-5 animate-fade-up">
                  <div>
                    <label className="block text-[0.76rem] font-600 text-sand-700 mb-2">المستوى الدراسي</label>
                    <div className="flex flex-wrap gap-2">
                      {studyLevelOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStudyLevel(opt.id)}
                          className={cn(
                            'rounded-xl border px-4 py-2 text-[0.78rem] font-600 transition-all duration-200 ease-out-expo active:scale-[0.98]',
                            studyLevel === opt.id
                              ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-soft'
                              : 'border-sand-200 bg-sand-50/50 text-sand-600 hover:border-sand-300 hover:bg-white',
                          )}
                        >
                          {opt.labelAr}
                        </button>
                      ))}
                    </div>
                  </div>
                  <SpecPicker label="الاهتمامات القانونية" specs={studentInterestSpecs} selected={specializations} onToggle={toggleSpec} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-sand-200 bg-white px-5 h-12 text-[0.85rem] font-600 text-sand-600 hover:border-sand-300 hover:text-ink transition-all duration-200 ease-out-expo active:scale-[0.98] disabled:opacity-50"
          >
            <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            {step === 0 ? 'إلغاء' : 'رجوع'}
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting || (step === 0 && !canProceed[0]) || (step === 2 && !canProceed[2])}
            className={cn(
              'ripple-container relative flex-1 inline-flex items-center justify-center gap-2 rounded-2xl h-12 text-[0.88rem] font-600 transition-all duration-200 ease-out-expo active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
              'bg-gradient-to-b from-primary-500 to-primary-600 text-white hover:from-primary-500 hover:to-primary-700 shadow-soft hover:shadow-card',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span>جارٍ الإنشاء...</span>
              </>
            ) : step === 2 ? (
              <>
                <span>إنشاء الحساب</span>
                <Check className="w-4 h-4" strokeWidth={2} />
              </>
            ) : (
              <>
                <span>التالي</span>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
              </>
            )}
          </button>
        </div>

        <div className="mt-5 text-center text-[0.78rem] text-sand-500">
          عندي حساب بالفعل؟{' '}
          <button onClick={onSwitch} className="font-600 text-primary-600 hover:text-primary-700 transition-colors duration-200 focus-ring rounded">
            تسجيل الدخول
          </button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

/* ════════════════════════════════════════════════
   Sub-components
   ════════════════════════════════════════════════ */

function StepHeader({ label, title, desc }: { label: string; title: string; desc: string }) {
  return (
    <div className="mb-5">
      <div className="text-[0.68rem] font-600 text-gold-600 tracking-[0.15em] uppercase mb-1">{label}</div>
      <h2 className="font-display font-700 text-ink text-xl leading-tight">{title}</h2>
      <p className="mt-1 text-sand-500 text-[0.8rem] leading-relaxed">{desc}</p>
    </div>
  );
}

function ExperiencePicker({
  experience,
  setExperience,
}: {
  experience: YearsOfExperience | null;
  setExperience: (e: YearsOfExperience) => void;
}) {
  return (
    <div>
      <label className="block text-[0.76rem] font-600 text-sand-700 mb-2">سنوات الخبرة</label>
      <div className="flex flex-wrap gap-2">
        {expOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setExperience(opt.id)}
            className={cn(
              'rounded-xl border px-3.5 py-2 text-[0.76rem] font-600 transition-all duration-200 ease-out-expo active:scale-[0.98]',
              experience === opt.id
                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-soft'
                : 'border-sand-200 bg-sand-50/50 text-sand-600 hover:border-sand-300 hover:bg-white',
            )}
          >
            {opt.labelAr}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpecPicker({
  label,
  specs,
  selected,
  onToggle,
}: {
  label: string;
  specs: { id: LegalSpecialization; labelAr: string }[];
  selected: LegalSpecialization[];
  onToggle: (id: LegalSpecialization) => void;
}) {
  return (
    <div>
      <label className="block text-[0.76rem] font-600 text-sand-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {specs.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onToggle(opt.id)}
            className={cn(
              'rounded-xl border px-3.5 py-2 text-[0.76rem] font-600 transition-all duration-200 ease-out-expo active:scale-[0.98] inline-flex items-center gap-1.5',
              selected.includes(opt.id)
                ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-soft'
                : 'border-sand-200 bg-sand-50/50 text-sand-600 hover:border-sand-300 hover:bg-white',
            )}
          >
            {selected.includes(opt.id) && <Check className="w-3 h-3" strokeWidth={2.5} />}
            {opt.labelAr}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-sand-400 shrink-0" strokeWidth={1.5} />
      <span className="text-[0.72rem] font-600 text-sand-700 w-16">{label}</span>
      <span className="text-[0.82rem] font-600 text-ink flex-1">{value}</span>
    </div>
  );
}
