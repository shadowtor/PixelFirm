CREATE OR REPLACE FUNCTION reject_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events table is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_append_only
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
