import { Fragment, type ReactNode } from "react";
import type { DecisionRecord, PendingItem } from "company-core";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { DiffView } from "./DiffView";
import { actionLabel, detailMeta, safeLink } from "./view-model";

// 06-UI-SPEC "Detail pane, top to bottom". Every agent string is a React text child: no raw HTML,
// no markdown (T-06-09-01). `questions` is section 3, supplied by the caller for AskUserQuestion items.
export function DetailPane({ item, now, questions }: { item: PendingItem; now: number; questions?: ReactNode }) {
  const { request } = item.record;
  const sections: [string, ReactNode][] = [];

  if (request.kind === "ceo_gated_tool") {
    sections.push([
      "Runs on approve",
      <>
        {request.toolName && (
          <Badge variant="outline" className="font-mono">
            {request.toolName}
          </Badge>
        )}
        <pre className="max-h-[240px] overflow-auto rounded-md border bg-card p-4 font-mono text-xs leading-normal wrap-anywhere whitespace-pre-wrap">
          {request.toolInput ?? ""}
        </pre>
      </>,
    ]);
  }
  if (questions) sections.push(["Questions", questions]);
  if (request.context) sections.push(["Context", <p className="text-sm whitespace-pre-wrap wrap-anywhere">{request.context}</p>]);
  sections.push([
    "Recommendation",
    request.recommendation ? (
      <div className="rounded-md border bg-card p-4 text-sm whitespace-pre-wrap wrap-anywhere">{request.recommendation}</div>
    ) : (
      <p className="text-sm text-muted-foreground">The agent did not give a recommendation.</p>
    ),
  ]);
  if (request.links?.length) {
    sections.push([
      "Links",
      <ul className="flex flex-col gap-1 text-sm">
        {request.links.map((raw, i) => {
          const link = safeLink(raw);
          return (
            <li key={i} className="wrap-anywhere">
              {"href" in link ? (
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-foreground underline">
                  {link.href}
                </a>
              ) : (
                <span className="font-mono text-xs">{link.text}</span>
              )}
            </li>
          );
        })}
      </ul>,
    ]);
  }
  sections.push([
    "Changes",
    request.diff?.files.length ? (
      <DiffView diff={request.diff} />
    ) : (
      <p className="text-sm text-muted-foreground">No file changes attached to this request.</p>
    ),
  ]);
  if (item.earlier.length) sections.push(["Earlier in this thread", <EarlierRounds rounds={item.earlier} />]);

  return (
    <div className="flex max-w-[880px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-tight font-semibold wrap-anywhere">{request.title ?? request.reason}</h2>
        <p className="text-xs text-muted-foreground">{detailMeta(request, now)}</p>
      </div>
      {sections.map(([heading, body]) => (
        <Fragment key={heading}>
          <Separator />
          <section className="flex min-w-0 flex-col gap-2">
            <h3 className="text-xs leading-snug font-semibold tracking-[0.04em] text-muted-foreground uppercase">{heading}</h3>
            {body}
          </section>
        </Fragment>
      ))}
    </div>
  );
}

function EarlierRounds({ rounds }: { rounds: DecisionRecord[] }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-sm text-foreground underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none">
        {rounds.length === 1 ? "Show round 1" : `Show rounds 1-${rounds.length}`}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="mt-2 flex flex-col gap-4">
          {rounds.map((r, i) => {
            const at = r.decision?.decidedAt ?? r.expired?.expiredAt;
            return (
              <li key={r.request.decisionId} className="flex flex-col gap-1 rounded-md border p-4 text-sm">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Round {i + 1}</span>
                  <Badge variant="outline">{r.decision ? actionLabel(r.decision.action) : "Expired"}</Badge>
                  {at && <time dateTime={at}>{new Date(at).toLocaleString()}</time>}
                </span>
                <span className="wrap-anywhere">{r.request.title ?? r.request.reason}</span>
                {r.decision?.note && <p className="whitespace-pre-wrap wrap-anywhere text-muted-foreground">{r.decision.note}</p>}
              </li>
            );
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
