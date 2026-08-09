import type { ReactNode } from 'react';
import { Scale, ShieldCheck, Lock as LockIcon, Zap, Globe } from 'lucide-react';
import { cn } from '../../lib/cn';

/* ════════════════════════════════════════════════
   BrandingPanel — left side of split layout
   Reused across all auth screens for consistency
   ════════════════════════════════════════════════ */

export function BrandingPanel({ children }: { children?: ReactNode }) {
  const trustItems = [
    { icon: ShieldCheck, label: 'سرية كاملة' },
    { icon: LockIcon, label: 'متوافق قانونياً' },
    { icon: Zap, label: 'تحديث آني للقوانين' },
  ];

  return (
    <div
      className="hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col justify-between p-10 xl:p-14 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(165deg, #04141A 0%, #061F27 35%, #092F3A 70%, #061F27 100%)',
      }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[36rem] h-[36rem] rounded-full bg-primary-500/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 w-[28rem] h-[28rem] rounded-full bg-gold-400/[0.06] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 dot-bg opacity-[0.06]" />

      {/* Ornamental arches */}
      <svg
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] opacity-[0.06]"
        viewBox="0 0 800 600"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <path d="M80 520 V280 a160 160 0 0 1 320 0 V520" stroke="currentColor" strokeWidth="2" className="text-primary-300" />
        <path d="M400 520 V280 a160 160 0 0 1 320 0 V520" stroke="currentColor" strokeWidth="2" className="text-primary-300" />
        <path d="M180 520 V360 a80 80 0 0 1 160 0 V520" stroke="currentColor" strokeWidth="1.5" className="text-primary-300" />
        <path d="M500 520 V360 a80 80 0 0 1 160 0 V520" stroke="currentColor" strokeWidth="1.5" className="text-primary-300" />
        <line x1="60" y1="520" x2="740" y2="520" stroke="currentColor" strokeWidth="2.5" className="text-primary-300" />
        <line x1="240" y1="280" x2="240" y2="520" stroke="currentColor" strokeWidth="1" className="text-gold-400" strokeDasharray="4 4" />
        <line x1="560" y1="280" x2="560" y2="520" stroke="currentColor" strokeWidth="1" className="text-gold-400" strokeDasharray="4 4" />
        <circle cx="240" cy="280" r="6" stroke="currentColor" strokeWidth="1.5" className="text-gold-400" fill="none" />
        <circle cx="560" cy="280" r="6" stroke="currentColor" strokeWidth="1.5" className="text-gold-400" fill="none" />
      </svg>

      {/* Top: Logo */}
      <div className="relative z-10 animate-fade-up">
        <div className="flex items-center gap-2.5">
          <div className="relative rounded-xl overflow-hidden shadow-soft bg-white shrink-0 w-10 h-10">
            <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
          </div>
          <div className="leading-none">
            <div
              className="text-white tracking-tight leading-none"
              style={{ fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif', fontSize: '1.6rem', fontWeight: 700 }}
            >
              مُحَكِّم
            </div>
            <div className="text-[0.58rem] font-500 text-primary-200/60 tracking-[0.2em] mt-0.5">MUHAKEM</div>
          </div>
        </div>
      </div>

      {/* Center: Custom content or brand statement */}
      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md animate-fade-up animate-delay-200">
        {children ?? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <Scale className="w-7 h-7 text-gold-400" strokeWidth={1.5} />
              <span className="h-px w-12 bg-gradient-to-l from-gold-400/60 to-transparent" />
            </div>
            <h1
              className="text-white text-3xl xl:text-4xl leading-[1.2] font-700"
              style={{ fontFamily: '"IBM Plex Sans Arabic", "Cairo", sans-serif' }}
            >
              ذكاء قانوني للمحامين المصريين
            </h1>
            <p className="mt-4 text-primary-200/70 text-sm font-500 tracking-[0.15em] uppercase">
              بحث • صياغة • مراجعة • قرار
            </p>
          </>
        )}
      </div>

      {/* Bottom: Trust badges */}
      <div className="relative z-10 flex items-center gap-5 animate-fade-up">
        {trustItems.map((item, i) => (
          <span key={i} className="flex items-center gap-2 text-primary-200/60 text-[0.72rem] font-500">
            <item.icon className="w-3.5 h-3.5 text-gold-400/80" strokeWidth={1.5} />
            {item.label}
            {i < trustItems.length - 1 && <span className="w-1 h-1 rounded-full bg-primary-300/30 mx-1" />}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   AuthShell — split layout wrapper
   ════════════════════════════════════════════════ */

export function AuthShell({
  children,
  brandingChildren,
}: {
  children: ReactNode;
  brandingChildren?: ReactNode;
}) {
  return (
    <div className="h-screen w-full flex overflow-hidden" dir="rtl" style={{ background: '#F7F5EF' }}>
      <BrandingPanel>{brandingChildren}</BrandingPanel>
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 relative overflow-y-auto">
        {/* Mobile background accents */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden">
          <div className="absolute -top-20 right-1/4 w-72 h-72 rounded-full bg-primary-500/[0.05] blur-3xl" />
          <div className="absolute bottom-0 -left-10 w-60 h-60 rounded-full bg-gold-400/[0.04] blur-3xl" />
          <div className="absolute inset-0 dot-bg opacity-30" />
        </div>
        {children}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   MobileLogo — shown on small screens only
   ════════════════════════════════════════════════ */

export function MobileLogo() {
  return (
    <div className="lg:hidden relative z-10 mb-8 animate-fade-up">
      <div className="flex items-center gap-2.5">
        <div className="relative rounded-xl overflow-hidden shadow-soft bg-white shrink-0 w-10 h-10">
          <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
        </div>
        <div className="leading-none">
          <div
            className="text-primary-700 tracking-tight leading-none"
            style={{ fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif', fontSize: '1.5rem', fontWeight: 700 }}
          >
            مُحَكِّم
          </div>
          <div className="text-[0.58rem] font-500 text-sand-400 tracking-[0.2em] mt-0.5">MUHAKEM</div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   LanguageSwitch
   ════════════════════════════════════════════════ */

export function LanguageSwitch({
  lang,
  onSwitch,
}: {
  lang: 'ar' | 'en';
  onSwitch: () => void;
}) {
  return (
    <button
      onClick={onSwitch}
      className="relative z-10 absolute top-6 ltr:right-6 rtl:left-6 flex items-center gap-1.5 rounded-xl bg-white border border-sand-200 px-3 py-1.5 text-[0.72rem] font-600 text-sand-600 hover:border-sand-300 hover:text-ink transition-all duration-200 ease-out-expo focus-ring"
      aria-label="Switch language"
    >
      <Globe className="w-3.5 h-3.5 text-sand-400" strokeWidth={1.5} />
      <span className={cn(lang === 'ar' && 'text-primary-600')}>العربية</span>
      <span className="text-sand-300">|</span>
      <span className={cn(lang === 'en' && 'text-primary-600')}>EN</span>
    </button>
  );
}

/* ════════════════════════════════════════════════
   AuthCard — the white card container
   ════════════════════════════════════════════════ */

export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('relative z-10 w-full max-w-[420px] animate-scale-in', className)}
      style={{ animationDelay: '100ms' }}
    >
      <div
        className="bg-white rounded-3xl border border-sand-200 px-7 py-8 md:px-9 md:py-10"
        style={{
          boxShadow:
            '0 1px 3px rgba(15,76,92,0.05), 0 8px 28px rgba(15,76,92,0.08), 0 24px 64px -12px rgba(15,76,92,0.10)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FormField — labeled input with icon
   ════════════════════════════════════════════════ */

import { Mail, Lock, User, type LucideIcon } from 'lucide-react';

export function FormField({
  label,
  icon: Icon,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  dir,
  autoComplete,
  rightSlot,
  autoFocus,
}: {
  label: string;
  icon: LucideIcon;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: boolean;
  dir?: 'rtl' | 'ltr';
  autoComplete?: string;
  rightSlot?: ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-[0.76rem] font-600 text-sand-700 mb-1.5">{label}</label>
      <div
        className={cn(
          'relative flex items-center rounded-2xl border bg-sand-50/50 transition-all duration-200 ease-out-expo',
          error
            ? 'border-danger-300'
            : 'border-sand-200 focus-within:border-primary-400 focus-within:bg-white focus-within:shadow-soft',
        )}
      >
        <Icon
          className={cn('w-4 h-4 shrink-0 mx-3.5 transition-colors duration-200', error ? 'text-danger-400' : 'text-sand-400')}
          strokeWidth={1.5}
        />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="flex-1 bg-transparent outline-none py-3 text-[0.85rem] text-ink placeholder:text-sand-400"
          style={{ textAlign: dir === 'ltr' ? 'left' : 'right' }}
        />
        {rightSlot}
      </div>
    </div>
  );
}

export { Mail, Lock, User };
