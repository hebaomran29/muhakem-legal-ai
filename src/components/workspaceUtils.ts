import type { ContractChatMessage } from '../lib/useContractChat';
import type { TaskKind } from '../lib/useSessionChat';
import type { MemoChatMessage } from '../lib/useMemoChat';
import type { ContractResult, MemoResult, RemoteChatMessage } from '../lib/api';
import type { ChatKind, ScreenId } from '../lib/types';

export type WorkspacePhase = 'idle' | 'thinking' | 'artifact';

export type ArtifactType = 'contract' | 'review' | 'memo' | 'research' | 'consultation';

export const artifactScreenMap: Record<ArtifactType, ScreenId> = {
  contract: 'contract-gen',
  review: 'review',
  memo: 'memo',
  research: 'research',
  consultation: 'consultation',
};

export const artifactTitleMap: Record<ArtifactType, string> = {
  contract: 'مسودة العقد',
  review: 'مراجعة العقد',
  memo: 'مذكرة الدفاع',
  research: 'نتائج البحث',
  consultation: 'الرأي القانوني',
};

export function artifactToChatKind(artifact: ArtifactType): ChatKind {
  const map: Record<ArtifactType, ChatKind> = {
    contract: 'contract-gen',
    review: 'contract-review',
    memo: 'memo',
    research: 'research',
    consultation: 'consultation',
  };
  return map[artifact];
}

export function toMemoChatMessages(history: RemoteChatMessage[]): MemoChatMessage[] {
  return history.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    changeCard: (message.change_card ?? undefined) as MemoChatMessage['changeCard'],
  }));
}

export function toContractChatMessages(history: RemoteChatMessage[]): ContractChatMessage[] {
  return history.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    changeCard: (message.change_card ?? undefined) as ContractChatMessage['changeCard'],
  }));
}

export function extractMemoInfo(
  result: MemoResult,
  prompt: string,
): { title: string; preview: string; tags: string[] } {
  const metadata = result.case_metadata;
  const parts: string[] = [];
  if (metadata?.defendant_name) parts.push(metadata.defendant_name);
  if (metadata?.charge) parts.push(metadata.charge);
  if (metadata?.crime_type) parts.push(metadata.crime_type);

  const title = parts.length > 0
    ? `مذكرة دفاع — ${parts[0]}`
    : prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt;

  const tags: string[] = [];
  if (metadata?.legal_nature) tags.push(metadata.legal_nature);
  if (metadata?.crime_type) tags.push(metadata.crime_type);
  if (metadata?.court) tags.push(metadata.court.split('—')[0].trim());

  return { title, preview: `${result.sections.length} أقسام`, tags };
}

export function extractContractInfo(
  result: ContractResult,
  prompt: string,
): { title: string; preview: string; tags: string[] } {
  const title = result.contract_type_ar
    ? `عقد ${result.contract_type_ar}`
    : prompt.length > 40 ? `${prompt.slice(0, 40)}...` : prompt;
  const tags = result.contract_type_ar ? [result.contract_type_ar] : [];
  return { title, preview: `${result.clauses.length} بند`, tags };
}

export function assemblePrompt(kind: TaskKind, data: Record<string, string>): string {
  const parts = Object.values(data).filter((value) => value.trim());
  const prefix: Record<TaskKind, string> = {
    contract: 'صياغة عقد',
    review: 'مراجعة عقد',
    memo: 'إعداد مذكرة دفاع',
    research: 'بحث قانوني',
    consultation: 'استشارة قانونية',
  };
  return `${prefix[kind]} — ${parts.join('، ')}`;
}
