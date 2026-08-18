import { useCallback, useEffect } from 'react';
import type { ScreenId } from '../lib/types';
import type { SessionCard } from '../lib/sessionStore';
import type { ArtifactType } from './workspaceUtils';

type UseWorkspaceNavigationArgs = {
  handleNewSession: () => void;
  handleOpenSession: (session: SessionCard) => void | Promise<void>;
  currentScreen: ScreenId;
  setArtifactTransition: (value: boolean) => void;
  setActiveKind: (kind: ArtifactType | null) => void;
  setPhase: (phase: 'idle' | 'thinking' | 'artifact') => void;
  setArtifactKey: (update: (key: number) => number) => void;
};

const legacyChatMap: Partial<Record<ScreenId, ArtifactType>> = {
  'contract-gen': 'contract',
  review: 'review',
  memo: 'memo',
  research: 'research',
};

export function useWorkspaceNavigation({
  handleNewSession,
  handleOpenSession,
  currentScreen,
  setArtifactTransition,
  setActiveKind,
  setPhase,
  setArtifactKey,
}: UseWorkspaceNavigationArgs) {
  const handleNavigate = useCallback((screen: ScreenId) => {
    if (screen === 'upload') return;
    if (screen === 'history') {
      window.dispatchEvent(new CustomEvent('muhakem-navigate', { detail: screen }));
    }
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__muhakemNewSession = handleNewSession;
    (window as unknown as Record<string, unknown>).__muhakemOpenSession = handleOpenSession;

    return () => {
      const globals = window as unknown as Record<string, unknown>;
      delete globals.__muhakemNewSession;
      delete globals.__muhakemOpenSession;
    };
  }, [handleNewSession, handleOpenSession]);

  useEffect(() => {
    const onOpenChat = (event: Event) => {
      const screen = (event as CustomEvent<ScreenId>).detail;
      const kind = legacyChatMap[screen];
      if (!kind) return;

      setArtifactTransition(true);
      window.setTimeout(() => {
        setActiveKind(kind);
        setPhase('artifact');
        setArtifactKey((key) => key + 1);
        setArtifactTransition(false);
      }, 300);
    };

    window.addEventListener('muhakem-navigate', onOpenChat);
    return () => window.removeEventListener('muhakem-navigate', onOpenChat);
  }, [setArtifactTransition, setActiveKind, setPhase, setArtifactKey]);

  useEffect(() => {
    const globals = window as unknown as Record<string, unknown>;
    globals.__muhakemCurrentScreen = currentScreen;
    window.dispatchEvent(new CustomEvent('muhakem-screen-change', { detail: currentScreen }));
  }, [currentScreen]);

  return { handleNavigate };
}
