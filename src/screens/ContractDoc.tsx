import { useState } from 'react';
import {
  RefreshCw,
  Download,
  PenLine,
  Share2,
  Printer,
  History,
  ChevronLeft,
  FileText,
  Calendar,
  Globe,
} from 'lucide-react';
import { cn } from '../lib/cn';
import type { ScreenId } from '../lib/types';

const contractSections = [
  {
    id: 'intro',
    title: 'تمهيد',
    content:
      'إنه في يوم السبت الموافق ١٢/١٠/٢٠٢٤م، تم الاتفاق بين كل من شركة تقنية المستقبل، ويُشار إليها فيما يلي بـ «الطرف الأول»، وبين السيد/ أحمد المحمد، ويُشار إليه فيما يلي بـ «الطرف الثاني».',
    isCentered: true,
  },
  {
    id: 'art1',
    title: 'البند الأول: طبيعة العمل',
    content:
      'يلتزم الطرف الثاني بموجب هذا العقد بالعمل لدى الطرف الأول وتحت إشرافه وإدارته في وظيفة (كبير مطوري نظم)، أو في أي وظيفة أخرى تتماشى في طبيعتها وتتناسب مع مؤهلاته.',
    isCentered: false,
  },
  {
    id: 'art2',
    title: 'البند الثاني: مدة العقد',
    content:
      'مدة هذا العقد سنة ميلادية واحدة تبدأ من تاريخ مباشرة الطرف الثاني للعمل، وتعتبر الـ (٩٠) يومًا الأولى من تاريخ المباشرة فترة تجريبية، يحق خلالها لأي من الطرفين إنهاء العقد دون تعويض أو مكافأة.',
    isCentered: false,
  },
  {
    id: 'art3',
    title: 'البند الثالث: الأجر والمزايا',
    content:
      'يستحق الطرف الثاني لقاء عمله أجرًا شهريًا أساسيًا قدره عشرون ألف ريال، بالإضافة إلى بدل سكن سنوي يعادل أجر ثلاثة أشهر، وبدل نقل شهري قدره ألف ريال.',
    isCentered: false,
  },
  {
    id: 'art4',
    title: 'البند الرابع: السرية وعدم المنافسة',
    content:
      'يتعهد الطرف الثاني بالمحافظة على أسرار الطرف الأول الفنية والتجارية، كما يلتزم بشرط عدم المنافسة لمدة سنتين من تاريخ انتهاء العلاقة التعاقدية في النطاق الجغرافي للمملكة.',
    isCentered: false,
  },
];

export function ContractDoc({ onNavigate }: { onNavigate: (s: ScreenId) => void }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-sand-50">

      {/* ── Sub-header ── */}
      <div className="shrink-0 bg-white border-b border-sand-200 px-6 py-4 shadow-soft">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display font-700 text-ink text-[1.15rem] leading-tight">
              مسودة عقد العمل النهائي
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 border border-success-200 px-3 py-1 text-[0.68rem] font-700 text-success-700">
              <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
              المرحلة ٤: تم التوليد بنجاح
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('contract-gen')}
              className="flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-sand-200 text-ink text-[0.84rem] font-600 hover:bg-sand-50 hover:border-sand-300 shadow-soft transition-all duration-200"
            >
              <RefreshCw className="w-4 h-4" />
              توليد نسخة جديدة
            </button>
            <button
              onClick={() => onNavigate('review')}
              className="flex items-center gap-2 h-10 px-5 rounded-xl bg-primary-500 text-white text-[0.84rem] font-600 hover:bg-primary-600 shadow-soft transition-all duration-200"
            >
              مراجعة المسودة
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="mt-1.5 text-[0.76rem] text-sand-500">
          تمت مراجعة العقد بواسطة الذكاء الاصطناعي لضمان مطابقته لأنظمة العمل الأخيرة.
        </p>
      </div>

      {/* ── Body: document + metadata ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left: scrollable contract paper */}
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto animate-fade-up">
            <div className="rounded-3xl bg-white border border-sand-200 shadow-card overflow-hidden">

              {/* Paper header */}
              <div className="px-10 pt-10 pb-6 border-b border-sand-100 text-center">
                <h1 className="font-display font-700 text-ink text-2xl tracking-tight">
                  عقد عمل فردي
                </h1>
                <p className="mt-2 text-[0.76rem] text-sand-500 leading-relaxed">
                  بموجب أنظمة العمل المرعية
                </p>
              </div>

              {/* Contract sections */}
              <div className="px-8 md:px-12 py-8 space-y-5">
                {contractSections.map((s, i) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveSection(s.id === activeSection ? null : s.id)}
                    className={cn(
                      'rounded-2xl p-5 border cursor-pointer transition-all duration-200',
                      activeSection === s.id
                        ? 'border-primary-200 bg-primary-50/40 ring-2 ring-primary-500/10'
                        : 'border-transparent hover:border-sand-200 hover:bg-sand-50',
                    )}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <h3 className="font-display font-700 text-ink text-[0.93rem] mb-2.5 text-center">
                      {s.title}
                    </h3>
                    <p
                      className={cn(
                        'text-[0.875rem] text-ink leading-[2.1]',
                        s.isCentered ? 'text-center' : 'text-justify',
                      )}
                    >
                      {s.content}
                    </p>
                  </div>
                ))}

                {/* Signature */}
                <div className="pt-8 border-t border-sand-200">
                  <p className="text-center text-[0.8rem] text-sand-500 mb-6">
                    حُرر هذا العقد من نسختين أصليتين، يعتد بكل منهما حجةً قانونية
                  </p>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="text-center space-y-3">
                      <p className="text-[0.78rem] font-700 text-ink">الطرف الأول (صاحب العمل)</p>
                      <div className="h-[68px] rounded-xl border-2 border-dashed border-sand-200 flex items-center justify-center text-[0.72rem] text-sand-400">
                        التوقيع والختم
                      </div>
                    </div>
                    <div className="text-center space-y-3">
                      <p className="text-[0.78rem] font-700 text-ink">الطرف الثاني (العامل)</p>
                      <div className="h-[68px] rounded-xl border-2 border-dashed border-sand-200 flex items-center justify-center text-[0.72rem] text-sand-400">
                        التوقيع
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: metadata panel */}
        <aside className="no-print shrink-0 w-[220px] border-r border-sand-200 bg-white overflow-y-auto">
          <div className="px-4 py-5 space-y-4">
            <MetaCard
              icon={<FileText className="w-3.5 h-3.5" />}
              label="نوع الوثيقة"
              value="عقد عمل"
            />
            <MetaCard
              icon={<Globe className="w-3.5 h-3.5" />}
              label="الاختصاص القضائي"
              value="الاختصاص المحلي"
            />
            <MetaCard
              icon={<Calendar className="w-3.5 h-3.5" />}
              label="تاريخ الإنشاء"
              value="١٢ أكتوبر ٢٠٢٤"
            />
          </div>
        </aside>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="no-print shrink-0 border-t border-sand-200 bg-white px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 h-10 px-4 rounded-xl border border-sand-300 text-ink text-[0.82rem] font-600 hover:bg-sand-50 transition-all duration-200 shadow-soft">
            <Download className="w-4 h-4" />
            تحميل بصيغة PDF
          </button>
          <button className="flex items-center gap-2 h-10 px-4 rounded-xl bg-ink text-white text-[0.82rem] font-600 hover:bg-ink/90 transition-all duration-200 shadow-soft">
            <PenLine className="w-4 h-4" />
            تحميل المسودة
          </button>
        </div>
        <div className="flex items-center gap-1">
          <ActionBtn icon={<Share2 className="w-4 h-4" />} label="مشاركة" />
          <ActionBtn icon={<Printer className="w-4 h-4" />} label="طباعة" />
          <ActionBtn icon={<History className="w-4 h-4" />} label="سجل التغييرات" />
        </div>
      </div>
    </div>
  );
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-sand-50 border border-sand-200 px-3.5 py-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-sand-500">
        <span className="text-primary-500">{icon}</span>
        <span className="text-[0.68rem] font-600 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-[0.82rem] font-700 text-ink leading-snug">{value}</p>
    </div>
  );
}

function ActionBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-sand-600 text-[0.78rem] font-600 hover:bg-sand-100 hover:text-ink transition-colors duration-200">
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
