import { useEffect, useState } from 'react';
import {
  FileDown,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Gauge,
  Scale,
  ArrowLeft,
  TrendingUp,
} from 'lucide-react';
import { Button, RiskBadge, Badge, Card } from '../components/ui';
import { contractClauses } from '../lib/mock';
import { cn } from '../lib/cn';
import type { ScreenId } from '../lib/types';

const score = 92;

const statCards = [
  { label: 'بنود آمنة', value: 3, icon: CheckCircle2, tone: 'success' as const },
  { label: 'بنود عالية المخاطر', value: 2, icon: XCircle, tone: 'danger' as const },
  { label: 'تحتاج مراجعة', value: 2, icon: AlertTriangle, tone: 'warning' as const },
  { label: 'نسبة الامتثال', value: '88%', icon: Gauge, tone: 'primary' as const },
];

const toneStyles: Record<string, { bg: string; text: string; ring: string }> = {
  success: { bg: 'bg-success-50', text: 'text-success-600', ring: 'ring-success-100' },
  danger: { bg: 'bg-danger-50', text: 'text-danger-600', ring: 'ring-danger-100' },
  warning: { bg: 'bg-warning-50', text: 'text-warning-600', ring: 'ring-warning-100' },
  primary: { bg: 'bg-primary-50', text: 'text-primary-600', ring: 'ring-primary-100' },
};

const references = [
  { code: 'م ١٠٤', title: 'نظام المرافعات — تقدير التعويض' },
  { code: 'م ١٢٠', title: 'نظام المدنيات — الفسخ التعسفي' },
  { code: 'م ٥١', title: 'نظام العمل — مدة العقد وتجديده' },
  { code: 'م ٢', title: 'نظام التحكيم — اختصاص المحكمين' },
];

export function Report({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  return (
    <div className="h-full overflow-y-auto px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 animate-fade-up">
          <div>
            <div className="text-[0.7rem] font-700 tracking-[0.18em] text-accent-600 uppercase mb-1.5">
              تقرير التدقيق
            </div>
            <h1 className="font-display font-700 text-ink text-2xl md:text-3xl">
              تقرير العقد الشامل
            </h1>
            <p className="text-sand-500 text-sm mt-1">عقد شراكة — شركة XYZ · اليوم</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={<ArrowLeft className="w-4 h-4" />} onClick={() => onNavigate('review')}>
              العودة للعقد
            </Button>
            <Button variant="primary" icon={<FileDown className="w-4 h-4" />}>
              تحميل PDF
            </Button>
          </div>
        </div>

        {/* Score hero */}
        <Card className="p-6 md:p-8 mb-6 animate-fade-up animate-delay-100">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <ScoreRing value={score} />
            <div className="flex-1 text-center md:text-right">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                <ShieldCheck className="w-5 h-5 text-success" />
                <h2 className="font-display font-700 text-ink text-xl">التقييم العام</h2>
              </div>
              <p className="text-sand-600 text-[0.9rem] leading-relaxed max-w-md">
                العقد في حالة جيدة عمومًا، مع وجود بندين عاليي المخاطر يتطلبان تعديلًا جوهريًا قبل التوقيع. التزم ببنود حسن النية والتوازن العقدي.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
                <Badge tone="success" dot>متوافق غالبًا</Badge>
                <Badge tone="warning" dot>يحتاج ٤ إصلاحات</Badge>
                <Badge tone="primary">آخر تحليل: اليوم</Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
          {statCards.map((s) => {
            const t = toneStyles[s.tone];
            const Icon = s.icon;
            return (
              <Card key={s.label} className="p-5 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className={cn('grid place-items-center w-11 h-11 rounded-2xl ring-1', t.bg, t.text, t.ring)}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className={cn('text-[0.62rem] font-600 flex items-center gap-0.5', t.text)}>
                    <TrendingUp className="w-3 h-3" />
                  </span>
                </div>
                <div className="mt-4 font-display font-700 text-ink text-2xl tnum">{s.value}</div>
                <div className="text-[0.78rem] text-sand-500 mt-0.5">{s.label}</div>
                <div className={cn('pointer-events-none absolute -bottom-6 -left-6 w-20 h-20 rounded-full blur-2xl opacity-40', t.bg)} />
              </Card>
            );
          })}
        </div>

        {/* Clauses table */}
        <Card className="mb-8 overflow-hidden animate-fade-up">
          <div className="px-6 py-4 border-b border-sand-200 flex items-center justify-between">
            <h3 className="font-display font-700 text-ink">تفصيل البنود</h3>
            <Badge tone="neutral" size="sm">٧ بنود</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-[0.7rem] font-700 text-sand-500 uppercase tracking-wide bg-sand-50">
                  <th className="px-6 py-3 font-700">البند</th>
                  <th className="px-6 py-3 font-700">الحالة</th>
                  <th className="px-6 py-3 font-700">المخاطرة</th>
                  <th className="px-6 py-3 font-700">المرجع</th>
                  <th className="px-6 py-3 font-700">الأساس القانوني</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {contractClauses.map((c) => (
                  <tr key={c.id} className="hover:bg-sand-50/60 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.7rem] font-700 text-sand-500 bg-sand-100 rounded-md px-1.5 py-0.5">
                          {c.number}
                        </span>
                        <span className="font-600 text-ink text-[0.88rem]">{c.title}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <RiskBadge status={c.status} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-sand-200 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              c.status === 'safe' && 'bg-success',
                              c.status === 'review' && 'bg-warning',
                              c.status === 'risk' && 'bg-danger',
                            )}
                            style={{ width: `${c.riskScore}%` }}
                          />
                        </div>
                        <span className="text-[0.72rem] font-600 text-sand-600">{c.riskScore}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {c.legalRef ? (
                        <span className="text-[0.74rem] font-700 text-primary-700 bg-primary-50 rounded-md px-2 py-1 whitespace-nowrap">
                          {c.legalRef}
                        </span>
                      ) : (
                        <span className="text-[0.72rem] text-sand-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      {c.legalBasis ? (
                        <p className="text-[0.78rem] leading-relaxed text-sand-700">{c.legalBasis}</p>
                      ) : (
                        <span className="text-[0.72rem] text-sand-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* References */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <Card className="p-6 animate-fade-up">
            <div className="flex items-center gap-2 mb-4">
              <div className="grid place-items-center w-9 h-9 rounded-xl bg-primary-50 text-primary-600">
                <Scale className="w-4 h-4" />
              </div>
              <h3 className="font-display font-700 text-ink">المراجع القانونية</h3>
            </div>
            <div className="space-y-2">
              {references.map((r) => (
                <div
                  key={r.code}
                  className="flex items-center justify-between rounded-xl border border-sand-200 px-4 py-3 hover:bg-sand-50 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[0.7rem] font-700 text-primary-600 bg-primary-50 rounded-md px-2 py-1">
                      {r.code}
                    </span>
                    <span className="text-[0.85rem] font-600 text-ink">{r.title}</span>
                  </div>
                  <ArrowLeft className="w-4 h-4 text-sand-400 group-hover:text-primary-600 group-hover:-translate-x-1 transition-all" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Download */}
        <div className="rounded-3xl bg-gradient-to-l from-primary-500 to-primary-700 p-6 md:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-up">
          <div>
            <h3 className="font-display font-700 text-xl">جاهز للتنزيل</h3>
            <p className="text-white/80 text-sm mt-1">تقرير شامل بصيغة PDF جاهز للمحكمة أو الأرشفة</p>
          </div>
          <Button variant="gold" icon={<FileDown className="w-4 h-4" />} className="shrink-0">
            تحميل التقرير PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const dur = 1200;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const offset = c - (display / 100) * c;
  return (
    <div className="relative grid place-items-center shrink-0">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#E6E2DA" strokeWidth="10" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#0F4C5C" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute text-center">
        <div className="font-display font-700 text-ink text-3xl leading-none tnum">{display}%</div>
        <div className="text-[0.62rem] font-600 text-sand-500 mt-1">النتيجة</div>
      </div>
    </div>
  );
}
