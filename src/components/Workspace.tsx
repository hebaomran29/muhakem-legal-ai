import { useState, useCallback, useEffect } from 'react';
import { Landing } from '../screens/Landing';
import { Thinking } from '../screens/Thinking';
import { ContractGen } from '../screens/ContractGen';
import { Review } from '../screens/Review';
import { Memo } from '../screens/Memo';
import { Research } from '../screens/Research';
import { QuickActionWizard } from './QuickActionWizard';
import { useWorkspaceSessions } from './useWorkspaceSessions';
import { useWorkspaceResultPersistence } from './useWorkspaceResultPersistence';
import { ArtifactRenderer } from './ArtifactRenderer';
import { useWorkspaceArtifactChat } from './useWorkspaceArtifactChat';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { useSessionChat, type TaskKind } from '../lib/useSessionChat';
import {
  artifactScreenMap,
  artifactTitleMap,
  assemblePrompt,
  type ArtifactType,
  type WorkspacePhase,
} from './workspaceUtils';
import { useMemory } from '../lib/memory';
import { saveSession, syncFromRemote } from '../lib/sessionStore';
import type { ScreenId, TaskType } from '../lib/types';
import type { MemoResult, ContractResult, ReviewResult, SwitchTaskSignal } from '../lib/api';
import type { MemoChatMessage } from '../lib/useMemoChat';
import type { ContractChatMessage } from '../lib/useContractChat';
import { cn } from '../lib/cn';


export function Workspace() {
  const [phase, setPhase] = useState<WorkspacePhase>('idle');
  const [activeKind, setActiveKind] = useState<ArtifactType | null>(null);
  const [thinkingKind, setThinkingKind] = useState<TaskKind>('consultation');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [wizardKind, setWizardKind] = useState<TaskKind | null>(null);
  const [artifactKey, setArtifactKey] = useState(0);
  const [artifactTransition, setArtifactTransition] = useState(false);
  const [memoData, setMemoData] = useState<MemoResult | null>(null);
  const [memoJobId, setMemoJobId] = useState<string | null>(null);
  const [contractData, setContractData] = useState<ContractResult | null>(null);
  const [contractJobId, setContractJobId] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewResult | null>(null);
  const [reviewSourceText, setReviewSourceText] = useState('');
  const [reviewFilename, setReviewFilename] = useState('');
  const [memoInitialChatMessages, setMemoInitialChatMessages] = useState<MemoChatMessage[] | undefined>(undefined);
  const [contractInitialChatMessages, setContractInitialChatMessages] = useState<ContractChatMessage[] | undefined>(undefined);
  // لو مش null، يبقى احنا بنكمل جلسة موجودة — استخدمي نفس الـ id بدل ما
  // نعمل session جديدة كل مرة (وده اللي كان بيسبب التكرار في السايدبار)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const chat = useSessionChat();
  const memory = useMemory();

  /* ── Start workflow ── */
  const startThinking = useCallback((kind: TaskKind, prompt: string) => {
    setThinkingKind(kind);
    setInitialPrompt(prompt);
    if (kind === 'review') {
      setReviewData(null);
      setReviewSourceText('');
      setReviewFilename('');
      setActiveKind('review');
      setPhase('artifact');
      setArtifactKey((key) => key + 1);
      return;
    }
    setPhase('thinking');
  }, []);

  const { handleNewSession, handleOpenSession } = useWorkspaceSessions({
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
    setReviewData,
    setReviewSourceText,
    setReviewFilename,
  });

  const { persistThinkingResult } = useWorkspaceResultPersistence({
    thinkingKind,
    initialPrompt,
    currentSessionId,
    chat,
    setCurrentSessionId,
    setMemoData,
    setMemoJobId,
    setContractData,
    setContractJobId,
  });

  /* ── Thinking complete → show artifact ── */
  const handleReviewComplete = useCallback((sessionId: string, result: ReviewResult, sourceText: string, filename: string) => {
    setCurrentSessionId(sessionId);
    setReviewData(result);
    setReviewSourceText(sourceText);
    setReviewFilename(filename);
    saveSession({
      id: sessionId,
      title: result.title || filename,
      kind: 'contract-review',
      meta: result.summary || 'مراجعة عقد مكتملة',
      preview: result.summary || 'مراجعة عقد مكتملة',
      tags: ['مراجعة عقد'],
      prompt: filename,
      jobId: null,
      screenId: 'review',
      pinned: false,
      data: { ...result, source_text: sourceText, filename },
    });
    void syncFromRemote();
  }, []);

  /* ── Thinking complete → show artifact ── */
  const handleThinkingComplete = useCallback((result: MemoResult | ContractResult, jobId: string, dbSessionId: string | null) => {
    const artifactKind = persistThinkingResult(result, jobId, dbSessionId);
    setArtifactTransition(true);
    setTimeout(() => {
      setActiveKind(artifactKind);
      setPhase('artifact');
      setArtifactKey((key) => key + 1);
      setArtifactTransition(false);
    }, 300);
  }, [persistThinkingResult]);

  /* ── From Landing: router agent route ── */
  const handleRoute = useCallback((intent: TaskType, enrichedPrompt: string) => {
    startThinking(intent as TaskKind, enrichedPrompt);
  }, [startThinking]);

  /* ── From Landing: quick action card click ── */
  const handleQuickAction = useCallback((kind: TaskKind) => {
    setWizardKind(kind);
  }, []);

  /* ── Wizard complete → start thinking with assembled prompt ── */
  const handleWizardComplete = useCallback((data: Record<string, string>, kind: TaskKind) => {
    setWizardKind(null);
    const prompt = assemblePrompt(kind, data);
    startThinking(kind, prompt);
  }, [startThinking]);

  const { handleArtifactSend } = useWorkspaceArtifactChat({
    chat,
    memory,
    activeKind,
    setArtifactTransition,
    setActiveKind,
    setInitialPrompt,
    setArtifactKey,
  });

  /* ── من شات تعديل المذكرة/العقد: الراوتر الموحّد اكتشف إن المستخدمة
     بتطلب مهمة مختلفة تمامًا (مش تعديل على اللي قدامها) — نبدأ جلسة
     جديدة تمامًا (مش استكمال للـ session الحالية) ونعمل توليد فعلي
     للمهمة الجديدة بدل ما نحاول نلخبطها كتعديل ← */
  const handleChatSwitchTask = useCallback((signal: SwitchTaskSignal) => {
    handleNewSession();
    startThinking(signal.intent as TaskKind, signal.enriched_prompt);
  }, [handleNewSession, startThinking]);

  const artifactChatProps = {
    messages: chat.messages,
    typing: chat.typing,
    typingStatus: chat.typingStatus,
    onSend: handleArtifactSend,
    contextLabel: chat.context,
    onClearContext: chat.clearContext,
    setContextLabel: chat.setContextLabel,
  };

  /* ── Current screen for shell ── */
  const currentScreen: ScreenId = phase === 'artifact' && activeKind
    ? artifactScreenMap[activeKind]
    : 'landing';

  const { handleNavigate } = useWorkspaceNavigation({
    handleNewSession,
    handleOpenSession,
    currentScreen,
    setArtifactTransition,
    setActiveKind,
    setPhase,
    setArtifactKey,
  });

  return (
    <div className={cn('relative h-full w-full', artifactTransition && 'artifact-transitioning')}>
      {/* Idle: Landing */}
      {phase === 'idle' && (
        <div key="landing" className="h-full w-full animate-page-in">
          <Landing onNavigate={handleNavigate} onRoute={handleRoute} onQuickAction={handleQuickAction} />
        </div>
      )}

      {/* Thinking: cinematic workflow */}
      {phase === 'thinking' && (
        <div key="thinking" className="h-full w-full animate-page-in">
          <Thinking task={thinkingKind} prompt={initialPrompt} onComplete={handleThinkingComplete} />
        </div>
      )}

      {/* Artifact: result + persistent chat */}
      {phase === 'artifact' && (
        <div key={artifactKey} className="h-full w-full animate-artifact-in">
          <ArtifactRenderer
            activeKind={activeKind}
            initialPrompt={initialPrompt}
            chatProps={artifactChatProps}
            memoData={memoData}
            memoJobId={memoJobId}
            contractData={contractData}
            contractJobId={contractJobId}
            reviewData={reviewData}
            reviewSourceText={reviewSourceText}
            reviewFilename={reviewFilename}
            memoInitialChatMessages={memoInitialChatMessages}
            contractInitialChatMessages={contractInitialChatMessages}
            onReviewComplete={handleReviewComplete}
            onSwitchTask={handleChatSwitchTask}
          />
        </div>
      )}

      {/* Wizard overlay */}
      {wizardKind && (
        <QuickActionWizard
          kind={wizardKind}
          onClose={() => setWizardKind(null)}
          onComplete={handleWizardComplete}
        />
      )}
    </div>
  );
}


export { artifactTitleMap, type ArtifactType };