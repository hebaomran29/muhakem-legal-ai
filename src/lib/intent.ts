import type { TaskType } from './types';

const keywords: Record<TaskType, string[]> = {
  contract:     ['عقد', 'صياغة', 'اتفاقية', 'بنود', 'عقود', 'إيجار', 'عمل', 'شراكة'],
  review:       ['مراجعة', 'راجع', 'فحص', 'تدقيق', 'مخاطر', 'تحليل'],
  memo:         ['مذكرة', 'دفاع', 'مرافعة', 'لائحة', 'قضية', 'محكمة', 'مدعي', 'مدعى'],
  research:     ['بحث', 'مقال', 'حكم', 'مادة', 'قانون', 'سابقة', 'تشريع', 'استدلال'],
  consultation: ['استشارة', 'رأي', 'سؤال', 'استفتاء', 'فتوى', 'نصيحة'],
};

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

  return bestScore > 0 ? best : 'consultation';
}
