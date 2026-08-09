import { useEffect, useState } from 'react';

export function Splash({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<'hidden' | 'pattern' | 'logo' | 'name' | 'tagline' | 'subline' | 'fade'>('hidden');

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase('pattern'), 100));
    timers.push(setTimeout(() => setPhase('logo'), 500));
    timers.push(setTimeout(() => setPhase('name'), 1100));
    timers.push(setTimeout(() => setPhase('tagline'), 1700));
    timers.push(setTimeout(() => setPhase('subline'), 2100));
    timers.push(setTimeout(() => setPhase('fade'), 2800));
    timers.push(setTimeout(onDone, 3400));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const visible = (p: typeof phase) => {
    const order = ['hidden', 'pattern', 'logo', 'name', 'tagline', 'subline', 'fade'];
    return order.indexOf(phase) >= order.indexOf(p);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden transition-opacity duration-700 ${
        phase === 'fade' ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background:
          'linear-gradient(165deg, #04141A 0%, #061F27 35%, #092F3A 70%, #061F27 100%)',
      }}
    >
      {/* Ambient glows */}
      <div className="pointer-events-none absolute -top-40 right-1/4 w-[36rem] h-[36rem] rounded-full bg-primary-500/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -left-20 w-[28rem] h-[28rem] rounded-full bg-gold-400/[0.06] blur-3xl" />

      {/* Geometric pattern — fades in first */}
      <div
        className={`pointer-events-none absolute inset-0 dot-bg transition-opacity duration-1000 ${
          visible('pattern') ? 'opacity-[0.06]' : 'opacity-0'
        }`}
      />

      {/* Ornamental arches */}
      <svg
        className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] transition-opacity duration-1000 ${
          visible('pattern') ? 'opacity-[0.05]' : 'opacity-0'
        }`}
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

      {/* Logo + brand */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo circle with expanding ring */}
        <div className={`relative ${visible('logo') ? 'splash-logo-in' : 'opacity-0'}`}>
          <div className="absolute inset-0 rounded-2xl border-2 border-gold-400/40 splash-ring" />
          <div className="absolute inset-0 rounded-2xl border border-gold-400/20 splash-ring-2" />
          <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-white w-20 h-20">
            <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Brand name */}
        <div className={`mt-6 text-center transition-opacity duration-700 ${visible('name') ? 'splash-text-in' : 'opacity-0'}`}>
          <div
            className="text-white tracking-tight leading-none"
            style={{
              fontFamily: '"Aref Ruqaa Ink", "Scheherazade New", serif',
              fontSize: '2.4rem',
              fontWeight: 700,
            }}
          >
            مُحَكِّم
          </div>
          <div className="text-[0.65rem] font-500 text-primary-200/60 tracking-[0.3em] mt-1.5">MUHAKEM</div>
        </div>

        {/* Tagline */}
        <div className={`mt-5 transition-opacity duration-700 ${visible('tagline') ? 'splash-text-in' : 'opacity-0'}`}>
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-6 bg-gradient-to-l from-gold-400/60 to-transparent" />
            <p className="text-[0.78rem] font-600 text-gold-400/90 tracking-wide">
              ذكاء قانوني للمحامين المصريين
            </p>
            <span className="h-px w-6 bg-gradient-to-r from-gold-400/60 to-transparent" />
          </div>
        </div>

        {/* Sub-line */}
        <div className={`mt-2.5 transition-opacity duration-500 ${visible('subline') ? 'splash-text-in' : 'opacity-0'}`}>
          <p className="text-[0.68rem] font-500 text-primary-200/50 tracking-[0.2em]">
            بحث • صياغة • مراجعة • قرار
          </p>
        </div>
      </div>

      {/* Loading bar */}
      <div className={`absolute bottom-20 w-48 h-0.5 rounded-full bg-primary-300/10 overflow-hidden ${visible('logo') ? 'splash-bar-in' : 'opacity-0'}`}>
        <div className="h-full rounded-full bg-gradient-to-l from-gold-400 to-primary-400 splash-bar-fill" />
      </div>
    </div>
  );
}
