import { useState } from "react";
import { decisionHistory, isResumable, type DecisionRecord, type DecisionsState } from "company-core";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { postResume } from "./api";
import { historyBadge, relativeTime, type HistoryTone } from "./view-model";

const TONE: Record<HistoryTone, { variant: "outline" | "default"; className: string }> = {
  success: { variant: "outline", className: "border-[#2A9D8F] text-[#2A9D8F]" },
  destructive: { variant: "default", className: "bg-destructive text-white" },
  neutral: { variant: "outline", className: "" },
  expired: { variant: "outline", className: "border-dashed text-muted-foreground" },
};

const closedAt = (r: DecisionRecord) => r.expired?.expiredAt ?? r.decision?.decidedAt ?? r.request.requestedAt;

// 06-UI-SPEC "History tab": the latest 50 closed decisions from the audit events (CEO-05).
// Read-only apart from Resume task (D-02), which only shows while isResumable holds.
export function HistoryTable({ state, now }: { state: DecisionsState | null; now: number }) {
  const [resuming, setResuming] = useState<string | null>(null);
  // Resumed from here: hidden before the live ceo.task_resume_requested arrives.
  const [resumed, setResumed] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const rows = state ? decisionHistory(state, 50) : [];

  if (state && rows.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyTitle className="text-xl font-semibold">No decisions yet</EmptyTitle>
          <EmptyDescription>Every approval, rejection and expired request will be listed here.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const resume = async (record: DecisionRecord) => {
    const { taskId, agentId } = record.request;
    setError(null);
    setResuming(taskId);
    const result = await postResume(taskId);
    setResuming(null);
    if (result.ok) {
      setResumed((all) => new Set(all).add(taskId));
      toast(`Task resumed. ${agentId ?? "The agent"} will ask again.`);
    } else {
      setError(result.reason);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert>
          <AlertDescription className="text-[#FF8A80]">Resume not sent: {error}. The task is still blocked. Try again.</AlertDescription>
        </Alert>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {["When", "Agent", "Decision", "Action", "Decided by", "Note"].map((h) => (
              <TableHead key={h} className="text-xs font-semibold text-muted-foreground">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {state
            ? rows.map((record) => {
                const when = closedAt(record);
                const badge = historyBadge(record);
                const tone = TONE[badge.tone];
                const title = record.request.title ?? record.request.reason;
                const note = record.decision?.note ?? "";
                const { taskId } = record.request;
                const canResume = isResumable(state, record) && !resumed.has(taskId);
                return (
                  <TableRow key={record.request.decisionId}>
                    <TableCell title={relativeTime(when, now)} className="whitespace-nowrap">
                      {new Date(when).toLocaleString()}
                    </TableCell>
                    <TableCell>{record.request.agentId ?? ""}</TableCell>
                    <TableCell>
                      <span className="block max-w-[320px] truncate" title={title}>
                        {title}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={tone.variant} className={tone.className}>
                          {badge.label}
                        </Badge>
                        {canResume && (
                          <Button variant="outline" size="sm" disabled={resuming === taskId} onClick={() => void resume(record)}>
                            {resuming === taskId && <Spinner aria-hidden="true" data-icon="inline-start" />}
                            Resume task
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{record.decision?.decidedBy ?? ""}</TableCell>
                    <TableCell>
                      <span className="block max-w-[240px] truncate" title={note}>
                        {note}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })
            : [0, 1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
