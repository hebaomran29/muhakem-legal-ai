import { useState, type FormEvent } from 'react';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  ArrowRight,
  Scale,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useAuth } from '../../lib/auth';
import { AuthShell, MobileLogo, AuthCard, FormField } from './AuthShared';

type Screen = 'welcome' | 'login' | 'signup';

const BRANDING = {
  title: 'ذكاء قانوني للمحامين المصريين',
  sub: 'بحث • صياغة • مراجعة • قرار',
};

function Branding() {
  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <Scale className="w-7 h-7 text-gold-400" strokeWidth={1.5} />
        <span className="h-px w-12 bg-gradient-to-l from-gold-400/60 to-transparent" />
      </div>
      <h1
        className="text-white text-3xl xl:text-4xl leading-[1.2] font-700"
        style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
      >
        {BRANDING.title}
      </h1>
      <p className="mt-4 text-primary-200/70 text-sm font-500 tracking-[0.15em] uppercase">
        {BRANDING.sub}
      </p>
    </>
  );
}

export function AuthFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');

  if (screen === 'welcome') return <Welcome onPick={setScreen} />;
  if (screen === 'login') return <LoginForm onBack={() => setScreen('welcome')} onSwitch={() => setScreen('signup')} />;
  return <SignupForm onBack={() => setScreen('welcome')} onSwitch={() => setScreen('login')} />;
}

/* ── Welcome ── */
function Welcome({ onPick }: { onPick: (s: Screen) => void }) {
  return (
    <AuthShell brandingChildren={<Branding />}>
      <MobileLogo />
      <div className="relative z-10 w-full max-w-[420px] animate-fade-up" style={{ animationDelay: '150ms' }}>
        <div className="text-center">
          <h2 className="font-display font-700 text-ink text-2xl md:text-3xl leading-tight">
            مرحبًا بك في مُحَكِّم
          </h2>
          <p className="mt-2 text-primary-600 text-[0.92rem] font-600">مساعدك الذكي للعمل القانوني</p>
          <p className="mt-1.5 text-sand-500 text-[0.82rem] leading-relaxed max-w-sm mx-auto">
            ابحث، صِغ، راجع، واشتغل على قضاياك بشكل أكثر ذكاءً.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <button
            onClick={() => onPick('login')}
            className="ripple-container relative w-full inline-flex items-center justify-center gap-2.5 rounded-2xl text-[0.92rem] font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] bg-gradient-to-b from-primary-500 to-primary-600 text-white hover:from-primary-500 hover:to-primary-700 shadow-soft hover:shadow-card"
            style={{ height: '52px' }}
          >
            <LogIn className="w-4.5 h-4.5" strokeWidth={1.8} />
            <span>تسجيل الدخول</span>
          </button>
          <button
            onClick={() => onPick('signup')}
            className="ripple-container relative w-full inline-flex items-center justify-center gap-2.5 rounded-2xl text-[0.92rem] font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] border border-sand-200 bg-white text-ink hover:bg-sand-50 hover:border-sand-300 shadow-soft hover:shadow-card"
            style={{ height: '52px' }}
          >
            <UserPlus className="w-4.5 h-4.5" strokeWidth={1.8} />
            <span>إنشاء حساب</span>
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

/* ── Login ── */
function LoginForm({ onBack, onSwitch }: { onBack: () => void; onSwitch: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailErr(false);
    setPwErr(false);

    if (!email.trim() || !password) {
      if (!email.trim()) setEmailErr(true);
      if (!password) setPwErr(true);
      setError('يرجى ملء جميع الحقول');
      return;
    }

    setLoading(true);
    const err = await signIn(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <AuthShell brandingChildren={<Branding />}>
      <MobileLogo />
      <AuthCard>
        <div className="mb-6">
          <h2 className="font-display font-700 text-ink text-2xl leading-tight">مرحبًا بعودتك</h2>
          <p className="mt-1.5 text-sand-500 text-[0.82rem] leading-relaxed">سجّلي الدخول للمتابعة إلى مُحَكِّم</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-200 px-3.5 py-3 animate-fade-down" role="alert">
            <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[0.78rem] text-danger-700 font-500 leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
            autoFocus
          />
          <FormField
            label="كلمة المرور"
            icon={Lock}
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(v) => { setPassword(v); if (pwErr) setPwErr(false); }}
            placeholder="أدخل كلمة المرور"
            error={pwErr}
            dir="ltr"
            autoComplete="current-password"
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

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'ripple-container relative w-full inline-flex items-center justify-center font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none',
              'h-12 rounded-2xl text-[0.88rem] gap-2 mt-2',
              'bg-gradient-to-b from-primary-500 to-primary-600 text-white hover:from-primary-500 hover:to-primary-700 shadow-soft hover:shadow-card',
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span>جارٍ تسجيل الدخول...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" strokeWidth={1.8} />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[0.78rem] font-600 text-sand-500 hover:text-ink transition-colors duration-200 focus-ring rounded"
          >
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
            العودة
          </button>
          <div className="text-[0.78rem] text-sand-500">
            معنديش حساب؟{' '}
            <button onClick={onSwitch} className="font-600 text-primary-600 hover:text-primary-700 transition-colors duration-200 focus-ring rounded">
              إنشاء حساب
            </button>
          </div>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

/* ── Signup ── */
function SignupForm({ onBack, onSwitch }: { onBack: () => void; onSwitch: () => void }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [emailErr, setEmailErr] = useState(false);
  const [pwErr, setPwErr] = useState(false);
  const [confirmErr, setConfirmErr] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEmailErr(false);
    setPwErr(false);
    setConfirmErr(false);

    let ok = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setEmailErr(true); ok = false; }
    if (password.length < 6) { setPwErr(true); ok = false; }
    if (password !== confirmPw) { setConfirmErr(true); ok = false; }
    if (!ok) { setError('يرجى مراجعة الحقول المطلوبة'); return; }

    setLoading(true);
    const err = await signUp(email.trim(), password);
    setLoading(false);
    if (err) { setError(err); return; }
    setDone(true);
  };

  if (done) {
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
              افتحي إيميلك ({email}) ودوسي على رابط التأكيد، بعدها سجّلي دخول من هنا.
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

  return (
    <AuthShell brandingChildren={<Branding />}>
      <MobileLogo />
      <AuthCard>
        <div className="mb-6">
          <h2 className="font-display font-700 text-ink text-2xl leading-tight">إنشاء حساب جديد</h2>
          <p className="mt-1.5 text-sand-500 text-[0.82rem] leading-relaxed">ابدئي في استخدام مُحَكِّم في دقيقة</p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-200 px-3.5 py-3 animate-fade-down" role="alert">
            <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[0.78rem] text-danger-700 font-500 leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
            autoFocus
          />
          <FormField
            label="كلمة المرور"
            icon={Lock}
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(v) => { setPassword(v); if (pwErr) setPwErr(false); }}
            placeholder="٦ أحرف على الأقل"
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
          <FormField
            label="تأكيد كلمة المرور"
            icon={Lock}
            type={showPw ? 'text' : 'password'}
            value={confirmPw}
            onChange={(v) => { setConfirmPw(v); if (confirmErr) setConfirmErr(false); }}
            placeholder="أعيدي كتابة كلمة المرور"
            error={confirmErr}
            dir="ltr"
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'ripple-container relative w-full inline-flex items-center justify-center font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none',
              'h-12 rounded-2xl text-[0.88rem] gap-2 mt-2',
              'bg-gradient-to-b from-primary-500 to-primary-600 text-white hover:from-primary-500 hover:to-primary-700 shadow-soft hover:shadow-card',
            )}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2} />
                <span>جارٍ الإنشاء...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" strokeWidth={1.8} />
                <span>إنشاء حساب</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[0.78rem] font-600 text-sand-500 hover:text-ink transition-colors duration-200 focus-ring rounded"
          >
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.8} />
            العودة
          </button>
          <div className="text-[0.78rem] text-sand-500">
            عندي حساب بالفعل؟{' '}
            <button onClick={onSwitch} className="font-600 text-primary-600 hover:text-primary-700 transition-colors duration-200 focus-ring rounded">
              تسجيل الدخول
            </button>
          </div>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
