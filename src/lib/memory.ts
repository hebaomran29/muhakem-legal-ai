/* ─────────────────────────────────────────────────────────────
   Memory Layer — ذاكرة محادثة مشتركة بين كل الشاشات.

   بيستخدم module-level store عشان Landing و Workspace
   يشيروا لنفس الذاكرة من غير Context أو props drilling.

   الاستخدام:
   - Landing: addMessage + getHistoryForRouter (بعت للـ router agent)
   - Workspace: clear() (لما يبدأ session جديد)
   - أي screen: getEnrichedPrompt() (يجيب السياق الكامل)
   ───────────────────────────────────────────────────────────── */

import { useCallback, useSyncExternalStore } from 'react';

/* ═══ Types ═══ */
export type MemoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

type MemoryState = {
  messages: MemoryMessage[];
  sessionId: string;
};

/* ═══ Module-level store ═══ */
let _state: MemoryState = {
  messages: [],
  sessionId: `session-${Date.now()}`,
};
const _listeners = new Set<() => void>();

function _emit() {
  _listeners.forEach((fn) => fn());
}

function _getSnapshot(): MemoryState {
  return _state;
}

function _subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/* ═══ Actions ═══ */

/** إضافة رسالة للذاكرة */
function _addMessage(role: 'user' | 'assistant', text: string): void {
  _state = {
    ..._state,
    messages: [
      ..._state.messages,
      {
        id: `${role[0]}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role,
        text,
        timestamp: Date.now(),
      },
    ],
  };
  _emit();
}

/** مسح كل الذاكرة (بداية session جديد) */
function _clear(): void {
  _state = {
    messages: [],
    sessionId: `session-${Date.now()}`,
  };
  _emit();
}

/** يجيب رسائل المستخدم فقط — للـ enriched prompt */
function _getUserText(): string {
  return _state.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('\n');
}

/** يجيب الهيستوري بصيغة الـ router agent */
function _getHistoryForRouter(): { role: string; text: string }[] {
  return _state.messages.map((m) => ({
    role: m.role,
    text: m.text,
  }));
}

/** يجيب السياق الكامل كـ enriched prompt */
function _getEnrichedPrompt(currentRequest?: string): string {
  const userTexts = _getUserText();
  if (!currentRequest) return userTexts;
  if (!userTexts) return currentRequest;
  return `${userTexts}\n\n${currentRequest}`;
}

/* ═══ React Hook ═══ */

export function useMemory() {
  const state = useSyncExternalStore(_subscribe, _getSnapshot, _getSnapshot);

  const addMessage = useCallback((role: 'user' | 'assistant', text: string) => {
    _addMessage(role, text);
  }, []);

  const clear = useCallback(() => {
    _clear();
  }, []);

  const getHistoryForRouter = useCallback(() => {
    return _getHistoryForRouter();
  }, []);

  const getEnrichedPrompt = useCallback((currentRequest?: string) => {
    return _getEnrichedPrompt(currentRequest);
  });

  return {
    messages: state.messages,
    sessionId: state.sessionId,
    addMessage,
    clear,
    getHistoryForRouter,
    getEnrichedPrompt,
  };
}
