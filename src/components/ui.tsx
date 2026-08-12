import { useEffect, useState, useRef, useCallback, type ReactNode, type MouseEvent } from 'react';
import { cn } from '../lib/cn';

/* ---------------- Ripple hook ---------------- */
function useRipple() {
  const ripples = useRef<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const [renderKey, setRenderKey] = useState(0);
  const idRef = useRef(0);

  const addRipple = useCallback((e: MouseEvent<HTMLElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = idRef.current++;
    ripples.current.push({ id, x, y, size });
    setRenderKey((k) => k + 1);
    setTimeout(() => {
      ripples.current = ripples.current.filter((r) => r.id !== id);
      setRenderKey((k) => k + 1);
    }, 250);
  }, []);

  return { ripples: ripples.current, addRipple, renderKey };
}

/* ---------------- Logo ---------------- */
export function Logo({ size = 36, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className="relative rounded-xl overflow-hidden shadow-soft shrink-0 bg-white"
        style={{ width: size, height: size }}
      >
        <img
          src="/favicon.jpeg"
          alt="مُحَكِّم"
          className="w-full h-full object-cover"
        />
      </div>
      {withWordmark && (
        <div className="leading-none">
          <div
            className="text-primary-700 tracking-tight leading-none"
            style={{
              fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif',
              fontSize: size * 0.58,
              fontWeight: 700,
            }}
          >
            مُحَكِّم
          </div>
          <div className="text-[0.58rem] font-500 text-sand-400 tracking-[0.2em] mt-0.5">MUHAKEM</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Button ---------------- */
type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'accent' | 'ghost' | 'outline' | 'gold' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  iconRight?: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  full?: boolean;
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  className,
  onClick,
  type = 'button',
  disabled,
  full,
}: ButtonProps) {
  const { ripples, addRipple, renderKey } = useRipple();
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-b from-primary-500 to-primary-600 text-white hover:from-primary-500 hover:to-primary-700 shadow-soft hover:shadow-card',
    accent:
      'bg-gradient-to-b from-accent-500 to-accent-600 text-white hover:from-accent-500 hover:to-accent-700 shadow-soft hover:shadow-card',
    gold: 'bg-gradient-to-b from-gold-300 to-gold-400 text-primary-900 hover:from-gold-400 hover:to-gold-500 shadow-soft',
    ghost: 'text-ink hover:bg-sand-100',
    outline: 'border border-sand-200 bg-white text-ink hover:bg-sand-50 hover:border-sand-300 shadow-soft hover:shadow-card',
    danger: 'bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-500 hover:to-red-700 shadow-soft',
  };
  const sizes: Record<string, string> = {
    sm: 'h-9 px-3.5 text-[0.8rem] gap-1.5 rounded-xl',
    md: 'h-11 px-5 text-sm gap-2 rounded-2xl',
    lg: 'h-14 px-7 text-[0.95rem] gap-2.5 rounded-2xl',
  };
  return (
    <button
      type={type}
      onClick={(e) => { addRipple(e); onClick?.(); }}
      disabled={disabled}
      className={cn(
        'ripple-container relative inline-flex items-center justify-center font-600 transition-all duration-200 ease-out-expo focus-ring active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
    >
      {icon && <span className="relative z-10 shrink-0">{icon}</span>}
      <span className="relative z-10">{children}</span>
      {iconRight && <span className="relative z-10 shrink-0">{iconRight}</span>}
      {ripples.map((r) => (
        <span
          key={`${r.id}-${renderKey}`}
          className="ripple"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            background: variant === 'ghost' || variant === 'outline' ? 'rgba(9,47,58,0.15)' : 'rgba(255,255,255,0.35)',
          }}
        />
      ))}
    </button>
  );
}

/* ---------------- IconButton ---------------- */
export function IconButton({
  children,
  label,
  onClick,
  active,
  className,
  size = 'md',
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { ripples, addRipple, renderKey } = useRipple();
  const sizes = {
    sm: 'w-8 h-8 rounded-lg',
    md: 'w-10 h-10 rounded-xl',
    lg: 'w-12 h-12 rounded-2xl',
  };
  return (
    <button
      aria-label={label}
      title={label}
      onClick={(e) => { addRipple(e); onClick?.(); }}
      className={cn(
        'ripple-container relative grid place-items-center transition-all duration-200 ease-out-expo focus-ring active:scale-95',
        active
          ? 'bg-primary-500 text-white shadow-soft'
          : 'text-sand-600 hover:bg-sand-100 hover:text-ink',
        sizes[size],
        className,
      )}
    >
      <span className="relative z-10">{children}</span>
      {ripples.map((r) => (
        <span
          key={`${r.id}-${renderKey}`}
          className="ripple"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            background: active ? 'rgba(255,255,255,0.3)' : 'rgba(9,47,58,0.1)',
          }}
        />
      ))}
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({
  children,
  className,
  hover,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'card-surface card-sheen transition-all duration-200 ease-out-expo',
        hover && 'hover:shadow-lift hover:-translate-y-1 hover:border-sand-300 cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  dot,
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'primary' | 'accent' | 'gold' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-sand-100 text-sand-700 border-sand-200',
    primary: 'bg-primary-50 text-primary-600 border-primary-100',
    accent: 'bg-accent-50 text-accent-600 border-accent-100',
    gold: 'bg-gold-50 text-gold-600 border-gold-100',
    success: 'bg-success-50 text-success-700 border-success-100',
    warning: 'bg-warning-50 text-warning-700 border-warning-100',
    danger: 'bg-danger-50 text-danger-700 border-danger-100',
  };
  const sizes = {
    sm: 'text-[0.62rem] px-1.5 py-0.5 gap-1',
    md: 'text-[0.7rem] px-2.5 py-1 gap-1.5',
  };
  const dotColor: Record<string, string> = {
    neutral: 'bg-sand-400',
    primary: 'bg-primary-500',
    accent: 'bg-accent-500',
    gold: 'bg-gold-400',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center font-600 rounded-full border tracking-wide',
        tones[tone],
        sizes[size],
        className,
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dotColor[tone])} />}
      {children}
    </span>
  );
}

/* ---------------- RiskBadge ---------------- */
import { Check, AlertTriangle, X } from 'lucide-react';
export function RiskBadge({ status, size = 'md' }: { status: 'safe' | 'review' | 'risk'; size?: 'sm' | 'md' }) {
  const map = {
    safe: { tone: 'success' as const, icon: <Check className="w-3 h-3" />, label: 'آمن' },
    review: { tone: 'warning' as const, icon: <AlertTriangle className="w-3 h-3" />, label: 'مراجعة' },
    risk: { tone: 'danger' as const, icon: <X className="w-3 h-3" />, label: 'عالي المخاطر' },
  };
  const { tone, icon, label } = map[status];
  const dim = size === 'sm' ? 'w-5 h-5 text-[0.6rem]' : 'w-6 h-6 text-[0.65rem]';
  return (
    <span
      className={cn(
        'inline-grid place-items-center rounded-full font-700 shrink-0',
        tone === 'success' && 'bg-success-100 text-success-700',
        tone === 'warning' && 'bg-warning-100 text-warning-700',
        tone === 'danger' && 'bg-danger-100 text-danger-700',
        dim,
      )}
      title={label}
    >
      {icon}
    </span>
  );
}

/* ---------------- Drawer ---------------- */
export function Drawer({
  open,
  onClose,
  children,
  title,
  side = 'right',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  side?: 'right' | 'left';
}) {
  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-primary-900/20 backdrop-blur-sm transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-lift transition-transform duration-500 ease-out-expo flex flex-col',
          side === 'right' ? 'left-0 rounded-r-none' : 'right-0 rounded-l-none',
          side === 'right'
            ? open
              ? 'translate-x-0'
              : '-translate-x-full'
            : open
              ? 'translate-x-0'
              : 'translate-x-full',
          'rounded-3xl',
        )}
        style={{ [side === 'right' ? 'left' : 'right']: 0 }}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-5 border-b border-sand-200">
            <div className="font-display font-700 text-ink">{title}</div>
            <IconButton label="إغلاق" onClick={onClose} size="sm">
              <X className="w-4 h-4" />
            </IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </>
  );
}

/* ---------------- Progress ---------------- */
export function Progress({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'accent' | 'gold' }) {
  const tones = {
    primary: 'bg-primary-500',
    accent: 'bg-accent-500',
    gold: 'bg-gold-400',
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-sand-200 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-700 ease-out-expo', tones[tone])}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/* ---------------- TypingDots ---------------- */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-pulse-soft"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

/* ---------------- Typewriter ---------------- */
export function Typewriter({
  text,
  speed = 18,
  onDone,
  className,
}: {
  text: string;
  speed?: number;
  onDone?: () => void;
  className?: string;
}) {
  const [out, setOut] = useState('');
  useEffect(() => {
    setOut('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return <span className={className}>{out}</span>;
}

/* ---------------- SectionTitle ---------------- */
export function SectionTitle({
  eyebrow,
  title,
  desc,
  center,
}: {
  eyebrow?: string;
  title: ReactNode;
  desc?: string;
  center?: boolean;
}) {
  return (
    <div className={cn('max-w-2xl', center && 'mx-auto text-center')}>
      {eyebrow && (
        <div className="text-[0.7rem] font-700 tracking-[0.2em] text-accent-600 mb-3 uppercase">
          {eyebrow}
        </div>
      )}
      <h2 className="font-display font-700 text-ink text-2xl md:text-3xl leading-tight text-balance">
        {title}
      </h2>
      {desc && <p className="mt-3 text-sand-600 leading-relaxed text-[0.95rem]">{desc}</p>}
    </div>
  );
}

/* ---------------- Divider ---------------- */
export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="h-px bg-sand-200" />;
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-sand-200" />
      <span className="text-[0.7rem] font-600 text-sand-500 tracking-wide">{label}</span>
      <div className="h-px flex-1 bg-sand-200" />
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((s) => s[0])
    .join('');
  return (
    <div
      className="grid place-items-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-700 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

/* ---------------- Tooltip (CSS) ---------------- */
export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute -bottom-9 right-1/2 translate-x-1/2 whitespace-nowrap rounded-lg bg-primary-900 px-2.5 py-1.5 text-[0.7rem] text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50">
        {label}
      </span>
    </span>
  );
}
