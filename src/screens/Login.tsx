import { useState, useEffect, type FormEvent } from 'react';
import { Briefcase, Loader2, AlertCircle, ArrowLeft, Users } from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth';
import { AuthShell, MobileLogo, AuthCard, FormField } from './auth/AuthShared';
import { Splash } from './auth/Splash';
import { AuthFlow } from './auth/AuthFlow';

function CreateFirmStep() {
  const { createFirm } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await createFirm(name.trim() || 'مكتبي');
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <AuthShell
      brandingChildren={
        <>
          <div className="flex items-center gap-3 mb-5">
            <Briefcase className="w-7 h-7 text-gold-400" strokeWidth={1.5} />
            <span className="h-px w-12 bg-gradient-to-l from-gold-400/60 to-transparent" />
          </div>
          <h1
            className="text-white text-3xl xl:text-4xl leading-[1.2] font-700"
            style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
          >
            خطوة أخيرة قبل ما نبدأ
          </h1>
          <p className="mt-4 text-primary-200/70 text-sm font-500 leading-relaxed">
            مساحة عمل خاصة بمكتبك — جلساتك، مذكراتك، وعقودك كلها هتتحفظ
            جواها، وتقدري تضيفي زميلاتك عليها بعد كده.
          </p>
        </>
      }
    >
      <MobileLogo />
      <AuthCard>
        <div className="mb-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 grid place-items-center mb-4">
            <Briefcase className="w-5 h-5 text-primary-600" strokeWidth={1.8} />
          </div>
          <h2 className="font-display font-700 text-ink text-2xl leading-tight">مساحة عمل مكتبك</h2>
          <p className="mt-1.5 text-sand-500 text-[0.82rem] leading-relaxed">
            اختاري اسمًا لمكتبك أو فريقك — تقدري تغيّريه لاحقًا من الإعدادات
          </p>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-danger-50 border border-danger-200 px-3.5 py-3 animate-fade-down" role="alert">
            <AlertCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-[0.78rem] text-danger-700 font-500 leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            label="اسم المكتب/الفريق"
            icon={Briefcase}
            value={name}
            onChange={setName}
            placeholder="مثال: مكتب الرفاعي للمحاماة"
            autoFocus
          />
          <p className="text-[0.7rem] text-sand-400 -mt-2 flex items-center gap-1.5">
            <Users className="w-3 h-3" strokeWidth={1.5} />
            هتقدري تدعي زميلاتك للمكتب ده بعد الإعداد مباشرة
          </p>

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
                <span>إنشاء المكتب والبدء</span>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.8} />
              </>
            )}
          </button>
        </form>
      </AuthCard>
    </AuthShell>
  );
}

/* ════════════════════════════════════════════════
   Login — نقطة الدخول: Splash مرة واحدة بس لكل جلسة
   متصفح، بعدها welcome/login/signup أو خطوة المكتب.
   ════════════════════════════════════════════════ */
export function Login() {
  const { needsFirm } = useAuth();
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('muhakem-splash-shown'));

  useEffect(() => {
    if (showSplash) sessionStorage.setItem('muhakem-splash-shown', '1');
  }, [showSplash]);

  if (showSplash) return <Splash onDone={() => setShowSplash(false)} />;
  if (needsFirm) return <CreateFirmStep />;
  return <AuthFlow />;
}