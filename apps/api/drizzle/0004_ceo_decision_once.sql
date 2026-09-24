-- One CEO decision, one application and one expiry per approval request.
-- Two concurrent decision POSTs both pass the route's "already decided?" read;
-- only the database can serialize them, so this index is the real guard and
-- the loser's insert becomes a no-op the route maps to 409. Keyed on type, so
-- a decision_made and an approval_expired for the same request can coexist
-- (a decision recorded, then lost to a worker restart).
CREATE UNIQUE INDEX IF NOT EXISTS events_ceo_decision_once
  ON events ((payload->>'decisionId'), type)
  WHERE type IN ('ceo.decision_made', 'ceo.approval_expired', 'ceo.decision_applied');
