/* ── Screen navigation ── */
export type ScreenId =
  | 'landing'
  | 'thinking'
  | 'contract-gen'
  | 'contract-doc'
  | 'upload'
  | 'review'
  | 'report'
  | 'memo'
  | 'research'
  | 'history';

/* ── Chat / session kinds ── */
export type ChatKind =
  | 'contract-review'
  | 'contract-gen'
  | 'memo'
  | 'research'
  | 'case';

/* ── Task types (for Thinking + intent detection) ── */
export type TaskType = 'contract' | 'review' | 'memo' | 'research' | 'consultation';

export interface TaskConfig {
  type: TaskType;
  title: string;
  description: string;
}

export const taskLabels: Record<TaskType, string> = {
  contract: 'صياغة عقد',
  review: 'مراجعة عقد',
  memo: 'مذكرة دفاع',
  research: 'بحث قانوني',
  consultation: 'استشارة قانونية',
};

/* ── Contract review ── */
export type RiskLevel = 'safe' | 'review' | 'risk';

export interface Clause {
  id: string;
  number: string;
  title: string;
  body: string;
  status: RiskLevel;
  riskScore: number;
  reason: string;
  decision: string;
  legalRef: string;
  legalBasis: string;
  recommendation: string;
}
