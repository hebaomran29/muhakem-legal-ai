import { BASE_URL, http } from './client';
import type {
  CaseMetadata,
  ChatResponse,
  GenerateMemoRequest,
  JobProgress,
  MemoResult,
  MemoSection,
} from './types';

export async function createMemoJob(
  req: GenerateMemoRequest,
): Promise<{ job_id: string; status: 'queued'; db_session_id: string | null }> {
  if (!BASE_URL) return { ...(await mockCreateMemoJob()), db_session_id: null };
  return http<{ job_id: string; status: 'queued'; db_session_id: string | null }>(
    '/api/memo/generate',
    { method: 'POST', body: JSON.stringify(req) },
  );
}

export async function getMemoJob(jobId: string): Promise<JobProgress> {
  if (!BASE_URL) return mockGetMemoJob(jobId);
  return http<JobProgress>(`/api/memo/${jobId}`);
}

export async function saveMemo(
  jobId: string,
  sections: MemoSection[],
): Promise<{ success: true }> {
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

export function pollMemoJob(
  jobId: string,
  onUpdate: (progress: JobProgress) => void,
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
      if (signal.aborted) {
        stop();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', stop, { once: true });
    }

    const tick = async () => {
      if (stopped) return;
      try {
        const progress = await getMemoJob(jobId);
        if (stopped) return;
        onUpdate(progress);
        if (progress.status === 'completed') {
          stop();
          resolve(progress);
          return;
        }
        if (progress.status === 'failed') {
          stop();
          reject(new Error(progress.error || 'فشل التوليد'));
          return;
        }
      } catch (error) {
        if (stopped) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          stop();
          reject(error);
          return;
        }
        // Keep polling through transient network errors.
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };

    tick();
  });
}

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

const mockMemoText = mockSections.map((section) => `${section.title}\n\n${section.body}`).join('\n\n');
const MOCK_TOTAL_DURATION_MS = 14000;

function mockCreateMemoJob(): Promise<{ job_id: string; status: 'queued' }> {
  return Promise.resolve({ job_id: `mock-${Date.now()}`, status: 'queued' });
}

function mockGetMemoJob(jobId: string): Promise<JobProgress> {
  const stages = [
    'توسيع الوقائع...',
    'استرجاع المراجع القانونية...',
    'توليد الدفوع...',
    'التحقق القانوني...',
  ];
  const createdAt = parseInt(jobId.replace('mock-', ''), 10) || (Date.now() - MOCK_TOTAL_DURATION_MS);
  const progress = Math.min((Date.now() - createdAt) / MOCK_TOTAL_DURATION_MS, 1);

  if (progress < 1) {
    const stageIdx = Math.min(Math.floor(progress * stages.length), stages.length - 1);
    return Promise.resolve({ status: 'processing', progress, stage: stages[stageIdx] });
  }

  return Promise.resolve({
    status: 'completed',
    progress: 1,
    stage: 'تم',
    result: { sections: mockSections, case_metadata: mockCaseMetadata, memo: mockMemoText },
  });
}

function mockSendMemoChat(_jobId: string, _message: string): Promise<ChatResponse> {
  return Promise.resolve({
    reply:
      'عذرًا، لا يمكن معالجة طلبك حاليًا — الخادم غير متصل. قم بتوصيل الباك إند عبر متغير VITE_API_BASE_URL في ملف .env لتشغيل تعديلات المذكرة بالذكاء الاصطناعي.',
    updated_sections: null,
    change_card: null,
    warnings: [],
    switch_task: null,
  });
}
