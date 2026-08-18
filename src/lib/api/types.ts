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
  progress?: number;
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
  clause_validation: {
    checked: boolean;
    is_complete: boolean;
    found_count: number;
    expected_count: number;
  } | null;
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

export type ConsultationRouting = {
  mode: 'confident' | 'multi' | 'ambiguous' | 'llm_fallback';
  laws?: string[];
  candidates?: string[];
  scores?: Record<string, number>;
};

export type ConsultationChatResponse = {
  session_id: string | null;
  reply: string;
  needs_clarification: boolean;
  routing?: ConsultationRouting | null;
};

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
