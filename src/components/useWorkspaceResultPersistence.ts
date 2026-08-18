import { useCallback } from 'react';
import { saveSession, syncFromRemote } from '../lib/sessionStore';
import type { ContractResult, MemoResult } from '../lib/api';
import type { TaskKind } from '../lib/useSessionChat';
import {
  artifactScreenMap,
  artifactToChatKind,
  extractContractInfo,
  extractMemoInfo,
  type ArtifactType,
} from './workspaceUtils';

type WorkspaceChat = ReturnType<typeof import('../lib/useSessionChat').useSessionChat>;

type UseWorkspaceResultPersistenceArgs = {
  thinkingKind: TaskKind;
  initialPrompt: string;
  currentSessionId: string | null;
  chat: WorkspaceChat;
  setCurrentSessionId: (id: string | null) => void;
  setMemoData: (result: MemoResult | null) => void;
  setMemoJobId: (jobId: string | null) => void;
  setContractData: (result: ContractResult | null) => void;
  setContractJobId: (jobId: string | null) => void;
};

export function useWorkspaceResultPersistence({
  thinkingKind,
  initialPrompt,
  currentSessionId,
  chat,
  setCurrentSessionId,
  setMemoData,
  setMemoJobId,
  setContractData,
  setContractJobId,
}: UseWorkspaceResultPersistenceArgs) {
  const persistThinkingResult = useCallback((
    result: MemoResult | ContractResult,
    jobId: string,
    dbSessionId: string | null,
  ): ArtifactType => {
    const artifactKind = thinkingKind as ArtifactType;

    if (artifactKind === 'memo' && result) {
      const memoResult = result as MemoResult;
      setMemoData(memoResult);
      if (jobId) setMemoJobId(jobId);

      if (memoResult.sections && memoResult.sections.length > 0) {
        const info = extractMemoInfo(memoResult, initialPrompt);
        const id = dbSessionId ?? currentSessionId ?? `memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!currentSessionId) setCurrentSessionId(id);
        saveSession({
          id,
          title: info.title,
          kind: 'memo',
          meta: info.preview,
          preview: info.preview,
          tags: info.tags,
          prompt: initialPrompt,
          jobId: jobId || null,
          screenId: 'memo',
          pinned: false,
          data: memoResult,
        });
      }
    }

    if (artifactKind === 'contract' && result) {
      const contractResult = result as ContractResult;
      setContractData(contractResult);
      if (jobId) setContractJobId(jobId);

      if (contractResult.clauses && contractResult.clauses.length > 0) {
        const info = extractContractInfo(contractResult, initialPrompt);
        const id = dbSessionId ?? currentSessionId ?? `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!currentSessionId) setCurrentSessionId(id);
        saveSession({
          id,
          title: info.title,
          kind: 'contract-gen',
          meta: info.preview,
          preview: info.preview,
          tags: info.tags,
          prompt: initialPrompt,
          jobId: jobId || null,
          screenId: 'contract-gen',
          pinned: false,
          data: contractResult,
        });
      }
    }

    if (dbSessionId) {
      void syncFromRemote();
    }

    if (artifactKind === 'review' || artifactKind === 'research' || artifactKind === 'consultation') {
      const kindLabel: Record<string, string> = {
        review: 'مراجعة عقد',
        research: 'بحث قانوني',
        consultation: 'استشارة قانونية',
      };
      const label = kindLabel[artifactKind] || artifactKind;
      const previewText = initialPrompt.length > 50 ? `${initialPrompt.slice(0, 50)}...` : initialPrompt;
      const id = currentSessionId ?? `${artifactKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!currentSessionId) setCurrentSessionId(id);
      saveSession({
        id,
        title: label,
        kind: artifactToChatKind(artifactKind),
        meta: previewText,
        preview: previewText,
        tags: [label],
        prompt: initialPrompt,
        jobId: null,
        screenId: artifactScreenMap[artifactKind],
        pinned: false,
      });

      if (artifactKind === 'consultation') {
        chat.seed(initialPrompt);
      }
    }

    return artifactKind;
  }, [thinkingKind, initialPrompt, currentSessionId, chat, setCurrentSessionId, setMemoData, setMemoJobId, setContractData, setContractJobId]);

  return { persistThinkingResult };
}
