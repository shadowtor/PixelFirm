import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  Choicebox,
  ChoiceboxIndicator,
  ChoiceboxItem,
  ChoiceboxItemDescription,
  ChoiceboxItemHeader,
  ChoiceboxItemTitle,
} from "@/components/kibo-ui/choicebox";
import type { Question, Selections } from "./view-model";

const OTHER = "__other__";
const OTHER_LABEL = "Other (write your own answer)";
// Full text, never clamped: the CEO must see the whole choice before answering (UI-SPEC long-text).
const WRAP = "whitespace-normal wrap-anywhere";

// Every question and option string is a React text child; previews are plain text in a pre (T-06-09-01).
export function QuestionsForm({
  decisionId,
  questions,
  selections,
  onChange,
}: {
  decisionId: string;
  questions: Question[];
  selections: Selections;
  onChange(next: Selections): void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {questions.map((q, qi) => {
        const sel = selections[q.question] ?? { labels: [] };
        const set = (next: Selections[string]) => onChange({ ...selections, [q.question]: next });
        const id = (oi: number | "other" | "text") => `${decisionId}-q${qi}-${oi}`;
        const otherChosen = sel.other !== undefined;
        const preview = (label: string, text?: string) =>
          text && sel.labels.includes(label) ? (
            <pre className="mt-2 max-h-[480px] overflow-auto rounded-md border p-4 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap">
              {text}
            </pre>
          ) : null;

        return (
          <div key={q.question} role="group" aria-labelledby={id("text")} className="flex min-w-0 flex-col gap-2">
            <Badge variant="outline" className="h-auto max-w-full whitespace-normal wrap-anywhere">
              {q.header}
            </Badge>
            <p id={id("text")} className={`text-sm ${WRAP}`}>
              {q.question}
            </p>

            {q.multiSelect ? (
              <div className="grid gap-2">
                {q.options.map((o, oi) => (
                  <div key={o.label} className="ceo-choice">
                    <FieldLabel htmlFor={id(oi)}>
                      <Field orientation="horizontal">
                        <FieldContent>
                          <FieldTitle className={`w-auto font-semibold ${WRAP}`}>{o.label}</FieldTitle>
                          <FieldDescription className={`text-xs ${WRAP}`}>{o.description}</FieldDescription>
                        </FieldContent>
                        <Checkbox
                          id={id(oi)}
                          checked={sel.labels.includes(o.label)}
                          onCheckedChange={(on) =>
                            set({ ...sel, labels: on === true ? [...sel.labels, o.label] : sel.labels.filter((l) => l !== o.label) })
                          }
                        />
                      </Field>
                    </FieldLabel>
                    {preview(o.label, o.preview)}
                  </div>
                ))}
                <div className="ceo-choice">
                  <FieldLabel htmlFor={id("other")}>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldTitle className="font-semibold">{OTHER_LABEL}</FieldTitle>
                      </FieldContent>
                      <Checkbox
                        id={id("other")}
                        checked={otherChosen}
                        onCheckedChange={(on) => set({ labels: sel.labels, ...(on === true ? { other: sel.other ?? "" } : {}) })}
                      />
                    </Field>
                  </FieldLabel>
                </div>
              </div>
            ) : (
              <Choicebox
                value={otherChosen ? OTHER : (sel.labels[0] ?? "")}
                onValueChange={(v) => set(v === OTHER ? { labels: [], other: sel.other ?? "" } : { labels: [v] })}
              >
                {q.options.map((o, oi) => (
                  <div key={o.label} className="ceo-choice">
                    <ChoiceboxItem value={o.label} id={id(oi)}>
                      <ChoiceboxItemHeader>
                        <ChoiceboxItemTitle className={`w-auto font-semibold ${WRAP}`}>{o.label}</ChoiceboxItemTitle>
                        <ChoiceboxItemDescription className={`text-xs ${WRAP}`}>{o.description}</ChoiceboxItemDescription>
                      </ChoiceboxItemHeader>
                      <ChoiceboxIndicator id={id(oi)} />
                    </ChoiceboxItem>
                    {preview(o.label, o.preview)}
                  </div>
                ))}
                <div className="ceo-choice">
                  <ChoiceboxItem value={OTHER} id={id("other")}>
                    <ChoiceboxItemHeader>
                      <ChoiceboxItemTitle className="font-semibold">{OTHER_LABEL}</ChoiceboxItemTitle>
                    </ChoiceboxItemHeader>
                    <ChoiceboxIndicator id={id("other")} />
                  </ChoiceboxItem>
                </div>
              </Choicebox>
            )}

            {otherChosen && (
              <Textarea
                aria-label={`Your answer: ${q.question}`}
                value={sel.other}
                onChange={(e) => set({ ...sel, other: e.target.value })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
