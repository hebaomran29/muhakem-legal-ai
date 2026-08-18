import { useCallback } from 'react';
import { routeMessage } from '../lib/router';
import type { ArtifactType } from './workspaceUtils';

type WorkspaceChat = ReturnType<typeof import('../lib/useSessionChat').useSessionChat>;
type WorkspaceMemory = ReturnType<typeof import('../lib/memory').useMemory>;

type UseWorkspaceArtifactChatArgs = {
  chat: WorkspaceChat;
  memory: WorkspaceMemory;
  activeKind: ArtifactType | null;
  setArtifactTransition: (value: boolean) => void;
  setActiveKind: (kind: ArtifactType | null) => void;
  setInitialPrompt: (prompt: string) => void;
  setArtifactKey: (update: (key: number) => number) => void;
};

export function useWorkspaceArtifactChat({
  chat,
  memory,
  activeKind,
  setArtifactTransition,
  setActiveKind,
  setInitialPrompt,
  setArtifactKey,
}: UseWorkspaceArtifactChatArgs) {
  const handleArtifactSend = useCallback(async (text: string) => {
    chat.send(text, 'consultation');

    try {
      const history = memory.getHistoryForRouter();
      const result = await routeMessage(text, history);

      if (result.shouldRoute && result.intent !== 'consultation') {
        const newArtifact = result.intent as ArtifactType;
        if (newArtifact !== activeKind) {
          setArtifactTransition(true);
          setTimeout(() => {
            setActiveKind(newArtifact);
            setInitialPrompt(result.enrichedPrompt);
            setArtifactKey((key) => key + 1);
            setArtifactTransition(false);
          }, 300);
        }
      }
    } catch {
      // Router failure leaves the current artifact visible.
    }
  }, [chat, memory, activeKind, setArtifactTransition, setActiveKind, setInitialPrompt, setArtifactKey]);

  return { handleArtifactSend };
}
