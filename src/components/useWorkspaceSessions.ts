import { useCallback } from 'react';
import { getAccessToken } from '../lib/auth';
import { getRemoteSession, resumeContractSession, resumeMemoSession } from '../lib/api';
import type { ContractResult, MemoResult } from '../lib/api';
import type { MemoChatMessage } from '../lib/useMemoChat';
import type { ContractChatMessage } from '../lib/useContractChat';
import type { TaskKind } from '../lib/useSessionChat';
import type { ScreenId } from '../lib/types';
import type { SessionCard } from '../lib/sessionStore';
import {
  toContractChatMessages,
  toMemoChatMessages,
  type ArtifactType,
  type WorkspacePhase,
} from './workspaceUtils';

type WorkspaceChat = ReturnType<typeof import('../lib/useSessionChat').useSessionChat>;
type WorkspaceMemory = ReturnType<typeof import('../lib/memory').useMemory>;

type UseWorkspaceSessionsArgs = {
  chat: WorkspaceChat;
  memory: WorkspaceMemory;
  startThinking: (kind: TaskKind, prompt: string) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  setInitialPrompt: (prompt: string) => void;
  setPhase: (phase: WorkspacePhase) => void;
  setActiveKind: (kind: ArtifactType | null) => void;
  setArtifactKey: (update: (key: number) => number) => void;
  setMemoData: (result: MemoResult | null) => void;
  setMemoJobId: (jobId: string | null) => void;
  setMemoInitialChatMessages: (messages: MemoChatMessage[] | undefined) => void;
  setContractData: (result: ContractResult | null) => void;
  setContractJobId: (jobId: string | null) => void;
  setContractInitialChatMessages: (messages: ContractChatMessage[] | undefined) => void;
};

const kindMap: Partial<Record<string, ArtifactType>> = {
  'contract-gen': 'contract',
  review: 'review',
  memo: 'memo',
  research: 'research',
  consultation: 'consultation',
};

export function useWorkspaceSessions({
  chat,
  memory,
  startThinking,
  currentSessionId,
  setCurrentSessionId,
  setInitialPrompt,
  setPhase,
  setActiveKind,
  setArtifactKey,
  setMemoData,
  setMemoJobId,
  setMemoInitialChatMessages,
  setContractData,
  setContractJobId,
  setContractInitialChatMessages,
}: UseWorkspaceSessionsArgs) {
  const handleNewSession = useCallback(() => {
    chat.reset();
    memory.clear();
    setPhase('idle');
    setActiveKind(null);
    setInitialPrompt('');
    setMemoData(null);
    setMemoJobId(null);
    setMemoInitialChatMessages(undefined);
    setContractData(null);
    setContractJobId(null);
    setContractInitialChatMessages(undefined);
    setCurrentSessionId(null);
  }, [chat, memory, setPhase, setActiveKind, setInitialPrompt, setMemoData, setMemoJobId, setMemoInitialChatMessages, setContractData, setContractJobId, setContractInitialChatMessages, setCurrentSessionId]);

  const handleOpenSession = useCallback(async (session: SessionCard) => {
    const kind = kindMap[session.screenId];
    if (!kind) return;

    if (session.data) {
      chat.reset();
      memory.clear();
      setCurrentSessionId(session.id);
      setInitialPrompt(session.prompt);

      if (kind === 'memo') {
        setMemoData(session.data as MemoResult);
        setMemoJobId(session.jobId ?? null);
        setMemoInitialChatMessages(undefined);
      } else if (kind === 'contract') {
        setContractData(session.data as ContractResult);
        setContractJobId(session.jobId ?? null);
        setContractInitialChatMessages(undefined);
      }

      setActiveKind(kind);
      setPhase('artifact');
      setArtifactKey((key) => key + 1);
      return;
    }

    if (getAccessToken() && (kind === 'memo' || kind === 'contract')) {
      try {
        const { result, chat_history } = await getRemoteSession(session.id);
        if (result) {
          chat.reset();
          memory.clear();
          setCurrentSessionId(session.id);
          setInitialPrompt(session.prompt);

          if (kind === 'memo') {
            const memoResult: MemoResult = {
              sections: (result.sections as MemoResult['sections']) ?? [],
              case_metadata: (result.case_metadata as MemoResult['case_metadata']) ?? ({} as MemoResult['case_metadata']),
              memo: (result.memo_text as string) ?? '',
            };
            setMemoData(memoResult);
            setMemoJobId(null);
            setMemoInitialChatMessages(toMemoChatMessages(chat_history));
            resumeMemoSession(session.id)
              .then(({ job_id }) => setMemoJobId(job_id))
              .catch((error) => console.warn('فشل تفعيل الجلسة للتعديل بالشات:', error));
          } else {
            const clauses = (result.clauses as ContractResult['clauses']) ?? [];
            const contractResult: ContractResult = {
              contract_text: clauses.map((clause) => clause.body ?? '').join('\n\n'),
              preamble: '',
              closing: '',
              clauses,
              contract_type_key: null,
              contract_type_ar: (result.contract_type_ar as string) ?? '',
              clause_validation: null,
              docx_path: null,
            };
            setContractData(contractResult);
            setContractJobId(null);
            setContractInitialChatMessages(toContractChatMessages(chat_history));
            resumeContractSession(session.id)
              .then(({ job_id }) => setContractJobId(job_id))
              .catch((error) => console.warn('فشل تفعيل جلسة العقد بالشات:', error));
          }

          setActiveKind(kind);
          setPhase('artifact');
          setArtifactKey((key) => key + 1);
          return;
        }
      } catch (error) {
        console.warn('فشل جلب الجلسة من الداتابيز، هنعمل regenerate بدلاً منها:', error);
      }
    }

    handleNewSession();
    setMemoInitialChatMessages(undefined);
    setCurrentSessionId(session.id);
    setInitialPrompt(session.prompt);
    startThinking(kind as TaskKind, session.prompt);
  }, [chat, memory, setCurrentSessionId, setInitialPrompt, setMemoData, setMemoJobId, setMemoInitialChatMessages, setContractData, setContractJobId, setContractInitialChatMessages, setActiveKind, setPhase, setArtifactKey, handleNewSession, startThinking]);

  return { handleNewSession, handleOpenSession };
}
