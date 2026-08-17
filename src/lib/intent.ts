import type { TaskType } from './types';

/* ══════════════════════════════════════════════════════════════
   Intent detection — نفس منطق الـ backend keyword fallback.

   التغيير الأساسي: كلمات مثل "عقد" و"اتفاقية" مش كافية لحدها
   لتحديد الـ intent. لازم نعرف هل المستخدم **يسأل** (consultation)
   ولا **يطلب إنشاء** (contract). المعيار هو نمط الجملة.
   ══════════════════════════════════════════════════════════════ */

/** كلمات مفتاحية حسب **نوع الإجراء** — مش حسب الموضوع.
 *  "عقد" مش هنا عشان هي كلمة موضوعية: المستخدم ممكن يسأل عنها
 *  (consultation) أو يطلب إنشاءها (contract). */
const keywords: Record<TaskType, string[]> = {
  contract: ['اكتب لي عقد', 'أنشئ عقد', 'صياغة عقد', 'صِغ لي عقد',
             'اكتب عقد', 'أريد عقد', 'ابني عقد', 'جهّز عقد',
             'اعداد عقد', 'إعداد عقد', 'تحرير عقد',
             'صياغة', 'اتفاقية'],
  review: ['راجع', 'فحص', 'تدقيق', 'مراجعة'],
  memo: ['مذكرة', 'دفاع', 'مرافعة', 'لائحة'],
  research: ['بحث قانوني', 'مقال قانوني', 'سابقة قضائية'],
  consultation: ['استشارة', 'رأي', 'استفتاء', 'فتوى', 'نصيحة'],
};

/* أنماط الاستفهام العربية — لو النص يبدأ بأي من دول أو يحتويها،
   فهو **سؤال** (consultation) حتى لو فيه كلمات مثل "عقد". */
const QUESTION_PATTERNS = [
  'ما هي', 'ما هو', 'ما هى',
  'ما حكم', 'ما حقوق', 'ما هي حقوق', 'ما هي شروط',
  'هل', 'هل يجوز', 'هل يحق', 'هل يمكن',
  'متى', 'متى ي', 'متى يجوز', 'متى يبطل',
  'لماذا', 'كيف', 'كيف يمكن', 'كيف يتم',
  'ما الفرق', 'ما الفرق بين',
  'ما المادة', 'ما هي المادة',
  'ما آثار', 'ما هي آثار',
  'شروط فسخ', 'آثار فسخ', 'أحكام فسخ',
];

/** أفعال الطلب/الإنشاء — لو النص فيه أي من دول، المستخدم يريد **إنشاء شيء**. */
const ACTION_VERBS = [
  'اكتب', 'اكتب لي', 'أنشئ', 'أنشئ لي', 'صِغ', 'صيغ لي',
  'أريد صياغة', 'أريد عقد', 'ابني', 'جهّز', 'حرر',
  'اعداد', 'إعداد', 'تحرير',
];

/* كلمات بتدل على "وقائع قضية جنائية خام" اتلصقت من غير طلب صريح —
   زي المستخدمة اللي بتلصق واقعة كاملة (اسم متهم، تهمة، محضر ضبط، إلخ)
   من غير ما تكتب "مذكرة دفاع" حرفيًا. لو النص فيه شوية من دول مع بعض،
   الاحتمال الأكبر إنها عايزة مذكرة دفاع مش استشارة. */
const RAW_CASE_INDICATORS = [
  'موكلتي', 'موكلي', 'المتهم', 'المتهمة', 'القبض', 'محضر الضبط',
  'بتهمة', 'النيابة', 'الشاكي', 'إذن التفتيش', 'الرائد', 'مباحث',
  'المضبوطات', 'قانون العقوبات', 'الجنحة', 'الجناية',
];

function looksLikeRawCaseFacts(text: string): boolean {
  const hits = RAW_CASE_INDICATORS.filter((w) => text.includes(w)).length;
  return hits >= 2; // مؤشرين أو أكتر عشان نتجنب false positive على سؤال عادي
}

function isQuestionPattern(text: string): boolean {
  // علامة استفهام صريحة
  if (text.includes('؟') || text.includes('?')) return true;
  const lower = text.trim();
  return QUESTION_PATTERNS.some((p) => lower.startsWith(p) || lower.includes(p));
}

function hasCreationVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return ACTION_VERBS.some((v) => lower.includes(v));
}

export function detectIntent(text: string): TaskType {
  const lower = text.toLowerCase().trim();
  const isQuestion = isQuestionPattern(text);
  const hasCreation = hasCreationVerb(text);

  // خطوة 1: لو فيه فعل إنشاء/صياغة واضح، حدد الهدف حسب الكلمات المرفقة
  if (hasCreation) {
    // لو الكلمات المفتاحية بتشير لمذكرة → memo (مش contract)
    if (keywords.memo.some((kw) => lower.includes(kw))) {
      return 'memo';
    }
    // لو فيه كلمات مراجعة → review
    if (keywords.review.some((kw) => lower.includes(kw))) {
      return 'review';
    }
    return 'contract';
  }

  // خطوة 2: تسجيل keyword scores
  let best: TaskType = 'consultation';
  let bestScore = 0;
  (Object.keys(keywords) as TaskType[]).forEach((type) => {
    let score = 0;
    keywords[type].forEach((kw) => {
      if (lower.includes(kw)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  });

  // خطوة 3: override — لو النص سؤال والتصنيف الحالي هو contract أو review
  // من غير ما يكون فيه فعل إنشاء واضح، خلّيه consultation
  const bestStr: string = best;
  if (isQuestion && bestScore > 0 && (bestStr === 'contract' || bestStr === 'review')) {
    return 'consultation';
  }

  if (bestScore > 0) return best;

  // مفيش كلمة مفتاحية صريحة، بس النص شكله وقائع قضية جنائية خام → مذكرة دفاع
  if (looksLikeRawCaseFacts(text)) return 'memo';

  return 'consultation';
}
