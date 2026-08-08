import { useState } from 'react';
import { useAuth } from '../lib/auth';

export function Login() {
  const { needsFirm, signIn, signUp, createFirm } = useAuth();

  if (needsFirm) return <CreateFirmStep onCreate={createFirm} />;
  return <SignInStep onSignIn={signIn} onSignUp={signUp} />;
}

function SignInStep({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSignUp: (email: string, password: string) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupDone, setSignupDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const fn = mode === 'signin' ? onSignIn : onSignUp;
    const err = await fn(email, password);
    setBusy(false);
    if (err) {
      setError(err);
    } else if (mode === 'signup') {
      setSignupDone(true);
    }
  };

  if (signupDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50" dir="rtl">
        <div className="max-w-sm w-full text-center space-y-3 p-6">
          <h1 className="text-xl font-bold">اتبعتلك رسالة تأكيد</h1>
          <p className="text-neutral-600">افتحي إيميلك ({email}) ودوسي على رابط التأكيد، بعدها سجّلي دخول من هنا.</p>
          <button
            className="text-sm text-blue-600 underline"
            onClick={() => { setSignupDone(false); setMode('signin'); }}
          >
            رجوع لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50" dir="rtl">
      <form onSubmit={handleSubmit} className="max-w-sm w-full space-y-4 p-6 bg-white rounded-xl shadow-sm border border-neutral-200">
        <h1 className="text-xl font-bold">مُحَكِّم</h1>
        <p className="text-sm text-neutral-500">
          {mode === 'signin' ? 'سجّلي دخول لمكتبك' : 'أنشئي حساب جديد'}
        </p>

        <input
          type="email"
          required
          placeholder="الإيميل"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          dir="ltr"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="الباسورد"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          dir="ltr"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '...جاري' : mode === 'signin' ? 'دخول' : 'إنشاء حساب'}
        </button>

        <button
          type="button"
          className="w-full text-sm text-neutral-500 underline"
          onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
        >
          {mode === 'signin' ? 'معنديش حساب — إنشاء حساب جديد' : 'عندي حساب بالفعل — تسجيل دخول'}
        </button>
      </form>
    </div>
  );
}

function CreateFirmStep({ onCreate }: { onCreate: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onCreate(name.trim() || 'مكتبي');
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50" dir="rtl">
      <form onSubmit={handleSubmit} className="max-w-sm w-full space-y-4 p-6 bg-white rounded-xl shadow-sm border border-neutral-200">
        <h1 className="text-xl font-bold">خطوة أخيرة</h1>
        <p className="text-sm text-neutral-500">اسم مكتبك/فريقك — هتقدري تضيفي زميلاتك بعد كده.</p>
        <input
          type="text"
          required
          placeholder="مثال: مكتب الرفاعي للمحاماة"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-neutral-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '...جاري' : 'إنشاء المكتب والبدء'}
        </button>
      </form>
    </div>
  );
}
