// The /ceo dashboard root (D-08). main.tsx loads this module only through a dynamic import,
// so this file, ceo.css (the only Tailwind entry) and every shadcn/Kibo component ship in a
// lazy chunk the office route never requests.
import "./ceo.css";
import { useEffect, useRef, useState } from "react";
import { applyDecisionEvent, pendingQueue, type DecisionsState } from "company-core";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Status, StatusIndicator, StatusLabel } from "@/components/kibo-ui/status";
import { fetchMe, type Me } from "./api";
import { connectCeoFeed, type FeedStatus } from "./ceo-feed";
import { DetailPane } from "./DetailPane";
import { QuestionsForm } from "./QuestionsForm";
import { QueueList } from "./QueueList";
import { documentTitle, nextSelection, type Selections } from "./view-model";

const STATUS_KIND = { Live: "online", Reconnecting: "degraded", Offline: "offline" } as const;

export function CeoApp() {
  const [attempt, setAttempt] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const [decisions, setDecisions] = useState<DecisionsState | null>(null);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("Reconnecting");
  const [feedFailed, setFeedFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false); // < 768px: the queue is the page until an item is picked
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  // AskUserQuestion selections per decisionId, so switching queue items keeps them. 06-10's
  // "Send answers" reads buildAnswers/allAnswered over the selected item's entry.
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, Selections>>({});

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let feed: { close(): void } | undefined;
    void fetchMe().then((result) => {
      if (cancelled) return;
      setMe(result);
      if (!result.ok) return;
      feed = connectCeoFeed({
        onSnapshot: (state) => setDecisions(state),
        onEvent: (event) => {
          setDecisions((prev) => (prev ? applyDecisionEvent(prev, event) : prev));
          if (event.type === "ceo.approval_requested" && event.payload.decisionId) {
            const agentName = event.sourceAgentId ?? "an agent";
            setAnnouncement(`New decision from ${agentName}: ${event.payload.title ?? event.payload.reason}`);
          }
        },
        onStatus: (status) => {
          setFeedStatus(status);
          if (status !== "Live") setFeedFailed(true);
        },
      });
    });
    return () => {
      cancelled = true;
      feed?.close();
    };
  }, [attempt]);

  const retry = () => {
    setMe(null);
    setDecisions(null);
    setFeedFailed(false);
    setFeedStatus("Reconnecting");
    setAttempt((a) => a + 1);
  };

  const pending = decisions ? pendingQueue(decisions) : [];
  const count = pending.length;
  const ids = pending.map((item) => item.record.request.decisionId);
  const idsKey = ids.join(",");

  useEffect(() => {
    document.title = documentTitle(count);
  }, [count]);

  // First item auto-selected; when the selected one leaves, nextSelection decides; arrivals never steal it.
  // Keyed on idsKey (the ids joined), so a snapshot with the same queue does not re-run it.
  const previousIds = useRef<string[]>([]);
  useEffect(() => {
    const previous = previousIds.current;
    previousIds.current = ids;
    setSelectedId((current) => {
      if (current && ids.includes(current)) return current;
      if (current) return nextSelection(previous, current, ids) ?? ids[0] ?? null;
      return ids[0] ?? null;
    });
  }, [idsKey]);

  const selected = pending.find((item) => item.record.request.decisionId === selectedId);

  if (me && !me.ok && (me.status === 401 || me.status === 403)) {
    return (
      <Page>
        <Alert className="m-4 w-auto">
          <AlertDescription className="text-foreground">
            You're not signed in as the CEO. This page is behind Cloudflare Access. Reload to sign in again.
          </AlertDescription>
        </Alert>
      </Page>
    );
  }

  if (me && !me.ok) {
    return (
      <Page>
        <LoadError reason={me.reason} onRetry={retry} />
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl leading-tight font-semibold">CEO desk</h1>
          {count > 0 && <Badge data-testid="pending-badge">{count}</Badge>}
        </div>
        {me?.ok && (
          <div className="flex min-w-0 items-center gap-4">
            <Status status={STATUS_KIND[feedStatus]}>
              <StatusIndicator />
              <StatusLabel>{feedStatus}</StatusLabel>
            </Status>
            <span className="truncate text-xs text-muted-foreground">{me.email}</span>
          </div>
        )}
      </header>

      {me?.ok && me.devBypass && (
        <Alert className="mx-4 mt-4 w-auto">
          <AlertDescription className="text-foreground">
            Dev auth bypass is on. Decisions are recorded as {me.email}.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="pending" className="flex min-h-0 flex-1 flex-col px-4 pt-4">
        <TabsList>
          <TabsTrigger value="pending">Pending ({count})</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="flex min-h-0 flex-1">
          {!decisions && feedFailed ? (
            <LoadError reason="the live feed disconnected" onRetry={retry} />
          ) : decisions && count === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyTitle className="text-xl font-semibold">No decisions waiting</EmptyTitle>
                <EmptyDescription>
                  When an agent needs your call, it walks to your office and the request appears here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 gap-8">
              <section
                aria-label="Pending queue"
                className={`${showDetail ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col gap-2 overflow-y-auto pb-4 md:w-[300px] lg:w-[360px]`}
              >
                {decisions ? (
                  <QueueList
                    items={pending}
                    selectedId={selected ? selectedId : null}
                    now={now}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setShowDetail(true);
                    }}
                  />
                ) : (
                  [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)
                )}
              </section>
              <section
                aria-label="Decision detail"
                className={`${showDetail ? "block" : "hidden md:block"} min-w-0 flex-1 overflow-y-auto pb-6`}
              >
                <Button variant="link" className="mb-4 px-0 text-foreground underline md:hidden" onClick={() => setShowDetail(false)}>
                  Back to queue
                </Button>
                {selected && (
                  <DetailPane
                    key={selected.record.request.decisionId}
                    item={selected}
                    now={now}
                    questions={
                      selected.record.request.kind === "clarifying_question" && selected.record.request.questions?.length ? (
                        <QuestionsForm
                          decisionId={selected.record.request.decisionId}
                          questions={selected.record.request.questions}
                          selections={answerDrafts[selected.record.request.decisionId] ?? {}}
                          onChange={(next) => setAnswerDrafts((all) => ({ ...all, [selected.record.request.decisionId]: next }))}
                        />
                      ) : undefined
                    }
                  />
                )}
                {!decisions && (
                  <div className="flex max-w-[880px] flex-col gap-6">
                    <Skeleton className="h-6 w-2/3" />
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </TabsContent>
      </Tabs>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen flex-col overflow-hidden bg-background font-sans text-foreground">{children}</div>;
}

function LoadError({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <Alert className="m-4 flex w-auto items-center justify-between gap-4">
      <AlertDescription className="text-[#FF8A80]">
        Couldn't load decisions: {reason}. Check the API is running, then retry.
      </AlertDescription>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}
