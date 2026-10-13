-- Private application schema: accessed only by the server database connection.
-- Safe to run repeatedly; never drops existing business data.
CREATE SCHEMA IF NOT EXISTS doards;
REVOKE ALL ON SCHEMA doards FROM PUBLIC;
CREATE TABLE IF NOT EXISTS doards.records (
  kind text NOT NULL, id text NOT NULL, value jsonb NOT NULL,
  PRIMARY KEY(kind,id), CHECK(value->>'id' = id)
);
CREATE TABLE IF NOT EXISTS doards.users (
  id text PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL,
  role text NOT NULL, "customerId" text, password text NOT NULL,
  access text NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS doards.sessions (
  token text PRIMARY KEY, "userId" text NOT NULL REFERENCES doards.users(id), expires bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON doards.sessions(expires);
CREATE TABLE IF NOT EXISTS doards.audit (
  seq bigint PRIMARY KEY, id text UNIQUE NOT NULL, "userId" text NOT NULL,
  time text NOT NULL, action text NOT NULL, kind text NOT NULL, "recordId" text NOT NULL,
  old text, new text, previous text NOT NULL, hash text NOT NULL
);
CREATE TABLE IF NOT EXISTS doards.rate_limits (
  key text PRIMARY KEY, count integer NOT NULL, expires bigint NOT NULL
);
ALTER TABLE doards.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE doards.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE doards.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE doards.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE doards.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA doards FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON SCHEMA doards FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA doards FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON SCHEMA doards FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA doards FROM authenticated;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION doards.audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only audit'; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='doards_audit_immutable' AND tgrelid='doards.audit'::regclass) THEN
    CREATE TRIGGER doards_audit_immutable BEFORE UPDATE OR DELETE ON doards.audit
      FOR EACH ROW EXECUTE FUNCTION doards.audit_immutable();
  END IF;
END $$;
