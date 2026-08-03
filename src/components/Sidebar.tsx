import {
  Plus,
  MessageSquare,
  Pin,
  Settings,
  Search,
  Sparkles,
  ChevronLeft,
  FileText,
  Scale,
  Gavel,
  Book,
  Trash2,
} from 'lucide-react';
import { Logo, Avatar } from './ui';
import { useSessions, type SessionCard } from '../lib/sessionStore';
import { cn } from '../lib/cn';
import type { ScreenId, ChatKind } from '../lib/types';
import { useState, useMemo } from 'react';

const kindIcon: Record<ChatKind, typeof FileText> = {
  'contract-review': FileText,
  'contract-gen': FileText,
  memo: Book,
  research: Scale,
  case: Gavel,
};

/** يحوّل الـ kind لـ ScreenId */
function kindToScreen(kind: ChatKind): ScreenId {
  if (kind === 'research') return 'research';
  if (kind === 'memo') return 'memo';
  if (kind === 'contract-gen') return 'contract-gen';
  return 'review';
}

/** يرجّع النص النسبي للتاريخ */
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'أمس';
  if (days < 7) return `قبل ${days} أيام`;
  if (days < 30) return `قبل ${Math.floor(days / 7)} أسبوع`;
  return `قبل ${Math.floor(days / 30)} شهر`;
}

function ChatRow({
  session,
  active,
  onClick,
  onPin,
  onDelete,
  collapsed,
}: {
  session: SessionCard;
  active?: boolean;
  onClick?: () => void;
  onPin?: () => void;
  onDelete?: () => void;
  collapsed?: boolean;
}) {
  const Icon = kindIcon[session.kind] ?? MessageSquare;

  if (collapsed) {
    return (
      <div className="relative group">
        <span
          onClick={onClick}
          className="grid place-items-center w-10 h-10 rounded-xl bg-sand-100 text-sand-500 hover:bg-primary-50 hover:text-primary-600 transition-all duration-200 ease-out-expo cursor-pointer"
          title={session.title}
        >
          <Icon className="w-4 h-4" />
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      'group flex items-center gap-1 rounded-xl transition-all duration-200 ease-out-expo',
      active ? 'bg-primary-50' : 'hover:bg-sand-100',
    )}>
      <button
        onClick={onClick}
        className={cn(
          'flex-1 min-w-0 flex items-center gap-3 rounded-xl px-3 py-2.5 text-right',
          active ? 'text-primary-700' : 'text-sand-700',
        )}
      >
        <span
          className={cn(
            'grid place-items-center w-8 h-8 rounded-lg shrink-0 transition-all duration-200 ease-out-expo',
            active ? 'bg-primary-500 text-white' : 'bg-sand-100 text-sand-500 group-hover:bg-sand-200',
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-[0.82rem] font-600 leading-tight">{session.title}</span>
          {session.preview && (
            <span className="block text-[0.68rem] text-sand-500 mt-0.5 truncate">{session.preview}</span>
          )}
          <span className="block text-[0.62rem] text-sand-400 mt-0.5">{relativeTime(session.updatedAt)}</span>
        </span>
      </button>
      {/* Pin + Delete buttons (appear on hover) */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
        <button
          onClick={(e) => { e.stopPropagation(); onPin?.(); }}
          className={cn(
            'grid place-items-center w-7 h-7 rounded-lg transition-colors',
            session.pinned
              ? 'text-gold-400 hover:bg-gold-50'
              : 'text-sand-300 hover:bg-sand-100 hover:text-sand-500',
          )}
          title={session.pinned ? 'إلغاء التثبيت' : 'تثبيت'}
        >
          <Pin className={cn('w-3 h-3', session.pinned && 'fill-gold-400')} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
          className="grid place-items-center w-7 h-7 rounded-lg text-sand-300 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="حذف"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

export function Sidebar({
  current,
  onNavigate,
  onNewChat,
  onOpenSession,
  collapsed,
  onToggle,
}: {
  current: ScreenId;
  onNavigate: (s: ScreenId) => void;
  onNewChat: () => void;
  onOpenSession?: (session: SessionCard) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { pinnedSessions, recentSessions, togglePin, remove } = useSessions();
  const [search, setSearch] = useState('');

  const filteredPinned = useMemo(() => {
    if (!search) return pinnedSessions;
    const q = search.toLowerCase();
    return pinnedSessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.preview.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [pinnedSessions, search]);

  const filteredRecent = useMemo(() => {
    if (!search) return recentSessions;
    const q = search.toLowerCase();
    return recentSessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.preview.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [recentSessions, search]);

  const hasAny = filteredPinned.length > 0 || filteredRecent.length > 0;

  const handleOpenSession = (session: SessionCard) => {
    if (onOpenSession) {
      onOpenSession(session);
    } else {
      onNavigate(kindToScreen(session.kind));
    }
  };

  return (
    <>
      <aside
        className={cn(
          'relative h-full flex flex-col bg-white border-l border-sand-200 transition-[width] duration-500 ease-out-expo shrink-0',
          collapsed ? 'w-[76px]' : 'w-[300px]',
        )}
      >
        {/* Brand + collapse */}
        <div className="flex items-center justify-between px-4 h-[68px] border-b border-sand-200">
          {collapsed ? (
            <div className="flex items-center justify-center w-full">
              <div className="relative rounded-xl overflow-hidden shadow-soft bg-white w-9 h-9">
                <img src="/favicon.jpeg" alt="مُحَكِّم" className="w-full h-full object-cover" />
              </div>
            </div>
          ) : (
            <Logo />
          )}
          <button
            onClick={onToggle}
            aria-label="طي القائمة"
            className={cn(
              'grid place-items-center w-8 h-8 rounded-lg text-sand-500 hover:bg-sand-100 hover:text-ink transition-all duration-200 ease-out-expo',
              collapsed && 'absolute -left-3 top-1/2 -translate-y-1/2 bg-white border border-sand-200 shadow-soft z-10',
            )}
          >
            <ChevronLeft className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 pt-4">
          <button
            onClick={onNewChat}
            className={cn(
              'group flex items-center gap-3 rounded-2xl bg-primary-500 text-white hover:bg-primary-600 shadow-soft hover:shadow-card transition-all duration-300 active:scale-[0.98] focus-ring',
              collapsed ? 'w-12 h-12 justify-center mx-auto' : 'w-full h-12 px-4',
            )}
          >
            <Plus className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="font-600 text-sm">جلسة قانونية جديدة</span>}
          </button>
        </div>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2 rounded-xl bg-sand-100 px-3 h-10 text-sand-500">
              <Search className="w-4 h-4" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث في الجلسات..."
                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-sand-400"
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-sand-400 hover:text-ink">
                  <span className="text-xs">✕</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4 no-scrollbar">
          {!collapsed ? (
            <div className="space-y-5 animate-fade-in">
              {/* Pinned */}
              {filteredPinned.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 mb-2 text-[0.66rem] font-700 tracking-[0.18em] text-sand-500 uppercase">
                    <Pin className="w-3 h-3" /> مثبّتة
                  </div>
                  <div className="space-y-1">
                    {filteredPinned.map((s) => (
                      <ChatRow
                        key={s.id}
                        session={s}
                        active={current === kindToScreen(s.kind)}
                        onClick={() => handleOpenSession(s)}
                        onPin={() => togglePin(s.id)}
                        onDelete={() => remove(s.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent */}
              {filteredRecent.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-3 mb-2 text-[0.66rem] font-700 tracking-[0.18em] text-sand-500 uppercase">
                    <MessageSquare className="w-3 h-3" /> الجلسات الأخيرة
                  </div>
                  <div className="space-y-1">
                    {filteredRecent.map((s) => (
                      <ChatRow
                        key={s.id}
                        session={s}
                        active={current === kindToScreen(s.kind)}
                        onClick={() => handleOpenSession(s)}
                        onPin={() => togglePin(s.id)}
                        onDelete={() => remove(s.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!hasAny && (
                <div className="text-center py-10">
                  <div className="grid place-items-center w-12 h-12 rounded-2xl bg-sand-100 text-sand-400 mx-auto mb-3">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <p className="text-sand-500 text-[0.82rem] font-600">لا توجد جلسات بعد</p>
                  <p className="text-sand-400 text-[0.7rem] mt-1">ابدأ بمهمة جديدة وستظهر هنا</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 pt-2">
              {pinnedSessions.length > 0
                ? pinnedSessions.slice(0, 6).map((s) => {
                    const Icon = kindIcon[s.kind] ?? MessageSquare;
                    return (
                      <span
                        key={s.id}
                        onClick={() => handleOpenSession(s)}
                        className="grid place-items-center w-10 h-10 rounded-xl bg-sand-100 text-sand-500 hover:bg-primary-50 hover:text-primary-600 transition-all duration-200 ease-out-expo cursor-pointer"
                        title={s.title}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                    );
                  })
                : recentSessions.slice(0, 6).map((s) => {
                    const Icon = kindIcon[s.kind] ?? MessageSquare;
                    return (
                      <span
                        key={s.id}
                        onClick={() => handleOpenSession(s)}
                        className="grid place-items-center w-10 h-10 rounded-xl bg-sand-100 text-sand-500 hover:bg-primary-50 hover:text-primary-600 transition-all duration-200 ease-out-expo cursor-pointer"
                        title={s.title}
                      >
                        <Icon className="w-4 h-4" />
                      </span>
                    );
                  })}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="border-t border-sand-200 p-3 space-y-1">
          <NavItem
            icon={<MessageSquare className="w-4 h-4" />}
            label="سجل المحادثات"
            collapsed={collapsed}
            active={current === 'history'}
            onClick={() => onNavigate('history')}
          />
          <NavItem
            icon={<Settings className="w-4 h-4" />}
            label="الإعدادات"
            collapsed={collapsed}
          />
        </div>

        {/* Profile */}
        <div className="border-t border-sand-200 p-3">
          <div
            className={cn(
              'flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-sand-100 transition-all duration-200 ease-out-expo cursor-pointer',
              collapsed && 'justify-center',
            )}
          >
            <Avatar name="عمر الخالد" size={36} />
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[0.82rem] font-600 text-ink truncate">عمر الخالد</div>
                <div className="text-[0.66rem] text-sand-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-gold-400" /> خطة المحترف
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 h-10 transition-all duration-200 ease-out-expo w-full',
        active ? 'bg-primary-50 text-primary-700' : 'text-sand-600 hover:bg-sand-100 hover:text-ink',
        collapsed && 'justify-center',
      )}
    >
      <span className={cn('shrink-0', active && 'text-primary-600')}>{icon}</span>
      {!collapsed && <span className="text-[0.82rem] font-600">{label}</span>}
    </button>
  );
}
