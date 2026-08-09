/* ─────────────────────────────────────────────────────────────
   API client for the FastAPI backend.

   The base URL is read from VITE_API_BASE_URL (set in .env).
   If unset, requests are stubbed with mock data so the UI keeps
   working before the backend is connected.
   ───────────────────────────────────────────────────────────── */

import { getAccessToken } from './auth';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || '';

/* ════════════════════════════════════════════════
   Types — match backend spec exactly (case-sensitive)
   ════════════════════════════════════════════════ */

export type MemoSection = {
  id: string;
  title: string;
  body: string;
};

export type CaseMetadata = {
  defendant_name?: string | null;
  charge?: string | null;
  case_number?: string | null;
  court?: string | null;
  crime_type?: string | null;
  legal_nature?: string | null;
  lawyer_name?: string | null;
  lawyer_license?: string | null;
};

export type MemoResult = {
  sections: MemoSection[];
  case_metadata: CaseMetadata;
  memo: string;
};

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type JobProgress = {
  status: JobStatus;
  progress?: number; // 0..1
  stage?: string;
  result?: MemoResult;
  error?: string;
};

export type GenerateMemoRequest = {
  raw_text: string;
  court?: string;
  case_number?: string;
  lawyer_name?: string;
  lawyer_license?: string;
};

export type ChatChangeCard = {
  section_id: string;
  section_title: string;
  old_text: string;
  new_text: string;
};

export type SwitchTaskSignal = {
  intent: 'memo' | 'contract' | 'review' | 'research' | 'consultation';
  enriched_prompt: string;
};

export type ChatResponse = {
  reply: string;
  updated_sections: MemoSection[] | null;
  change_card: ChatChangeCard | null;
  warnings: string[];
  switch_task: SwitchTaskSignal | null;
};

/* ════════════════════════════════════════════════
   HTTP helper
   ════════════════════════════════════════════════ */

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.detail || body.message || '';
    } catch { /* ignore */ }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

/* ════════════════════════════════════════════════
   Memo endpoints
   ════════════════════════════════════════════════ */

export async function createMemoJob(req: GenerateMemoRequest): Promise<{ job_id: string; status: 'queued'; db_session_id: string | null }> {
  if (!BASE_URL) return { ...(await mockCreateMemoJob()), db_session_id: null };
  return http<{ job_id: string; status: 'queued'; db_session_id: string | null }>('/api/memo/generate', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function getMemoJob(jobId: string): Promise<JobProgress> {
  if (!BASE_URL) return mockGetMemoJob(jobId);
  return http<JobProgress>(`/api/memo/${jobId}`);
}

export async function saveMemo(jobId: string, sections: MemoSection[]): Promise<{ success: true }> {
  if (!BASE_URL) return { success: true };
  return http<{ success: true }>(`/api/memo/${jobId}/save`, {
    method: 'POST',
    body: JSON.stringify({ sections }),
  });
}

export async function sendMemoChat(jobId: string, message: string): Promise<ChatResponse> {
  if (!BASE_URL) return mockSendMemoChat(jobId, message);
  return http<ChatResponse>('/api/memo/chat', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId, message }),
  });
}

/* ════════════════════════════════════════════════
   Contract types
   ════════════════════════════════════════════════ */

export type ContractClause = {
  index: number;
  title: string;
  body: string;
};

export type ContractResult = {
  contract_text: string;
  preamble: string;
  closing: string;
  clauses: ContractClause[];
  contract_type_key: string | null;
  contract_type_ar: string;
  clause_validation: { checked: boolean; is_complete: boolean; found_count: number; expected_count: number } | null;
  docx_path: string | null;
};

export type ContractJobProgress = {
  status: JobStatus;
  progress?: number;
  stage?: string;
  result?: ContractResult;
  error?: string;
};

export type ContractChatChangeCard = {
  clause_index: number;
  clause_title: string;
  old_text: string;
  new_text: string;
};

export type ContractChatResponse = {
  reply: string;
  updated_clauses: ContractClause[] | null;
  change_card: ContractChatChangeCard | null;
  switch_task: SwitchTaskSignal | null;
};

/* ════════════════════════════════════════════════
   Contract endpoints
   ════════════════════════════════════════════════ */

export async function createContractJob(query: string): Promise<{ job_id: string; status: 'queued'; db_session_id: string | null }> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<{ job_id: string; status: 'queued'; db_session_id: string | null }>('/api/contract/generate', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function getContractJob(jobId: string): Promise<ContractJobProgress> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ContractJobProgress>(`/api/contract/${jobId}`);
}

export async function sendContractChat(jobId: string, message: string): Promise<ContractChatResponse> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<ContractChatResponse>('/api/contract/chat', {
    method: 'POST',
    body: JSON.stringify({ job_id: jobId, message }),
  });
}

export function pollContractJob(
  jobId: string,
  onUpdate: (p: ContractJobProgress) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<ContractJobProgress> {
  const { intervalMs = 3000, signal } = opts;
  return new Promise((resolve, reject) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };

    if (signal) {
      if (signal.aborted) { stop(); reject(new DOMException('Aborted', 'AbortError')); return; }
      signal.addEventListener('abort', stop, { once: true });
    }

    const tick = async () => {
      if (stopped) return;
      try {
        const p = await getContractJob(jobId);
        if (stopped) return;
        onUpdate(p);
        if (p.status === 'completed') { stop(); resolve(p); return; }
        if (p.status === 'failed') { stop(); reject(new Error(p.error || 'فشل توليد العقد')); return; }
      } catch (err) {
        if (stopped) return;
        if (err instanceof DOMException && err.name === 'AbortError') { stop(); reject(err); return; }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}

/** يرجع رابط تحميل ملف الـ docx */
export function getContractDownloadUrl(jobId: string): string {
  return `${BASE_URL}/api/contract/${jobId}/download`;
}

/** يفتح نافذة تحميل ملف docx */
export function downloadContractDocx(jobId: string): void {
  const url = getContractDownloadUrl(jobId);
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* ════════════════════════════════════════════════
   Router Agent endpoint
   ════════════════════════════════════════════════ */

export type RouterAPIRequest = {
  messages: { role: string; text: string }[];
  current_text: string;
};

export type RouterAPIResponse = {
  intent: string;
  should_route: boolean;
  is_reference: boolean;
  response: string;
  enriched_prompt: string;
};

export async function routeViaAPI(req: RouterAPIRequest): Promise<RouterAPIResponse> {
  if (!BASE_URL) throw new Error('No API base URL');
  return http<RouterAPIResponse>('/api/router', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/* ════════════════════════════════════════════════
   Polling helper
   ════════════════════════════════════════════════ */

export function pollMemoJob(
  jobId: string,
  onUpdate: (p: JobProgress) => void,
  opts: { intervalMs?: number; signal?: AbortSignal } = {},
): Promise<JobProgress> {
  const { intervalMs = 3000, signal } = opts;
  return new Promise((resolve, reject) => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };

    if (signal) {
      if (signal.aborted) { stop(); reject(new DOMException('Aborted', 'AbortError')); return; }
      signal.addEventListener('abort', stop, { once: true });
    }

    const tick = async () => {
      if (stopped) return;
      try {
        const p = await getMemoJob(jobId);
        if (stopped) return;
        onUpdate(p);
        if (p.status === 'completed') { stop(); resolve(p); return; }
        if (p.status === 'failed') { stop(); reject(new Error(p.error || 'فشل التوليد')); return; }
      } catch (err) {
        if (stopped) return;
        if (err instanceof DOMException && err.name === 'AbortError') { stop(); reject(err); return; }
        // transient network errors: keep polling
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}

/* ════════════════════════════════════════════════
   Mock fallback (used until VITE_API_BASE_URL is set)
   ════════════════════════════════════════════════ */

const mockSections: MemoSection[] = [
  {
    id: 'waqai',
    title: 'أولاً: وقائع الدعوى',
    body:
      'في يوم الثلاثاء الموافق ٠٣/٠٤/١٤٤٥هـ، تقدم المدعي (السيد/ ماجد بن فهد الدوسري) بدعوى أمام محكمة التنفيذ بمدينة الرياض، يطالب فيها المدعى عليه (شركة الأفق للتجارة) بسداد مبلغ قدره ١٢٠٬٠٠٠ ريال، قيمة أعمال استشارية نفذها المدعي وفق عقد موثق بتاريخ ١٢/٠١/١٤٤٥هـ.\n\nيدّعي المدعي أن المدعى عليه امتنع عن سداد المستحقات رغم إتمام الخدمة وفق الأصول، فيما يدّعي المدعى عليه أن الخدمة لم تكن متوافقة مع المعايير المتفق عليها، وأن العقد تضمن شرطًا جزائيًا بنسبة ١٠٪ يُحسم من المستحقات.',
  },
  {
    id: 'difa_shakliya',
    title: 'ثانياً: الدفوع الشكلية',
    body:
      'أولًا: الدفع بعدم اختصاص محكمة التنفيذ نوعيًا نظرًا لأن النزاع يتعلق بتنفيذ التزام تعاقدي متنازع على وجوده، مما يوجب إحالة الدعوى إلى المحكمة العامة.\n\nثانيًا: الدفع بسقوط الشرط الجزائي لعدم تحقق الضرر الفعلي، إذ الأصل في التعويض أن يكون وفق الضرر المثبت لا وفق نسبة ثابتة.\n\nثالثًا: الدفع ببطلان الإجراءات لعدم إعلان المدعى عليه إعلانًا صحيحًا وفق المادة ٣٥ من نظام المرافعات.',
  },
  {
    id: 'difa_mawdoiya',
    title: 'ثالثاً: الدفوع الموضوعية',
    body:
      'أولًا: ثبوت تنفيذ الخدمة وفق الأصول بموجب المستندات المؤرخة والموقعة من طرفي العقد، مما يسقط ادعاء القصور.\n\nثانيًا: عدم تقديم المدعى عليه أي تقرير فني يثبت مخالفة الخدمة للمعايير المتفق عليها، وهو شرط لازم لإعمال شرط الجزاء.\n\nثالثًا: أن شرط الجزاء الثابت (١٠٪) يخالف مبادئ العدالة وحسن النية المنصوص عليها في المادة ١٢٠ من نظام المدنيات، ويُرد إلى الضرر الفعلي المثبت.',
  },
  {
    id: 'talabat_khitamiya',
    title: 'رابعاً: الطلبات الختامية',
    body:
      'لذلك يلتمس المدعى عليه من محكمتكم الموقرة:\n\n١. الحكم برفض الدعوى لعدم ثبوت حق المدعي في الشرط الجزائي الثابت.\n\n٢. في حال ثبوت أي حق، حصره في الضرر الفعلي المثبت دون النسبة الثابتة في العقد.\n\n٣. إلزام المدعي بمصاريف الدعوى وأتعاب المحاماة.',
  },
  {
    id: 'talabat_ijraiya',
    title: 'خامساً: الطلبات الإجرائية المصاحبة',
    body:
      'يلتمس المدعى عليه إصدار القرارات الإجرائية الآتية:\n\n١. إلزام المدعي بتقديم المستندات الأصلية المؤسسة للدعوى للاطلاع عليها.\n\n٢. إحالة الدعوى إلى خبير فني لتقييم مدى توافق الخدمة المقدمة مع المعايير المتفق عليها.\n\n٣. تأجيل نظر الدعوى لحين صدور تقرير الخبير الفني.',
  },
];

const mockCaseMetadata: CaseMetadata = {
  defendant_name: 'شركة الأفق للتجارة',
  charge: 'مطالبة مالية بقيمة ١٢٠٬٠٠٠ ريال',
  case_number: '١٠١/٢٠٢٤',
  court: 'محكمة التنفيذ بالرياض — الدائرة الأولى',
  crime_type: 'نزاع تعاقدي',
  legal_nature: 'مدني',
  lawyer_name: 'عمر الخالد',
  lawyer_license: '٤٢١٨',
};

const mockMemoText = mockSections.map((s) => `${s.title}\n\n${s.body}`).join('\n\n');

// ── Mock: derive progress from job_id timestamp so HMR never breaks it ──
// job_id format: "mock-<timestamp>"  (timestamp = ms when job was created)
const MOCK_TOTAL_DURATION_MS = 14000; // ~14 s to simulate processing

function mockCreateMemoJob(): Promise<{ job_id: string; status: 'queued' }> {
  const jobId = `mock-${Date.now()}`;
  return Promise.resolve({ job_id: jobId, status: 'queued' });
}

function mockGetMemoJob(jobId: string): Promise<JobProgress> {
  const stages = [
    'توسيع الوقائع...',
    'استرجاع المراجع القانونية...',
    'توليد الدفوع...',
    'التحقق القانوني...',
  ];

  // Parse creation time from job_id; fall back to "almost done" for unknown ids.
  const createdAt = parseInt(jobId.replace('mock-', ''), 10) || (Date.now() - MOCK_TOTAL_DURATION_MS);
  const elapsed = Date.now() - createdAt;
  const progress = Math.min(elapsed / MOCK_TOTAL_DURATION_MS, 1);

  if (progress < 1) {
    const stageIdx = Math.min(Math.floor(progress * stages.length), stages.length - 1);
    return Promise.resolve({ status: 'processing', progress, stage: stages[stageIdx] });
  }

  return Promise.resolve({
    status: 'completed',
    progress: 1,
    stage: 'تم',
    result: {
      sections: mockSections,
      case_metadata: mockCaseMetadata,
      memo: mockMemoText,
    },
  });
}

function mockSendMemoChat(_jobId: string, message: string): Promise<ChatResponse> {
  // Mock mode: لا نتظاهر بتعديل حاجة
  // نرد برد نصي فقط يوضح إن ده mock ولا يوجد backend متصل
  return Promise.resolve({
    reply: 'عذرًا، لا يمكن معالجة طلبك حاليًا — الخادم غير متصل. قم بتوصيل الباك إند عبر متغير VITE_API_BASE_URL في ملف .env لتشغيل تعديلات المذكرة بالذكاء الاصطناعي.',
    updated_sections: null,
    change_card: null,
    warnings: [],
    switch_task: null,
  });
}

/* ════════════════════════════════════════════════
   Remote Sessions (الداتابيز — Supabase)
   بتشتغل بس للمستخدم المسجّل دخول (getAccessToken() موجود).
   ════════════════════════════════════════════════ */

export type RemoteSession = {
  id: string;
  firm_id: string;
  created_by: string;
  type: 'memo' | 'contract' | 'review' | 'research' | 'consultation';
  title: string;
  prompt: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type RemoteChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  text: string;
  change_card: unknown;
  created_at: string;
};

export async function listRemoteSessions(): Promise<RemoteSession[]> {
  const res = await http<{ sessions: RemoteSession[] }>('/api/sessions');
  return res.sessions;
}

export async function getRemoteSession(id: string): Promise<{
  session: RemoteSession;
  result: Record<string, unknown> | null;
  chat_history: RemoteChatMessage[];
}> {
  return http(`/api/sessions/${id}`);
}

export async function deleteRemoteSession(id: string): Promise<void> {
  await http(`/api/sessions/${id}`, { method: 'DELETE' });
}

export async function pinRemoteSession(id: string, pinned: boolean): Promise<void> {
  await http(`/api/sessions/${id}/pin`, {
    method: 'POST',
    body: JSON.stringify({ pinned }),
  });
}
