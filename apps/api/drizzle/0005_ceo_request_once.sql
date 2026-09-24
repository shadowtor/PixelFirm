-- One approval request per decisionId (06-REVIEW WR-13). The worker picks the
-- id, so without this any worker credential could post a second request with
-- another request's decisionId, and the decision route (which routes to the
-- request row's workerId) could pick either. /events inserts with a bare
-- onConflictDoNothing, so a reused id is a quiet duplicate and the first
-- request keeps it. Phase 4 rows carry no decisionId (NULL never conflicts).
CREATE UNIQUE INDEX IF NOT EXISTS events_ceo_request_once
  ON events ((payload->>'decisionId'))
  WHERE type = 'ceo.approval_requested';
