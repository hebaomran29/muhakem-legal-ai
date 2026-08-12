/* ─────────────────────────────────────────────────────────────
   تسجيل الدخول (Supabase Auth) + إدارة المكتب (firm) بتاع المستخدم.

   الملف ده له نصين:
   1) جزء "plain" (getAccessToken) — بيستخدمه api.ts عشان يحط التوكن في
      هيدر أي request، من غير ما api.ts يحتاج يستورد React context.
   2) AuthProvider/useAuth — للواجهة (شاشة تسجيل الدخول والـ Workspace).
   ───────────────────────────────────────────────────────────── */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { OnboardingProfile } from './authService';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

/* ═══ جزء plain — يستخدمه api.ts ═══ */

let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

/* ═══ React context ═══ */

type Firm = { id: string; name: string };

type AuthState = {
  loading: boolean;
  user: User | null;
  firms: Firm[];
  needsFirm: boolean; // مسجّل دخول بس معندوش مكتب لسه (أول مرة)
  signIn: (email: string, password: string) => Promise<string | null>; // ترجع رسالة خطأ لو فشل
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  createFirm: (name: string) => Promise<string | null>;
  /** بتتخزن بعد إنشاء الحساب — الاسم الكامل وبيانات الملف المهني بتتحفظ في
   *  user_metadata بتاعة Supabase (مفيش عمود/جدول منفصل ليها لسه). */
  completeOnboarding: (profile: OnboardingProfile) => Promise<string | null>;
};

const PENDING_ONBOARDING_KEY = 'muhakem-pending-onboarding';
export { PENDING_ONBOARDING_KEY };

/** لو تفعيل الإيميل مفروض على المشروع، مفيش session فورية بعد signUp —
 *  فبنخزّن بيانات الملف المهني اللي دخلتها مؤقتًا، ونطبّقها تلقائيًا هنا
 *  أول ما تسجّل دخول فعليًا (بعد ما تدوس على رابط التأكيد). */
async function applyPendingOnboarding(user: User): Promise<void> {
  if (user.user_metadata?.full_name) return; // اتطبّقت قبل كده
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_ONBOARDING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const profile = JSON.parse(raw) as OnboardingProfile;
    const { fullName, ...rest } = profile;
    await supabase.auth.updateUser({ data: { full_name: fullName, ...rest } });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('فشل تطبيق بيانات الملف المهني المؤجّلة:', e);
  } finally {
    try {
      sessionStorage.removeItem(PENDING_ONBOARDING_KEY);
    } catch {
      /* ignore */
    }
  }
}

const AuthContext = createContext<AuthState | null>(null);

/** null = فشل مؤقت (نت/سيرفر) — مش نعرف لسه لو فيه مكتب ولا لأ.
 *  [] = فعلاً معندهاش مكتب (403 صريح من السيرفر).
 *  [{...}] = عندها مكتب. */
async function fetchFirms(token: string): Promise<Firm[] | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // /api/sessions بترجع 403 لو المستخدم معندوش firm لسه — مش خطأ حقيقي
    if (res.status === 403) return [];
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error(`فشل التحقق من المكتب: /api/sessions رجّع ${res.status}`);
      return null;
    }
    // النداء ده بس للتأكد إن فيه firm (مش لجلب الجلسات فعليًا هنا)
    return [{ id: 'unknown', name: '' }];
  } catch (e) {
    // خطأ شبكة/سيرفر واقع — مش دليل إن معندهاش مكتب. لو رجّعنا [] هنا
    // زي الأول، أي مستخدمة عندها مكتب فعلاً هتترمي لشاشة "إنشاء مكتب"
    // غلط بمجرد ما الباك إند يقف أو يبطّئ لحظة.
    // eslint-disable-next-line no-console
    console.error('فشل الاتصال بالسيرفر أثناء التحقق من المكتب:', e);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [firms, setFirms] = useState<Firm[]>([]);
  // بنفصلها عن firms عشان لو fetchFirms فشلت مؤقتًا منرميش المستخدمة على
  // شاشة "إنشاء مكتب" غلط وهي أصلاً عندها مكتب — فرق بين "لسه ما عرفناش"
  // و"فعلاً معندهاش مكتب" (الحالة التانية دي بس اللي بتفعّل needsFirm)
  const [firmsKnown, setFirmsKnown] = useState(false);

  useEffect(() => {
    const applySession = async (session: Session | null) => {
      _accessToken = session?.access_token ?? null;
      setUser(session?.user ?? null);
      if (session?.user) await applyPendingOnboarding(session.user);
      if (session?.access_token) {
        let f = await fetchFirms(session.access_token);
        if (f === null) {
          // محاولة تانية بعد ثانية — لو السيرفر كان لسه بيقوم (uvicorn
          // --reload مثلاً) قبل ما نستسلم ونعتبرها فشل حقيقي
          await new Promise((r) => setTimeout(r, 1000));
          f = await fetchFirms(session.access_token);
        }
        if (f === null) {
          // فشل فعلي (مش 403) — منعتبرهاش "معندهاش مكتب"، سيبيها تكمل
          // للـ workspace عادي؛ أي نداء API حقيقي هيفشل برسالة واضحة لو
          // فعلاً معندهاش صلاحية
          setFirmsKnown(false);
          setFirms([{ id: 'unknown', name: '' }]);
        } else {
          setFirmsKnown(true);
          setFirms(f);
        }
      } else {
        setFirmsKnown(true);
        setFirms([]);
      }
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? translateAuthError(error.message) : null;
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: translateAuthError(error.message), needsEmailConfirmation: false };
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const completeOnboarding = async (profile: OnboardingProfile) => {
    const { fullName, ...rest } = profile;
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, ...rest },
    });
    if (error) return translateAuthError(error.message);
    // updateUser بيحدّث الـ session تلقائيًا وبيطلق onAuthStateChange،
    // فـ user في الـ state هيتحدّث لوحده من غير ما نحتاج نعمل setUser هنا
    return null;
  };

  const createFirm = async (name: string) => {
    if (!_accessToken) return 'مسجّلة دخول؟ جربي تاني.';
    try {
      const res = await fetch(`${BASE_URL}/api/firms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_accessToken}` },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return body.detail || 'فشل إنشاء المكتب';
      }
      setFirmsKnown(true);
      setFirms([{ id: 'created', name }]);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'فشل إنشاء المكتب';
    }
  };

  const value: AuthState = {
    loading,
    user,
    firms,
    needsFirm: !loading && !!user && firmsKnown && firms.length === 0,
    signIn,
    signUp,
    signOut,
    createFirm,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth لازم تتستخدم جوه AuthProvider');
  return ctx;
}

function translateAuthError(message: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'الإيميل أو الباسورد غلط',
    'User already registered': 'الإيميل ده مسجّل بالفعل — سجّلي دخول بدل حساب جديد',
    'Password should be at least 6 characters': 'الباسورد لازم يكون 6 حروف على الأقل',
  };
  return map[message] || message;
}