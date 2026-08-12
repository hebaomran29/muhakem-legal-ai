import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { IconButton, Logo } from './ui';
import { Share2, MoreHorizontal, Bell, ChevronRight } from 'lucide-react';
import type { ScreenId } from '../lib/types';
import type { SessionCard } from '../lib/sessionStore';

const titleMap: Record<ScreenId, { title: string; section: string }> = {
  landing: { title: 'الرئيسية', section: 'الرئيسية' },
  thinking: { title: '', section: 'الأرشيف' },
  'contract-gen': { title: 'صياغة عقد', section: 'الأرشيف' },
  'contract-doc': { title: 'مسودة العقد', section: 'الأرشيف' },
  upload: { title: 'رفع مستند', section: 'الأرشيف' },
  review: { title: 'مراجعة العقد', section: 'التقارير' },
  report: { title: 'تقرير شامل', section: 'التقارير' },
  memo: { title: 'مذكرة دفاع', section: 'الأرشيف' },
  research: { title: 'بحث قانوني', section: 'الأرشيف' },
  history: { title: 'سجل المحادثات', section: 'الأرشيف' },
};

export function WorkspaceShell({
  current,
  onNavigate,
  onNewChat,
  onOpenSession,
  children,
}: {
  current: ScreenId;
  onNavigate: (s: ScreenId) => void;
  onNewChat: () => void;
  onOpenSession?: (session: SessionCard) => void;
  children: ReactNode;
}) {
  const isOverlay = current === 'history';

  return (
    <div className="print-root flex h-screen w-full overflow-hidden bg-sand-100 relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 right-1/4 w-[50rem] h-[50rem] rounded-full bg-primary-500/[0.04] blur-3xl" />
        <div className="absolute bottom-0 -left-20 w-[30rem] h-[30rem] rounded-full bg-gold-400/[0.03] blur-3xl" />
      </div>

      {/* Print-only header */}
      <div className="print-only absolute top-0 right-0 left-0 items-center justify-between px-8 py-5 border-b-2 border-primary-500 bg-white">
        <Logo />
        <div className="text-left">
          <div className="font-display font-700 text-ink text-lg">{titleMap[current].title}</div>
          <div className="text-[0.7rem] text-sand-500">{titleMap[current].section} · مُحَكِّم</div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="no-print relative z-20">
        <Sidebar
          current={current}
          onNavigate={onNavigate}
          onNewChat={onNewChat}
          onOpenSession={onOpenSession}
          collapsed={false}
          onToggle={() => {}}
        />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <div className="no-print">
          <TopBar current={current} onBack={isOverlay ? () => onNavigate('landing') : undefined} />
        </div>
        <main className="print-area flex-1 overflow-hidden min-w-0 relative">
          {children}
        </main>
      </div>
    </div>
  );
}

function TopBar({ current, onBack }: { current: ScreenId; onBack?: () => void }) {
  const t = titleMap[current];
  const isWorkspace = current === 'landing' || current === 'contract-gen' || current === 'review' || current === 'memo' || current === 'research';

  return (
    <header className="h-[64px] shrink-0 glass border-b border-sand-200 flex items-center justify-between px-4 md:px-6 z-20">
      <div className="flex items-center gap-2 text-[0.82rem] min-w-0">
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1 text-primary-600 font-600 hover:text-primary-700 transition-colors duration-200">
            <ChevronRight className="w-4 h-4" />
            رجوع لمساحة العمل
          </button>
        ) : (
          <>
            <span className="font-700 text-ink truncate">{t.title}</span>
            {isWorkspace && t.title !== t.section && (
              <>
                <span className="text-sand-300">/</span>
                <span className="text-sand-400 font-500">{t.section}</span>
              </>
            )}
            {!isWorkspace && (
              <>
                <span className="text-sand-400 font-500">الرئيسية</span>
                <span className="text-sand-300">/</span>
                <span className="text-sand-400 font-500">{t.section}</span>
                <span className="text-sand-300">/</span>
                <span className="font-700 text-ink truncate">{t.title}</span>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
<IconButton label="مشاركة" size="sm">
          <Share2 className="w-4 h-4" />
        </IconButton>
        <IconButton label="الإشعارات" size="sm">
          <span className="relative">
            <Bell className="w-4 h-4" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent-500 ring-2 ring-white" />
          </span>
        </IconButton>
        <IconButton label="المزيد" size="sm">
          <MoreHorizontal className="w-4 h-4" />
        </IconButton>
      </div>
    </header>
  );
}
