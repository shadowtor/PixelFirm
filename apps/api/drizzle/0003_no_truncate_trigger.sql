-- 0001_append_only_trigger.sql only covers row-level UPDATE/DELETE.
-- TRUNCATE bypasses row-level triggers entirely and is its own statement-level
-- event — without this, the app's own DB role can still wipe the append-only
-- event log in one statement.
CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation();
