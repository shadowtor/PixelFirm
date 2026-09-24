import { useId, useRef, useState } from "react";
import type { DecisionRequestView } from "company-core";
import type { DecisionAction } from "event-schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { DecisionBody, PostResult } from "./api";
import { inProgressLabel, validateNote, visibleText } from "./view-model";

type Props = {
  request: DecisionRequestView;
  note: string;
  onNoteChange(note: string): void;
  /** Question items only: the built answers, and whether every question has one. */
  answers?: Record<string, string>;
  answersReady: boolean;
  /** Set once the decision is no longer pending (409, decided elsewhere, expired): no buttons. */
  closedCopy: string | null;
  onSubmit(body: DecisionBody): Promise<PostResult>;
};

const SECONDARY: [DecisionAction, string][] = [
  ["request_changes", "Request changes"],
  ["more_research", "More research"],
  ["discuss", "Discuss"],
];

// 06-UI-SPEC detail item 9. No keyboard shortcut is registered for any action and the note never
// submits on Enter: a decision needs a click (or Tab-and-activate) on a labelled button (T-06-10-02).
export function ActionBar({ request, note, onNoteChange, answers, answersReady, closedCopy, onSubmit }: Props) {
  const [submitting, setSubmitting] = useState<DecisionAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const noteId = useId();
  const question = request.kind === "clarifying_question";
  const agentName = request.agentId ?? "The agent";
  const busy = submitting !== null;
  const showInvalid = invalid && !note.trim();

  const submit = async (action: DecisionAction) => {
    if (validateNote(action, note)) {
      setInvalid(true);
      noteRef.current?.focus();
      return;
    }
    setInvalid(false);
    setError(null);
    setSubmitting(action);
    const trimmed = note.trim();
    const result = await onSubmit({
      action,
      ...(trimmed && { note: trimmed }),
      ...(question && action === "approve" && { answers }),
    });
    setSubmitting(null);
    // 409 is the parent's: it swaps this bar for the no-longer-pending alert.
    if (!result.ok && result.status !== 409) setError(result.reason);
  };

  const label = (action: DecisionAction, text: string) =>
    submitting === action ? (
      <>
        <Spinner aria-hidden="true" data-icon="inline-start" />
        {inProgressLabel(action, question)}
      </>
    ) : (
      text
    );

  const size = "h-11 md:h-9";
  const approve = (
    <Button className={`${size} w-full font-semibold md:w-auto`} disabled={busy || !answersReady} onClick={question ? () => void submit("approve") : undefined}>
      {label("approve", question ? "Send answers" : "Approve")}
    </Button>
  );

  return (
    <section aria-label="Decision actions" className="sticky -bottom-6 mt-6 flex max-w-[880px] flex-col gap-4 border-t bg-card p-4">
      {/* No data-invalid on Field: it turns the label #D62828, and destructive is never text here (UI-SPEC Color). */}
      <Field className="gap-2">
        <FieldLabel htmlFor={noteId}>Note to agent</FieldLabel>
        <Textarea
          id={noteId}
          ref={noteRef}
          rows={3}
          value={note}
          readOnly={closedCopy !== null}
          disabled={busy}
          placeholder="What should the agent do next?"
          aria-invalid={showInvalid || undefined}
          aria-describedby={`${noteId}-help`}
          onChange={(e) => onNoteChange(e.target.value)}
          className="max-h-[calc(8lh+1rem)] min-h-[calc(3lh+1rem)] text-sm"
        />
        {showInvalid ? (
          <FieldError id={`${noteId}-help`} className="text-[#FF8A80]">
            Add a note. The agent needs to know what you want.
          </FieldError>
        ) : (
          <FieldDescription id={`${noteId}-help`} className="text-xs">
            Required for Request changes, More research and Discuss. Optional for Approve and Reject.
          </FieldDescription>
        )}
      </Field>

      {closedCopy !== null ? (
        <Alert>
          <AlertDescription className="text-foreground">{closedCopy}</AlertDescription>
        </Alert>
      ) : (
        <>
          {error && (
            <Alert>
              <AlertDescription className="text-[#FF8A80]">
                Decision not sent: {error}. The agent is still waiting. Try again.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap gap-2">
            {question ? (
              approve
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>{approve}</AlertDialogTrigger>
                <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve this action?</AlertDialogTitle>
                    <AlertDialogDescription>{agentName} will run exactly this call. Nothing else is approved.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="flex min-w-0 flex-col gap-2">
                    {request.toolName && (
                      <Badge variant="outline" className="font-mono">
                        {request.toolName}
                      </Badge>
                    )}
                    <pre className="max-h-[240px] overflow-auto rounded-md border bg-background p-4 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap">
                      {visibleText(request.toolInput ?? "")}
                    </pre>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep waiting</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void submit("approve")}>Approve and run</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {SECONDARY.map(([action, text]) => (
              <Button key={action} variant="outline" className={size} disabled={busy} onClick={() => void submit(action)}>
                {label(action, text)}
              </Button>
            ))}
            <Button
              variant="outline"
              className={`${size} border-destructive hover:bg-destructive hover:text-white md:ml-auto dark:border-destructive dark:hover:bg-destructive`}
              disabled={busy}
              onClick={() => void submit("reject")}
            >
              {label("reject", "Reject")}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
