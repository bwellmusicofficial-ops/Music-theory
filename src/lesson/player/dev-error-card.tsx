import { Button } from '@/components/ui';

export interface DevErrorCardProps {
  title: string;
  detail: string;
  /** Present when the learner can move on without answering. */
  onSkip?: () => void;
}

/** Developer-facing error shown in place of a question that cannot run. */
export function DevErrorCard({ title, detail, onSkip }: DevErrorCardProps) {
  return (
    <div
      role="alert"
      data-testid="question-error"
      className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-warning bg-surface p-5"
    >
      <p className="text-sm font-bold uppercase tracking-widest text-warning">Developer error</p>
      <p className="text-lg font-bold">{title}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm text-fg-secondary">{detail}</pre>
      {onSkip ? (
        <Button variant="secondary" onClick={onSkip} className="self-start">
          Skip this question
        </Button>
      ) : null}
    </div>
  );
}
