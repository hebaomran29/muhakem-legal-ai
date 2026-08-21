import { ContractGen, type ChatProps } from '../screens/ContractGen';
import { Review } from '../screens/Review';
import { Memo } from '../screens/Memo';
import { Research } from '../screens/Research';
import { Consultation } from '../screens/Consultation';
import type { ContractResult, MemoResult, ReviewResult, SwitchTaskSignal } from '../lib/api';
import type { MemoChatMessage } from '../lib/useMemoChat';
import type { ContractChatMessage } from '../lib/useContractChat';
import type { ArtifactType } from './workspaceUtils';

export type ArtifactRendererProps = {
  activeKind: ArtifactType | null;
  initialPrompt: string;
  chatProps: ChatProps;
  memoData: MemoResult | null;
  memoJobId: string | null;
  contractData: ContractResult | null;
  contractJobId: string | null;
  reviewData: ReviewResult | null;
  reviewSourceText: string;
  reviewFilename: string;
  onReviewComplete: (sessionId: string, result: ReviewResult, sourceText: string, filename: string) => void;
  memoInitialChatMessages: MemoChatMessage[] | undefined;
  contractInitialChatMessages: ContractChatMessage[] | undefined;
  onSwitchTask: (signal: SwitchTaskSignal) => void;
};

export function ArtifactRenderer({
  activeKind,
  initialPrompt,
  chatProps,
  memoData,
  memoJobId,
  contractData,
  contractJobId,
  reviewData,
  reviewSourceText,
  reviewFilename,
  onReviewComplete,
  memoInitialChatMessages,
  contractInitialChatMessages,
  onSwitchTask,
}: ArtifactRendererProps) {
  if (!activeKind) return null;

  switch (activeKind) {
    case 'contract':
      return (
        <ContractGen
          contractData={contractData}
          jobId={contractJobId}
          initialPrompt={initialPrompt}
          embedded
          chatProps={chatProps}
          onSwitchTask={onSwitchTask}
          initialChatMessages={contractInitialChatMessages}
        />
      );
    case 'review':
      return (
        <Review
          initialPrompt={initialPrompt}
          embedded
          chatProps={chatProps}
          reviewData={reviewData}
          sourceText={reviewSourceText}
          filename={reviewFilename}
          onReviewComplete={onReviewComplete}
        />
      );
    case 'memo':
      return (
        <Memo
          initialPrompt={initialPrompt}
          memoData={memoData}
          jobId={memoJobId}
          embedded
          chatProps={chatProps}
          onSwitchTask={onSwitchTask}
          initialChatMessages={memoInitialChatMessages}
        />
      );
    case 'research':
      return <Research initialPrompt={initialPrompt} embedded chatProps={chatProps} />;
    case 'consultation':
      return <Consultation initialPrompt={initialPrompt} embedded chatProps={chatProps} />;
    default:
      return null;
  }
}
