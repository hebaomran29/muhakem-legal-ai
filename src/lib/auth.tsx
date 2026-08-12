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
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  createFirm: (name: string) => Promise<string | null>;
};

const AuthContext = createContext<AuthState | null>(null);

async function fetchFirms(token: string): Promise<Firm[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // /api/sessions بترجع 403 لو المستخدم معندوش firm لسه — مش خطأ حقيقي
    if (res.status === 403) return [];
    if (!res.ok) return [];
    // النداء ده بس للتأكد إن فيه firm (مش لجلب الجلسات فعليًا هنا)
    return [{ id: 'unknown', name: '' }];
  } catch {
    return [];
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [firms, setFirms] = useState<Firm[]>([]);

  useEffect(() => {
    const applySession = async (session: Session | null) => {
      _accessToken = session?.access_token ?? null;
      setUser(session?.user ?? null);
      if (session?.access_token) {
        const f = await fetchFirms(session.access_token);
        setFirms(f);
      } else {
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
    const { error } = await supabase.auth.signUp({ email, password });
    return error ? translateAuthError(error.message) : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
    needsFirm: !loading && !!user && firms.length === 0,
    signIn,
    signUp,
    signOut,
    createFirm,
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
