import type { PendingItem } from "company-core";
import { Badge } from "@/components/ui/badge";
import { isLongWait, kindLabel, waitedLabel } from "./view-model";

// Agent-supplied text (title, reason, agent id) renders only as React text nodes (T-06-14-01).
export function QueueList({
  items,
  selectedId,
  onSelect,
  now,
}: {
  items: PendingItem[];
  selectedId: string | null;
  onSelect(decisionId: string): void;
  now: number;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map(({ record: { request }, round }) => {
        const selected = request.decisionId === selectedId;
        return (
          <li key={request.decisionId}>
            <button
              type="button"
              aria-current={selected ? "true" : undefined}
              onClick={() => onSelect(request.decisionId)}
              className={`flex w-full flex-col gap-2 rounded-md border border-l-2 p-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none ${
                selected ? "border-l-primary bg-card" : "hover:bg-card"
              }`}
            >
              <span className="flex flex-wrap items-center gap-1 text-xs leading-snug text-muted-foreground">
                <span>{request.agentId ?? "agent"}</span>
                <span aria-hidden="true">·</span>
                <KindBadge label={kindLabel(request.kind, request.reason)} />
                <span aria-hidden="true">·</span>
                <span className={isLongWait(request.requestedAt, now) ? "text-primary" : undefined}>
                  {waitedLabel(request.requestedAt, now)}
                </span>
              </span>
              <span className="line-clamp-2 text-sm">{request.title ?? request.reason}</span>
              {round > 1 && (
                <Badge variant="secondary" className="border-border">
                  Round {round}
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// The gated pattern name renders in mono (UI-SPEC "Kind badge").
function KindBadge({ label }: { label: string }) {
  const at = label.indexOf(" · ");
  return (
    <Badge variant="outline">
      {at < 0 ? (
        label
      ) : (
        <>
          {label.slice(0, at + 3)}
          <span className="font-mono">{label.slice(at + 3)}</span>
        </>
      )}
    </Badge>
  );
}
