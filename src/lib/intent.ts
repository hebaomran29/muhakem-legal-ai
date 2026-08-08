import type { TaskType } from './types';

const keywords: Record<TaskType, string[]> = {
  contract:     ['عقد', 'صياغة', 'اتفاقية', 'بنود', 'عقود', 'إيجار', 'عمل', 'شراكة'],
  review:       ['مراجعة', 'راجع', 'فحص', 'تدقيق', 'مخاطر', 'تحليل'],
  memo:         ['مذكرة', 'دفاع', 'مرافعة', 'لائحة', 'قضية', 'محكمة', 'مدعي', 'مدعى'],
  research:     ['بحث', 'مقال', 'حكم', 'مادة', 'قانون', 'سابقة', 'تشريع', 'استدلال'],
  consultation: ['استشارة', 'رأي', 'سؤال', 'استفتاء', 'فتوى', 'نصيحة'],
};

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

export function detectIntent(text: string): TaskType {
  const lower = text.toLowerCase().trim();
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

  if (bestScore > 0) return best;

  // مفيش كلمة مفتاحية صريحة، بس النص شكله وقائع قضية جنائية خام → مذكرة دفاع
  if (looksLikeRawCaseFacts(text)) return 'memo';

  return 'consultation';
}
