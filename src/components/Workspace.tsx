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
import { saveSession, syncFromRemote, type SessionCard } from '../lib/sessionStore';
import type { ScreenId, TaskType, ChatKind } from '../lib/types';
import type { MemoResult, ContractResult, SwitchTaskSignal, RemoteChatMessage } from '../lib/api';
import { getRemoteSession, resumeMemoSession, resumeContractSession } from '../lib/api';
import type { MemoChatMessage } from '../lib/useMemoChat';
import type { ContractChatMessage } from '../lib/useContractChat';
import { getAccessToken } from '../lib/auth';
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

/** يحوّل تاريخ الشات المحفوظ في الداتابيز لشكل MemoChatMessage اللي useMemoChat بيتوقعه */
function toMemoChatMessages(history: RemoteChatMessage[]): MemoChatMessage[] {
  return history.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    changeCard: (m.change_card ?? undefined) as MemoChatMessage['changeCard'],
  }));
}

function toContractChatMessages(history: RemoteChatMessage[]): ContractChatMessage[] {
  return history.map((m) => ({
    id: m.id,
    role: m.role,
    text: m.text,
    changeCard: (m.change_card ?? undefined) as ContractChatMessage['changeCard'],
  }));
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
    setPhase('thinking');
  }, []);

  /* ── Thinking complete → show artifact + save session ── */
  const handleThinkingComplete = useCallback((result: MemoResult | ContractResult, jobId: string, dbSessionId: string | null) => {
    const artifactKind = thinkingKind as ArtifactType;

    if (artifactKind === 'memo' && result) {
      const memoResult = result as MemoResult;
      setMemoData(memoResult);
      if (jobId) setMemoJobId(jobId);

      // احفظ الجلسة — لو دي إعادة فتح جلسة قايمة استخدمي نفس الـ id (upsert).
      // لو فيه db_session_id (يعني مسجّلة دخول وBackend عمل الجلسة فعليًا في
      // الداتابيز)، استخدمي نفسه بالظبط — عشان لما الـ Sidebar يزامن من
      // الداتابيز بعد كده يلاقي نفس الـ id ويحدّث مكانها، مش يضيفها تاني
      // كجلسة منفصلة (ده كان سبب ظهور المذكرة مرتين في السايدبار).
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

      // نفس منطق الـ upsert بتاع المذكرات
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

    // خزّنّا محليًا فورًا فوق (لعرض سريع في نفس اللحظة) — دلوقتي نزامن مع
    // النسخة الحقيقية في الداتابيز (لو مسجّلة دخول) عشان أي تفاصيل زي
    // pinned/تاريخ التحديث تبقى دقيقة، ومتفرقش عن نسخة الداتابيز.
    if (dbSessionId) {
      syncFromRemote();
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
    setMemoInitialChatMessages(undefined);
    setContractData(null);
    setContractJobId(null);
    setContractInitialChatMessages(undefined);
    setCurrentSessionId(null);
  }, [chat, memory]);

  /* ── من شات تعديل المذكرة/العقد: الراوتر الموحّد اكتشف إن المستخدمة
     بتطلب مهمة مختلفة تمامًا (مش تعديل على اللي قدامها) — نبدأ جلسة
     جديدة تمامًا (مش استكمال للـ session الحالية) ونعمل توليد فعلي
     للمهمة الجديدة بدل ما نحاول نلخبطها كتعديل ← */
  const handleChatSwitchTask = useCallback((signal: SwitchTaskSignal) => {
    handleNewSession();
    startThinking(signal.intent as TaskKind, signal.enriched_prompt);
  }, [handleNewSession, startThinking]);

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
  const handleOpenSession = useCallback(async (session: SessionCard) => {
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
        setMemoInitialChatMessages(undefined);
      } else if (kind === 'contract') {
        setContractData(session.data as ContractResult);
        setContractJobId(session.jobId ?? null);
        setContractInitialChatMessages(undefined);
      }

      setActiveKind(kind);
      setPhase('artifact');
      setArtifactKey((k) => k + 1);
      return;
    }

    // جلسة من الداتابيز (مسجّلة دخول) مالهاش data محفوظة محليًا — نجيبها
    // من /api/sessions/{id} بدل ما نعمل regenerate كامل من الصفر
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
            setMemoJobId(null); // مؤقتًا لحد ما resumeMemoSession يرجّع job_id فعلي تحت
            setMemoInitialChatMessages(toMemoChatMessages(chat_history));

            // فعّلي job جديد على السيرفر عشان الشات يقدر يكمل التعديل على
            // الجلسة دي (بدون ده كانت الجلسة بتفتح للقراءة بس) — best-effort:
            // لو فشل، الجلسة تفضل متاحة للقراءة والمذكرة تتعرض عادي
            resumeMemoSession(session.id)
              .then(({ job_id }) => setMemoJobId(job_id))
              .catch((e) => console.warn('فشل تفعيل الجلسة للتعديل بالشات:', e));
          } else {
            const clauses = (result.clauses as ContractResult['clauses']) ?? [];
            const contractResult: ContractResult = {
              contract_text: clauses.map((c) => c.body ?? '').join('\n\n'),
              preamble: '',
              closing: '',
              clauses,
              contract_type_key: null,
              contract_type_ar: (result.contract_type_ar as string) ?? '',
              clause_validation: null,
              docx_path: null,
            };
            setContractData(contractResult);
            setContractJobId(null); // مؤقتًا لحد ما resumeContractSession يرجّع job_id فعلي تحت
            setContractInitialChatMessages(toContractChatMessages(chat_history));

            // نفس فكرة resume المذكرة — فعّلي job جديد على السيرفر عشان
            // الشات يقدر يكمل التعديل على العقد ده بعد إعادة الفتح
            resumeContractSession(session.id)
              .then(({ job_id }) => setContractJobId(job_id))
              .catch((e) => console.warn('فشل تفعيل جلسة العقد للتعديل بالشات:', e));
          }

          setActiveKind(kind);
          setPhase('artifact');
          setArtifactKey((k) => k + 1);
          return;
        }
      } catch (e) {
        console.warn('فشل جلب الجلسة من الداتابيز، هنعمل regenerate بدلاً منها:', e);
      }
    }

    // fallback لجلسات قديمة اتحفظت قبل هذا الإصلاح ومفيهاش data محفوظة —
    // اضطراريًا لازم regenerate، بس بنفس الـ id عشان منكررش الجلسة
    handleNewSession();
    setMemoInitialChatMessages(undefined);
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
        return <ContractGen contractData={contractData} jobId={contractJobId} initialPrompt={initialPrompt} embedded chatProps={sharedProps.chatProps} onSwitchTask={handleChatSwitchTask} initialChatMessages={contractInitialChatMessages} />;
      case 'review':
        return <Review initialPrompt={initialPrompt} embedded chatProps={sharedProps.chatProps} />;
      case 'memo':
        return <Memo initialPrompt={initialPrompt} memoData={memoData} jobId={memoJobId} embedded chatProps={sharedProps.chatProps} onSwitchTask={handleChatSwitchTask} initialChatMessages={memoInitialChatMessages} />;
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