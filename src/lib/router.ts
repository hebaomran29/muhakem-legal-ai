/* ─────────────────────────────────────────────────────────────
   Router Agent — يحاول الـ API الأول (LLM)، ولو فشل بيرجع لـ keywords.
   يدمج Memory مع الرسالة الحالية عشان يطلع enriched_prompt.
   ───────────────────────────────────────────────────────────── */

import type { TaskType } from './types';
import { routeViaAPI, type RouterAPIResponse } from './api';
import { detectIntent } from './intent';

export interface RouterResult {
  intent: TaskType;
  shouldRoute: boolean;
  isReference: boolean;
  response: string;
  enrichedPrompt: string;
}

const VALID_INTENTS: TaskType[] = ['memo', 'contract', 'review', 'research', 'consultation'];

function validateIntent(raw: string): TaskType {
  if (VALID_INTENTS.includes(raw as TaskType)) return raw as TaskType;
  return 'consultation';
}

/* ── Reference indicators ── */
const REF_WORDS = [
  'القضية', 'ده', 'دي', 'اللي', 'المذكور', 'السابق',
  'كما ذكرت', 'للقضية', 'نفس', 'بخصوص', 'اللي فات',
  'المذكورة', 'المطلوب', 'عشان كده', 'بالتالي',
];

function isReferenceText(text: string): boolean {
  const lower = text.toLowerCase();
  return REF_WORDS.some((w) => lower.includes(w));
}

/* ── Keyword fallback (بلا backend) ── */
function keywordFallback(
  currentText: string,
  history: { role: string; text: string }[],
): RouterResult {
  const intent = detectIntent(currentText);
  const hasAction = intent !== 'consultation';
  const isRef = isReferenceText(currentText);

  const historyText = history
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('\n');

  let enrichedPrompt: string;

  // لو فيه reference أو سياق سابق مع action → ادمج
  if ((isRef || hasAction) && historyText) {
    enrichedPrompt = `${historyText}\n\n${currentText}`;
  } else {
    enrichedPrompt = currentText;
  }

  // رد بسيط حسب الحالة
  let response: string;
  if (hasAction) {
    const labels: Record<string, string> = {
      memo: 'إعداد مذكرة دفاع',
      contract: 'صياغة عقد',
      review: 'مراجعة العقد',
      research: 'بحث قانوني',
    };
    response = `حاضر، هبدأ ${labels[intent] || 'المطلوب'} فوراً.`;
  } else if (currentText.length > 30) {
    response =
      'فهمت. هل تريد إعداد مذكرة دفاع لهذه القضية، أو تحتاج مساعدة في شيء آخر؟';
  } else {
    response =
      'كيف أقدر أساعدك؟ ممكن تكتب وقائع قضية أو تطلب إجراء معين (مذكرة دفاع، صياغة عقد، مراجعة عقد، أو بحث قانوني).';
  }

  return { intent, shouldRoute: hasAction, isReference: isRef, response, enrichedPrompt };
}

/* ── Main router function ── */
export async function routeMessage(
  currentText: string,
  history: { role: string; text: string }[],
): Promise<RouterResult> {
 try {
    const apiResult = await routeViaAPI({
      messages: history,
      current_text: currentText,
    });

    return {
      intent: validateIntent(apiResult.intent),
      shouldRoute: apiResult.should_route,
      isReference: apiResult.is_reference,
      response: apiResult.response,
      enrichedPrompt: apiResult.enriched_prompt || currentText,
    };
  } catch {
    // Backend مش متوفر → fallback للـ keywords
    return keywordFallback(currentText, history);
  }
}
