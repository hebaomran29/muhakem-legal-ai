import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_SUPABASE_URL أو VITE_SUPABASE_ANON_KEY مش موجودين في .env — ' +
    'تسجيل الدخول والحفظ الدائم للجلسات مش هيشتغلوا لحد ما تضيفيهم.',
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');
