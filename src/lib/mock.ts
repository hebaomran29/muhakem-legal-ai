import type { Clause, ChatKind } from './types';

/* ════════════════════════════════════════════════
   Contract clauses (for Review + Report screens)
   ════════════════════════════════════════════════ */
export const contractClauses: Clause[] = [
  {
    id: 'cl1',
    number: '١',
    title: 'مدة العقد وتجديده',
    body: 'يسري هذا العقد لمدة سنة ميلادية كاملة، تبدأ من تاريخ التوقيع، ويُتجدد تلقائيًا لمدة مماثلة ما لم يُبدِ أحد الطرفين رغبته في إنهائه قبل ستين يومًا على الأقل من تاريخ الانتهاء.',
    status: 'review',
    riskScore: 45,
    reason: 'البند لا يحدد آلية واضحة للإشعار بالتجديد، وقد يؤدي إلى تجديد غير مقصود. كما أن مدة الإشعار (٦٠ يومًا) قد تكون طويلة في بعض الحالات.',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: 'تحديد آلية إشعار واضحة (كتابيًا أو بريديًا) وتقصير مدة الإشعار إلى ٣٠ يومًا.',
  },
  {
    id: 'cl2',
    number: '٢',
    title: 'الأجر ومكوناته',
    body: 'يتفق الطرفان على أجر شهري قدره ثمانية عشر ألف ريال، يدفع في نهاية كل شهر ميلادي، ويشمل ذلك جميع البدلات والمستحقات الأخرى.',
    status: 'safe',
    riskScore: 10,
    reason: '',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: '',
  },
  {
    id: 'cl3',
    number: '٣',
    title: 'سرية المعلومات',
    body: 'يلتزم الطرف الثاني بالحفاظ على سرية جميع المعلومات المتعلقة بالطرف الأول وأعماله، ولا يجوز له إفشاؤها لأي طرف ثالث.',
    status: 'review',
    riskScore: 35,
    reason: 'البند لا يحدد مدة التزام السرية بعد انتهاء العقد، ولا يحدد تعويضًا عن الإخلال به.',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: 'إضافة مدة للالتزام بالسرية (سنتان بعد انتهاء العقد) وتحديد تعويض ثابت عن الإخلال.',
  },
  {
    id: 'cl4',
    number: '٤',
    title: 'شرط الجزاء',
    body: 'في حال إخلال أحد الطرفين بأي من التزاماته، يُلزم بدفع شرط الجزاء الثابت بنسبة ١٠٪ من قيمة العقد.',
    status: 'risk',
    riskScore: 80,
    reason: 'شرط الجزاء الثابت (١٠٪) قد لا يعكس الضرر الفعلي، وقد يُطعن عليه قضائيًا. القضاء يفضل تقدير التعويض بناءً على الضرر المثبت.',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: 'تعديل الشرط ليعكس الضرر الفعلي المثبت، مع وضع حد أقصى للتعويض.',
  },
  {
    id: 'cl5',
    number: '٥',
    title: 'إنهاء العقد',
    body: 'يحق لأي من الطرفين فسخ العقد في أي وقت دون الحاجة إلى إشعار مسبق.',
    status: 'risk',
    riskScore: 90,
    reason: 'الفسخ دون إشعار مسبق يتعارض مع مبدأ حسن النية وي expose الطرف الآخر لضرر مفاجئ. القضاء يعتبر الفسخ التعسفي سببًا للتعويض.',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: 'إضافة شرط إشعار مسبق (٣٠ يومًا) وتعويض عادل عند الفسخ دون مسوغ.',
  },
  {
    id: 'cl6',
    number: '٦',
    title: 'فض النزاعات',
    body: 'يُحل أي نزاع ينشأ عن هذا العقد عن طريق التحكيم.',
    status: 'review',
    riskScore: 40,
    reason: 'البند عام ولا يحدد عدد المحكمين ولا مكان التحكيم ولا القانون الواجب التطبيق.',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: 'تحديد عدد المحكمين (٣)، ومكان التحكيم، والقانون الواجب التطبيق، ولغة التحكيم.',
  },
  {
    id: 'cl7',
    number: '٧',
    title: 'حسن النية',
    body: 'يلتزم الطرفان بتنفيذ هذا العقد بحسن نية، وبما يحقق المقاصد المشتركة منه.',
    status: 'safe',
    riskScore: 5,
    reason: '',
    decision: '',
    legalRef: '',
    legalBasis: '',
    recommendation: '',
  },
];

/* ════════════════════════════════════════════════
   Knowledge base stats
   ════════════════════════════════════════════════ */
export const kbStats: {
  icon: 'scale' | 'gavel' | 'file' | 'book';
  value: string;
  label: string;
  trend?: string;
}[] = [
  { icon: 'scale', value: '١٢٬٤٠٠+', label: 'مادة قانونية', trend: '+١٢٠ هذا الشهر' },
  { icon: 'gavel', value: '٨٬٩٠٠+', label: 'حكم قضائي', trend: '+٣٠٠ هذا الشهر' },
  { icon: 'file', value: '٢٬٣٠٠+', label: 'صيغة عقد', trend: '+٤٥ هذا الشهر' },
  { icon: 'book', value: '١٬٥٠٠+', label: 'مرجع فقهي', trend: '+٢٢ هذا الشهر' },
];

/* ════════════════════════════════════════════════
   Sidebar chat lists
   ════════════════════════════════════════════════ */
export const pinnedChats: {
  id: string;
  title: string;
  meta?: string;
  kind: ChatKind;
}[] = [
  { id: 'p1', title: 'عقد شراكة — شركة XYZ', meta: 'آخر تحليل قبل قليل', kind: 'contract-review' },
  { id: 'p2', title: 'مذكرة دفاع — قضية الأحمد', kind: 'case' },
];

export const recentChats: {
  id: string;
  title: string;
  meta?: string;
  updatedAt: string;
  kind: ChatKind;
}[] = [
  { id: 'r1', title: 'مراجعة عقد عمل', updatedAt: 'قبل ساعة', kind: 'contract-review' },
  { id: 'r2', title: 'بحث: المسؤولية التقصيرية', updatedAt: 'أمس', kind: 'research' },
  { id: 'r3', title: 'صياغة عقد إيجار تجاري', updatedAt: 'قبل يومين', kind: 'contract-gen' },
  { id: 'r4', title: 'مذكرة دفاع — مطالبة مالية', updatedAt: 'قبل ٣ أيام', kind: 'memo' },
  { id: 'r5', title: 'مراجعة اتفاقية سرية', updatedAt: 'الأسبوع الماضي', kind: 'contract-review' },
  { id: 'r6', title: 'بحث: نظام التحكيم', updatedAt: 'الأسبوع الماضي', kind: 'research' },
];
