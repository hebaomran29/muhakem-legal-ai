import { useState, useEffect, useCallback } from 'react';
import { WorkspaceShell } from './components/WorkspaceShell';
import { Workspace } from './components/Workspace';
import { History } from './screens/History';
import { Report } from './screens/Report';
import { ContractDoc } from './screens/ContractDoc';
import { Login } from './screens/Login';
import { useAuth } from './lib/auth';
import type { ScreenId } from './lib/types';
import type { SessionCard } from './lib/sessionStore';

export default function App() {
  const { loading, user, needsFirm, signOut } = useAuth();
  const [overlayScreen, setOverlayScreen] = useState<ScreenId | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400">
        ...جاري التحميل
      </div>
    );
  }

  if (!user || needsFirm) {
    return <Login />;
  }

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const detail = (e as CustomEvent<ScreenId>).detail;
      if (detail === 'history') {
        setOverlayScreen(detail);
      }
    };
    window.addEventListener('muhakem-navigate', onNavigate);
    return () => window.removeEventListener('muhakem-navigate', onNavigate);
  }, []);

  const handleNavigate = useCallback((s: ScreenId) => {
    if (s === 'history') {
      setOverlayScreen(s);
    } else {
      window.dispatchEvent(new CustomEvent('muhakem-navigate', { detail: s }));
    }
  }, []);

  const handleNewChat = useCallback(() => {
    const fn = (window as unknown as Record<string, unknown>).__muhakemNewSession;
    if (typeof fn === 'function') (fn as () => void)();
    setOverlayScreen(null);
  }, []);

  const handleOpenSession = useCallback((session: SessionCard) => {
    const fn = (window as unknown as Record<string, unknown>).__muhakemOpenSession;
    if (typeof fn === 'function') {
      (fn as (s: SessionCard) => void)(session);
    }
    // لو في overlay (history)، ارجع للـ workspace
    setOverlayScreen(null);
  }, []);

  useEffect(() => {
    const onOpenSession = (e: Event) => {
      const session = (e as CustomEvent<SessionCard>).detail;
      handleOpenSession(session);
    };
    window.addEventListener('muhakem-open-session', onOpenSession);
    return () => window.removeEventListener('muhakem-open-session', onOpenSession);
  }, [handleOpenSession]);

  const currentScreen: ScreenId = overlayScreen ?? 'landing';

  useEffect(() => {
    const onScreenChange = (e: Event) => {
      const detail = (e as CustomEvent<ScreenId>).detail;
      if (detail === 'landing') setOverlayScreen(null);
    };
    window.addEventListener('muhakem-screen-change', onScreenChange);
    return () => window.removeEventListener('muhakem-screen-change', onScreenChange);
  }, []);

  if (overlayScreen === 'history') {
    return (
      <WorkspaceShell current="history" onNavigate={handleNavigate} onNewChat={handleNewChat} onOpenSession={handleOpenSession}>
        <SignOutButton onSignOut={signOut} />
        <History onNavigate={(s) => { if (s === 'landing') setOverlayScreen(null); }} />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell current={currentScreen} onNavigate={handleNavigate} onNewChat={handleNewChat} onOpenSession={handleOpenSession}>
        <SignOutButton onSignOut={signOut} />
        <Workspace />
      </WorkspaceShell>
  );
}

/* زرار تسجيل خروج بسيط — مكانه مؤقت (ركن الشاشة) لحد ما يتضاف مكان أنسب
   في تصميم الـ header بتاع WorkspaceShell. */
function SignOutButton({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <button
      onClick={() => onSignOut()}
      className="fixed bottom-3 left-3 z-50 text-xs text-neutral-400 hover:text-neutral-700 bg-white/80 backdrop-blur px-2 py-1 rounded-md border border-neutral-200"
      dir="rtl"
    >
      تسجيل خروج
    </button>
  );
}