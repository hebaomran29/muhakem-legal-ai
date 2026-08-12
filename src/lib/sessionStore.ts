/* ─────────────────────────────────────────────────────────────
   Session Store — تخزين الجلسات في localStorage.

   كل ما يتم إنجازه (مذكرة دفاع، عقد، بحث...) يتم حفظه
   كجلسة يمكن إعادة فتحها من السايدبار.

   يعمل كويس لوحده أو مع desktop app (Electron/Tauri).
   ───────────────────────────────────────────────────────────── */

import type { ChatKind } from './types';

/* ═══ Types ═══ */

export interface SessionCard {
  id: string;               // مثلاً "session-1690123456789"
  title: string;             // عنوان مختصر للجلسة
  kind: ChatKind;            // نوع المهمة
  meta: string;              // وصف مختصر (تاريخ أو حالة)
  preview: string;           // سطر وصف يظهر تحت العنوان
  tags: string[];            // وسوم مثل ["مدني", "مطالبة مالية"]
  createdAt: number;         // timestamp
  updatedAt: number;         // timestamp
  pinned: boolean;

  /* ── البيانات الفعلية ── */
  prompt: string;            // الـ prompt الأصلي
  jobId: string | null;      // job ID من الباك (بيموت مع أي restart — مفيش DB)
  screenId: string;          // screen لتفتحها: 'memo' | 'contract-gen' | 'review' | 'research'

  /* النتيجة الكاملة — لازم تتخزن هنا لأن مفيش backend DB، فـ localStorage
     هو المصدر الوحيد. لو موجودة، فتح الجلسة يعرضها مباشرة من غير أي
     regenerate. */
  data?: unknown;
}

/* ═══ Constants ═══ */

const STORAGE_KEY = 'muhakem_sessions';
const PINNED_KEY = 'muhakem_pinned_sessions';

/* ═══ Module-level cache ═══ */

let _sessions: SessionCard[] | null = null;
let _pinned: Set<string> | null = null;
let _listeners = new Set<() => void>();

function _emit() {
  _listeners.forEach((fn) => fn());
}

function _loadSessions(): SessionCard[] {
  if (_sessions !== null) return _sessions;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _sessions = raw ? (JSON.parse(raw) as SessionCard[]) : [];
  } catch {
    _sessions = [];
  }
  return _sessions ?? [];
}

function _saveSessions(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_sessions));
  } catch {
    // localStorage full — clean old sessions
    if (_sessions && _sessions.length > 50) {
      _sessions = _sessions.slice(-30);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_sessions));
      } catch { /* give up */ }
    }
  }
}

function _loadPinned(): Set<string> {
  if (_pinned !== null) return _pinned;
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    _pinned = raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    _pinned = new Set();
  }
  return _pinned;
}

function _savePinned(): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...(_pinned ?? [])]));
  } catch { /* ignore */ }
}

/* ═══ مزامنة مع الداتابيز (لو مسجّلة دخول) ═══ */

import { getAccessToken } from './auth';
import { listRemoteSessions, deleteRemoteSession, pinRemoteSession, type RemoteSession } from './api';

const REMOTE_TYPE_TO_KIND: Record<RemoteSession['type'], ChatKind> = {
  memo: 'memo',
  contract: 'contract-gen',
  review: 'contract-review',
  research: 'research',
  consultation: 'case',
};

function remoteToCard(r: RemoteSession): SessionCard {
  return {
    id: r.id,
    title: r.title || (r.prompt ?? '').slice(0, 60) || 'بدون عنوان',
    kind: REMOTE_TYPE_TO_KIND[r.type],
    meta: new Date(r.updated_at).toLocaleDateString('ar-EG'),
    preview: (r.prompt ?? '').slice(0, 100),
    tags: [],
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    pinned: r.pinned,
    prompt: r.prompt ?? '',
    jobId: null,
    screenId: r.type === 'contract' ? 'contract-gen' : r.type,
    // النتيجة الكاملة بتتجاب بس لما تفتحي الجلسة (getRemoteSession) — هنا
    // بنعرض بس البطاقة في الـ Sidebar، مش محتاجين النص الكامل كله مقدمًا.
    data: undefined,
  };
}

let _syncInFlight = false;

/** تجيب جلسات المستخدم من الداتابيز وتحطها في الكاش المحلي — بتتنفذ بس
 * لو فيه توكن دخول (مستخدمة مسجّلة). لو مفيش، مفيش تأثير (localStorage
 * بس زي ما كانت من الأول). */
export async function syncFromRemote(): Promise<void> {
  if (_syncInFlight) return;
  if (!getAccessToken()) return;
  _syncInFlight = true;
  try {
    const remote = await listRemoteSessions();
    const cards = remote.map(remoteToCard);
    _sessions = cards;
    _pinned = new Set(remote.filter((r) => r.pinned).map((r) => r.id));
    _saveSessions();
    _savePinned();
    _emit();
  } catch (e) {
    // فشل المزامنة مش لازم يكسر الواجهة — الكاش المحلي (لو موجود) بيفضل زي ما هو
    // eslint-disable-next-line no-console
    console.warn('فشلت مزامنة الجلسات من الداتابيز:', e);
  } finally {
    _syncInFlight = false;
  }
}

/* ═══ Public API ═══ */

/** يجيب كل الجلسات مرتبة حسب الأحدث */
export function getSessions(): SessionCard[] {
  return _loadSessions().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** يجيب الجلسات المثبتة فقط */
export function getPinnedSessions(): SessionCard[] {
  const pinned = _loadPinned();
  return getSessions().filter((s) => pinned.has(s.id));
}

/** يجيب آخر N جلسة (للسايدبار) */
export function getRecentSessions(limit = 10): SessionCard[] {
  return getSessions().slice(0, limit);
}

/** يجيب جلسة واحدة بالـ ID */
export function getSessionById(id: string): SessionCard | undefined {
  return _loadSessions().find((s) => s.id === id);
}

/** يضيف أو يحدّث جلسة */
export function saveSession(card: Omit<SessionCard, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }): SessionCard {
  const sessions = _loadSessions();
  const now = Date.now();
  const existingIdx = sessions.findIndex((s) => s.id === card.id);

  const session: SessionCard = {
    ...card,
    createdAt: card.createdAt ?? now,
    updatedAt: card.updatedAt ?? now,
  };

  if (existingIdx >= 0) {
    sessions[existingIdx] = session;
  } else {
    sessions.unshift(session);
  }

  // مهم: نعمل reference جديد عشان useSyncExternalStore يلاحظ التغيير
  _sessions = [...sessions];
  _saveSessions();
  _emit();
  return session;
}

/** يحدّث البيانات الوصفية فقط */
export function updateSessionMeta(
  id: string,
  updates: Partial<Pick<SessionCard, 'title' | 'meta' | 'preview' | 'tags' | 'pinned'>>,
): void {
  const sessions = _loadSessions();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx < 0) return;
  sessions[idx] = { ...sessions[idx], ...updates, updatedAt: Date.now() };
  // مهم: reference جديد عشان useSyncExternalStore يلاحظ التغيير
  _sessions = [...sessions];
  _saveSessions();
  _emit();
}

/** يحذف جلسة */
export function deleteSession(id: string): void {
  _sessions = _loadSessions().filter((s) => s.id !== id);
  _saveSessions();
  _emit();
  if (getAccessToken()) {
    deleteRemoteSession(id).catch((e) => console.warn('فشل حذف الجلسة من الداتابيز:', e));
  }
}

/** تثبيت/إلغاء تثبيت جلسة */
export function togglePin(id: string): void {
  const pinned = _loadPinned();
  const willBePinned = !pinned.has(id);
  if (pinned.has(id)) {
    pinned.delete(id);
  } else {
    pinned.add(id);
  }
  _pinned = pinned;
  _savePinned();
  _emit();
  if (getAccessToken()) {
    pinRemoteSession(id, willBePinned).catch((e) => console.warn('فشل تثبيت الجلسة في الداتابيز:', e));
  }
}

/** هل الجلسة مثبتة؟ */
export function isPinned(id: string): boolean {
  return _loadPinned().has(id);
}

/** يشترك في التغييرات (للـ React hook) */
export function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

/** يجيب snapshot للـ useSyncExternalStore */
export function getSnapshot(): SessionCard[] {
  return getSessions();
}

/* ═══ React Hook ═══ */

import { useSyncExternalStore, useCallback, useEffect } from 'react';

export function useSessions() {
  const sessions = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    syncFromRemote();
  }, []);

  const pinnedSessions = sessions.filter((s) => _loadPinned().has(s.id));
  const recentSessions = sessions.filter((s) => !_loadPinned().has(s.id)).slice(0, 10);

  const save = useCallback((card: Omit<SessionCard, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }) => {
    return saveSession(card);
  }, []);

  const remove = useCallback((id: string) => {
    deleteSession(id);
  }, []);

  const togglePinFn = useCallback((id: string) => {
    togglePin(id);
  }, []);

  return {
    sessions,
    pinnedSessions,
    recentSessions,
    save,
    remove,
    togglePin: togglePinFn,
  };
}
