import { useState, useCallback, useEffect } from 'react';
import { Landing } from '../screens/Landing';
import { Thinking } from '../screens/Thinking';
import { ContractGen } from '../screens/ContractGen';
import { Review } from '../screens/Review';
import { Memo } from '../screens/Memo';
import { Research } from '../screens/Research';
import { QuickActionWizard } from './QuickActionWizard';
import { useSessionChat, type TaskKind } from '../lib/useSessionChat';
import { useMemory } from '../lib/memory';
import { routeMessage } from '../lib/router';
import { saveSession, type SessionCard } from '../lib/sessionStore';
import type { ScreenId, TaskType, ChatKind } from '../lib/types';
import type { MemoResult, ContractResult } from '../lib/api';
import { cn } from '../lib/cn';

type Phase = 'idle' | 'thinking' | 'artifact';

type ArtifactType = 'contract' | 'review' | 'memo' | 'research' | 'consultation';

const artifactScreenMap: Record<ArtifactType, ScreenId> = {
  contract: 'contract-gen',
  review: 'review',
  memo: 'memo',
  research: 'research',
  consultation: 'research',
};

const artifactTitleMap: Record<ArtifactType, string> = {
  contract: 'مسودة العقد',
  review: 'مراجعة العقد',
  memo: 'مذكرة الدفاع',
  research: 'نتائج البحث',
  consultation: 'الرأي القانوني',
};

/** يحوّل ArtifactType → ChatKind */
function artifactToChatKind(art: ArtifactType): ChatKind {
  const map: Record<ArtifactType, ChatKind> = {
    contract: 'contract-gen',
    review: 'contract-review',
    memo: 'memo',
    research: 'research',
    consultation: 'research',
  };
  return map[art];
}

/** يستخرج عنوان ووصف من نتيجة المذكرة */
function extractMemoInfo(result: MemoResult, prompt: string): { title: string; preview: string; tags: string[] } {
  const meta = result.case_metadata;
  const parts: string[] = [];
  if (meta?.defendant_name) parts.push(meta.defendant_name);
  if (meta?.charge) parts.push(meta.charge);
  if (meta?.crime_type) parts.push(meta.crime_type);

  const title = parts.length > 0
    ? `مذكرة دفاع — ${parts[0]}`
    : prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;

  const tagList: string[] = [];
  if (meta?.legal_nature) tagList.push(meta.legal_nature);
  if (meta?.crime_type) tagList.push(meta.crime_type);
  if (meta?.court) tagList.push(meta.court.split('—')[0].trim());

  const preview = `${result.sections.length} أقسام`;

  return { title, preview, tags: tagList };
}

/** يستخرج عنوان ووصف من نتيجة العقد */
function extractContractInfo(result: ContractResult, prompt: string): { title: string; preview: string; tags: string[] } {
  const title = result.contract_type_ar
    ? `عقد ${result.contract_type_ar}`
    : prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt;

  const preview = `${result.clauses.length} بند`;
  const tags: string[] = [];
  if (result.contract_type_ar) tags.push(result.contract_type_ar);

  return { title, preview, tags };
}

export function Workspace() {
  const [phase, setPhase] = useState<Phase>('idle');
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
  // لو مش null، يبقى احنا بنكمل جلسة موجودة — استخدمي نفس الـ id بدل ما
  // نعمل session جديدة كل مرة (وده اللي كان بيسبب التكرار في السايدبار)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const chat = useSessionChat();
  const memory = useMemory();

  /* ── Start workflow ── */
  const startThinking = useCallback((kind: TaskKind, prompt: string) => {
    setThinkingKind(kind);
    setInitialPrompt(prompt);
    setPhase('thinking');
  }, []);

  /* ── Thinking complete → show artifact + save session ── */
  const handleThinkingComplete = useCallback((result: MemoResult | ContractResult, jobId: string) => {
    const artifactKind = thinkingKind as ArtifactType;

    if (artifactKind === 'memo' && result) {
      const memoResult = result as MemoResult;
      setMemoData(memoResult);
      if (jobId) setMemoJobId(jobId);

      // احفظ الجلسة — لو دي إعادة فتح جلسة قايمة استخدمي نفس الـ id
      // (upsert)، ولو جلسة جديدة اعملي id جديد واحد بس واحفظيه في الـ state
      if (memoResult.sections && memoResult.sections.length > 0) {
        const info = extractMemoInfo(memoResult, initialPrompt);
        const id = currentSessionId ?? `memo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

      // نفس منطق الـ upsert بتاع المذكرات
      if (contractResult.clauses && contractResult.clauses.length > 0) {
        const info = extractContractInfo(contractResult, initialPrompt);
        const id = currentSessionId ?? `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

    if (artifactKind === 'review' || artifactKind === 'research' || artifactKind === 'consultation') {
      // حفظ جلسات أخرى (مراجعة/بحث/استشارة)
      const kindLabel: Record<string, string> = {
        review: 'مراجعة عقد',
        research: 'بحث قانوني',
        consultation: 'استشارة قانونية',
      };
      const previewText = initialPrompt.length > 50 ? initialPrompt.slice(0, 50) + '...' : initialPrompt;
      const id = currentSessionId ?? `${artifactKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (!currentSessionId) setCurrentSessionId(id);
      saveSession({
        id,
        title: `${kindLabel[artifactKind] || artifactKind}`,
        kind: artifactToChatKind(artifactKind),
        meta: previewText,
        preview: previewText,
        tags: [kindLabel[artifactKind] || artifactKind],
        prompt: initialPrompt,
        jobId: null,
        screenId: artifactScreenMap[artifactKind],
        pinned: false,
      });
    }

    setArtifactTransition(true);
    setTimeout(() => {
      setActiveKind(artifactKind);
      setPhase('artifact');
      setArtifactKey((k) => k + 1);
      setArtifactTransition(false);
    }, 300);
  }, [thinkingKind, initialPrompt]);

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

  /* ── From artifact: user switches mode via chat (uses router agent) ── */
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
            setArtifactKey((k) => k + 1);
            setArtifactTransition(false);
          }, 300);
        }
      }
    } catch {
      // Router failed → keep current screen
    }
  }, [chat, activeKind, memory]);

  /* ── New session ── */
  const handleNewSession = useCallback(() => {
    chat.reset();
    memory.clear();
    setPhase('idle');
    setActiveKind(null);
    setInitialPrompt('');
    setMemoData(null);
    setMemoJobId(null);
    setContractData(null);
    setContractJobId(null);
    setCurrentSessionId(null);
  }, [chat, memory]);

  /* ── Expose new chat for shell ── */
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__muhakemNewSession = handleNewSession;
  }, [handleNewSession]);

  /* ── Navigate to non-workspace screens (history) ── */
  const handleNavigate = useCallback((s: ScreenId) => {
    if (s === 'upload') return;
    if (s === 'history') {
      window.dispatchEvent(new CustomEvent('muhakem-navigate', { detail: s }));
    }
  }, []);

  /* ── Open an existing session from sidebar/history ── */
  const handleOpenSession = useCallback((session: SessionCard) => {
    const kindMap: Partial<Record<string, ArtifactType>> = {
      'contract-gen': 'contract',
      review: 'review',
      memo: 'memo',
      research: 'research',
    };
    const kind = kindMap[session.screenId];
    if (!kind) return;

    // لو النتيجة الكاملة متخزنة في الجلسة، اعرضيها فورًا من غير أي
    // API call — ده اللي بيحل مشكلة الـ regenerate + التكرار في السايدبار
    if (session.data) {
      chat.reset();
      memory.clear();
      setCurrentSessionId(session.id);
      setInitialPrompt(session.prompt);

      if (kind === 'memo') {
        setMemoData(session.data as MemoResult);
        setMemoJobId(session.jobId ?? null);
      } else if (kind === 'contract') {
        setContractData(session.data as ContractResult);
        setContractJobId(session.jobId ?? null);
      }

      setActiveKind(kind);
      setPhase('artifact');
      setArtifactKey((k) => k + 1);
      return;
    }

    // fallback لجلسات قديمة اتحفظت قبل هذا الإصلاح ومفيهاش data محفوظة —
    // اضطراريًا لازم regenerate، بس بنفس الـ id عشان منكررش الجلسة
    handleNewSession();
    setCurrentSessionId(session.id);
    setInitialPrompt(session.prompt);
    startThinking(kind as TaskKind, session.prompt);
  }, [handleNewSession, startThinking, chat, memory]);

  /* ── Expose openSession for shell ── */
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__muhakemOpenSession = handleOpenSession;
  }, [handleOpenSession]);

  /* ── Open an existing chat directly into its artifact (legacy) ── */
  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<ScreenId>).detail;
      const kindMap: Partial<Record<ScreenId, ArtifactType>> = {
        'contract-gen': 'contract',
        review: 'review',
        memo: 'memo',
        research: 'research',
      };
      const kind = kindMap[detail];
      if (kind) {
        setArtifactTransition(true);
        setTimeout(() => {
          setActiveKind(kind);
          setPhase('artifact');
          setArtifactKey((k) => k + 1);
          setArtifactTransition(false);
        }, 300);
      }
    };
    window.addEventListener('muhakem-navigate', onOpenChat);
    return () => window.removeEventListener('muhakem-navigate', onOpenChat);
  }, []);

  /* ── Render artifact ── */
  const renderArtifact = () => {
    if (!activeKind) return null;
    const sharedProps = {
      initialPrompt,
      chatProps: {
        messages: chat.messages,
        typing: chat.typing,
        typingStatus: chat.typingStatus,
        onSend: handleArtifactSend,
        contextLabel: chat.context,
        onClearContext: chat.clearContext,
        setContextLabel: chat.setContextLabel,
      },
    };

    switch (activeKind) {
      case 'contract':
        return <ContractGen contractData={contractData} jobId={contractJobId} initialPrompt={initialPrompt} embedded chatProps={sharedProps.chatProps} />;
      case 'review':
        return <Review initialPrompt={initialPrompt} embedded chatProps={sharedProps.chatProps} />;
      case 'memo':
        return <Memo initialPrompt={initialPrompt} memoData={memoData} jobId={memoJobId} embedded chatProps={sharedProps.chatProps} />;
      case 'research':
      case 'consultation':
        return <Research initialPrompt={initialPrompt} embedded chatProps={sharedProps.chatProps} />;
      default:
        return null;
    }
  };

  /* ── Current screen for shell ── */
  const currentScreen: ScreenId = phase === 'artifact' && activeKind
    ? artifactScreenMap[activeKind]
    : 'landing';

  /* ── Expose current screen for shell ── */
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__muhakemCurrentScreen = currentScreen;
    window.dispatchEvent(new CustomEvent('muhakem-screen-change', { detail: currentScreen }));
  }, [currentScreen]);

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
          {renderArtifact()}
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

/* ── Assemble a natural-language prompt from wizard answers ── */
function assemblePrompt(kind: TaskKind, data: Record<string, string>): string {
  const parts = Object.values(data).filter((v) => v.trim());
  const prefix: Record<TaskKind, string> = {
    contract: 'صياغة عقد',
    review: 'مراجعة عقد',
    memo: 'إعداد مذكرة دفاع',
    research: 'بحث قانوني',
    consultation: 'استشارة قانونية',
  };
  return `${prefix[kind]} — ${parts.join('، ')}`;
}

export { artifactTitleMap, type ArtifactType };