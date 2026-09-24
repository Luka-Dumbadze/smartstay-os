"""SmartStay OS MVP - database layer.

Schema-per-app layout (platform, contact_center, guest_crm, ops, kb, workforce) following the platform research
(research/platform/00 section 3; subcomponents 01-04). Every tenant table has ENABLE + FORCE ROW LEVEL SECURITY keyed on the
transaction-local setting app.space_id; the API connects as smartstay_app (NOSUPERUSER NOBYPASSRLS) and sets that context
per transaction. Each app writes to its own transactional outbox; routes.py relays outboxes to the SSE stream.

Usage:  python db.py init   (drops and recreates the demo schemas, then seeds Chateau Telavi Wine Resort)
"""
import os
import sys
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
import psycopg2.pool

psycopg2.extras.register_uuid()

SPACE_ID = os.environ.get('SMARTSTAY_SPACE_ID', '6f1c2d3e-0000-4000-8000-00000000c7e1')   # Chateau Telavi Wine Resort
APP_DSN = os.environ.get('SMARTSTAY_APP_DSN', 'host=localhost port=5433 dbname=smartstay user=smartstay_app')
ADMIN_DSN = os.environ.get('SMARTSTAY_ADMIN_DSN', 'host=localhost port=5433 dbname=smartstay user=smartstay_admin')

_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 12, APP_DSN)
    return _pool


@contextmanager
def tx(space_id=SPACE_ID):
    """One transaction with transaction-local tenant context (never a session-level SET: pooled connections are reused)."""
    conn = pool().getconn()
    try:
        with conn:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT set_config('app.space_id', %s, true), set_config('TimeZone', 'UTC', true)", (str(space_id),))
                yield cur
    finally:
        pool().putconn(conn)


SCHEMA_SQL = r"""
DROP SCHEMA IF EXISTS workforce, kb, ops, guest_crm, contact_center, platform CASCADE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartstay_owner') THEN CREATE ROLE smartstay_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smartstay_app') THEN CREATE ROLE smartstay_app LOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA platform AUTHORIZATION smartstay_owner;
CREATE SCHEMA contact_center AUTHORIZATION smartstay_owner;
CREATE SCHEMA guest_crm AUTHORIZATION smartstay_owner;
CREATE SCHEMA ops AUTHORIZATION smartstay_owner;
CREATE SCHEMA kb AUTHORIZATION smartstay_owner;
CREATE SCHEMA workforce AUTHORIZATION smartstay_owner;
SET ROLE smartstay_owner;

CREATE FUNCTION platform.tenant() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.space_id', true), '')::uuid $$;

-- ---------------------------------------------------------------- platform (kernel)
CREATE TABLE platform.spaces (
  id uuid PRIMARY KEY, property_code text NOT NULL UNIQUE, name text NOT NULL, region text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Tbilisi', lifecycle text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle IN ('ACTIVE','SUSPENDED','OFFBOARDED')));
CREATE TABLE platform.staff (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('FRONT_DESK_LEAD','ROOM_ATTENDANT','HOUSEKEEPING_SUPERVISOR','SOMMELIER','GENERAL_MANAGER')),
  enabled boolean NOT NULL DEFAULT true, PRIMARY KEY (space_id, id));

-- ---------------------------------------------------------------- App 1: contact center
CREATE TABLE contact_center.conversations (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, guest_profile_id uuid NOT NULL, channel text NOT NULL,
  state text NOT NULL DEFAULT 'AI_ACTIVE' CHECK (state IN ('AI_ACTIVE','OPERATOR_LOCKED','RESOLVED')),
  control_version bigint NOT NULL DEFAULT 1, owner_staff_id uuid, next_seq bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (space_id, id),
  CHECK ((state = 'OPERATOR_LOCKED') = (owner_staff_id IS NOT NULL)));
CREATE TABLE contact_center.messages (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL, seq bigint NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  author_kind text NOT NULL CHECK (author_kind IN ('guest','ai','operator','system')), author_name text NOT NULL,
  body text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]', session_id uuid, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (space_id, id), UNIQUE (space_id, conversation_id, seq),
  FOREIGN KEY (space_id, conversation_id) REFERENCES contact_center.conversations);
CREATE TABLE contact_center.outbox (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), aggregate_id uuid NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz, PRIMARY KEY (space_id, id));

-- ---------------------------------------------------------------- App 2: guest CRM
CREATE TABLE guest_crm.profiles (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, full_name text NOT NULL, locale text NOT NULL,
  phone_e164 text NOT NULL, email text, contact_verified_at timestamptz, loyalty_tier text,
  room_number text, arrival_date date NOT NULL, departure_date date NOT NULL, stay_status text NOT NULL CHECK (stay_status IN ('ARRIVING','IN_HOUSE','DEPARTED')),
  privacy_epoch bigint NOT NULL DEFAULT 1, PRIMARY KEY (space_id, id));
CREATE TABLE guest_crm.preferences (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), profile_id uuid NOT NULL,
  domain text NOT NULL CHECK (domain IN ('room','dining','wine_experience','service')), label text NOT NULL, value text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false, basis text NOT NULL CHECK (basis IN ('contract','explicit_consent')),
  evidence text NOT NULL CHECK (evidence IN ('guest_explicit','staff_confirmed')), status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (space_id, id), FOREIGN KEY (space_id, profile_id) REFERENCES guest_crm.profiles,
  CHECK (NOT sensitive OR basis = 'explicit_consent'));

-- ---------------------------------------------------------------- App 3: operations
CREATE TABLE ops.rooms (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, number text NOT NULL, room_type text NOT NULL, floor text NOT NULL,
  occupancy text NOT NULL CHECK (occupancy IN ('VACANT','OCCUPIED')),
  cleaning_state text NOT NULL CHECK (cleaning_state IN ('DIRTY','CLEANING','CLEAN')), version bigint NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (space_id, id), UNIQUE (space_id, number));
CREATE TABLE ops.tasks (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), conversation_id uuid, session_id uuid,
  category text NOT NULL CHECK (category IN ('housekeeping','food_beverage','maintenance','front_desk')),
  title text NOT NULL, detail text NOT NULL, room_number text, quantity integer,
  priority text NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','CLAIMED','IN_PROGRESS','COMPLETED','CANCELLED')),
  state_version bigint NOT NULL DEFAULT 1, assignee_staff_id uuid, assigned_team text NOT NULL,
  requires_staff_confirmation boolean NOT NULL DEFAULT false, due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
  PRIMARY KEY (space_id, id), FOREIGN KEY (space_id, assignee_staff_id) REFERENCES platform.staff);
CREATE TABLE ops.attestations (
  space_id uuid NOT NULL, task_id uuid NOT NULL, staff_id uuid NOT NULL, statement text NOT NULL
    CHECK (statement = 'I personally completed and checked this hotel service.'),
  evidence_ref text NOT NULL, attested_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, task_id),
  FOREIGN KEY (space_id, task_id) REFERENCES ops.tasks, FOREIGN KEY (space_id, staff_id) REFERENCES platform.staff);
CREATE TABLE ops.outbox (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), aggregate_id uuid NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz, PRIMARY KEY (space_id, id));

-- ---------------------------------------------------------------- App 4: knowledge (approved, versioned, valid-in-time)
CREATE TABLE kb.documents (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('WINE_LIST','POLICY')), version integer NOT NULL,
  state text NOT NULL CHECK (state IN ('DRAFT','APPROVED_ACTIVE','SUPERSEDED','ARCHIVED')),
  approved_by text, approved_at timestamptz, valid_during tstzrange NOT NULL, PRIMARY KEY (space_id, id));
-- convert_to() is only STABLE; the database is UTF8 (initdb -E UTF8), so the wrapper is safely immutable here.
CREATE FUNCTION kb.sha256_hex(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;
CREATE TABLE kb.chunks (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), document_id uuid NOT NULL, content text NOT NULL,
  structured jsonb NOT NULL DEFAULT '{}',
  content_sha256 text GENERATED ALWAYS AS (kb.sha256_hex(content)) STORED,
  search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  PRIMARY KEY (space_id, id), FOREIGN KEY (space_id, document_id) REFERENCES kb.documents);
CREATE INDEX chunks_search ON kb.chunks USING gin (search_tsv);
-- Guest-audience retrieval: approved + currently valid only. Lexical full-text ranking (the explicit lexical deployment mode;
-- a pgvector dense leg can be added where the extension is installed).
CREATE FUNCTION kb.search(p_query text, p_limit integer DEFAULT 3) RETURNS TABLE (
  chunk_id uuid, document_id uuid, document_title text, document_version integer, approved_by text, approved_at timestamptz,
  valid_until timestamptz, content text, structured jsonb, content_sha256 text, rank real)
LANGUAGE sql STABLE AS $$
  SELECT c.id, d.id, d.title, d.version, d.approved_by, d.approved_at, upper(d.valid_during), c.content, c.structured, c.content_sha256,
         ts_rank(c.search_tsv, q) FROM kb.chunks c JOIN kb.documents d ON d.space_id = c.space_id AND d.id = c.document_id,
         to_tsquery('simple', array_to_string(ARRAY(SELECT lexeme || ':*' FROM unnest(to_tsvector('simple', p_query))), ' | ')) q
  WHERE d.state = 'APPROVED_ACTIVE' AND d.valid_during @> now() AND c.search_tsv @@ q
  ORDER BY 11 DESC, c.id LIMIT p_limit $$;

-- ---------------------------------------------------------------- App 5: AI team
CREATE TABLE workforce.agents (
  space_id uuid NOT NULL REFERENCES platform.spaces, id uuid NOT NULL, key text NOT NULL, display_name text NOT NULL, persona text NOT NULL,
  model_route text NOT NULL CHECK (model_route IN ('FAST','FRONTIER_HIGH')), enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (space_id, id), UNIQUE (space_id, key));
CREATE TABLE workforce.sessions (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL, trigger_message_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'RUNNING' CHECK (state IN ('RUNNING','COMPLETED','HANDED_TO_HUMAN','FAILED')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz, reply_message_id uuid, PRIMARY KEY (space_id, id));
CREATE TABLE workforce.steps (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), session_id uuid NOT NULL, seq integer NOT NULL, agent_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('THOUGHT','TOOL_CALL','TOOL_RESULT','HANDOFF','GUARDRAIL','DECISION','REPLY')),
  title text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (space_id, id), UNIQUE (space_id, session_id, seq));
CREATE TABLE workforce.outbox (
  space_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(), aggregate_id uuid NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), published_at timestamptz, PRIMARY KEY (space_id, id));

-- ---------------------------------------------------------------- invariants enforced in the database
-- Messages are immutable (App 1); only the owner role (used by the demo reset) may delete them.
CREATE FUNCTION contact_center.immutable_message() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = 'smartstay_owner' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'messages are immutable';
END $$;
CREATE TRIGGER message_immutable BEFORE UPDATE OR DELETE ON contact_center.messages FOR EACH ROW EXECUTE FUNCTION contact_center.immutable_message();
-- Task state machine (App 3): legal transitions, exact version increments, completion only with a human attestation.
CREATE FUNCTION ops.guard_task() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'QUEUED' AND NEW.status IN ('CLAIMED','CANCELLED')) OR (OLD.status = 'CLAIMED' AND NEW.status IN ('IN_PROGRESS','QUEUED','CANCELLED'))
         OR (OLD.status = 'IN_PROGRESS' AND NEW.status IN ('COMPLETED','CANCELLED'))) THEN
      RAISE EXCEPTION 'illegal task transition % -> %', OLD.status, NEW.status; END IF;
    IF NEW.state_version <> OLD.state_version + 1 THEN RAISE EXCEPTION 'state version must increment'; END IF;
    IF NEW.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM ops.attestations a WHERE a.space_id = NEW.space_id AND a.task_id = NEW.id) THEN
      RAISE EXCEPTION 'completion requires a human attestation'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER task_guard BEFORE UPDATE ON ops.tasks FOR EACH ROW EXECUTE FUNCTION ops.guard_task();
CREATE FUNCTION ops.guard_room() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cleaning_state IS DISTINCT FROM OLD.cleaning_state THEN
    IF NOT ((OLD.cleaning_state = 'DIRTY' AND NEW.cleaning_state = 'CLEANING') OR (OLD.cleaning_state = 'CLEANING' AND NEW.cleaning_state = 'CLEAN')
         OR (OLD.cleaning_state = 'CLEAN' AND NEW.cleaning_state = 'DIRTY')) THEN
      RAISE EXCEPTION 'illegal room transition % -> %', OLD.cleaning_state, NEW.cleaning_state; END IF;
    NEW.version := OLD.version + 1; NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER room_guard BEFORE UPDATE ON ops.rooms FOR EACH ROW EXECUTE FUNCTION ops.guard_room();

-- ---------------------------------------------------------------- tenant isolation on every table
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('platform','contact_center','guest_crm','ops','kb','workforce') LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);
    EXECUTE format('CREATE POLICY tenant_scope ON %I.%I USING (%s = platform.tenant()) WITH CHECK (%s = platform.tenant())', t.schemaname, t.tablename,
      CASE WHEN t.tablename = 'spaces' THEN 'id' ELSE 'space_id' END, CASE WHEN t.tablename = 'spaces' THEN 'id' ELSE 'space_id' END);
  END LOOP; END $$;

-- ---------------------------------------------------------------- demo seed (SECURITY DEFINER; runs under the tenant's own context)
CREATE FUNCTION platform.seed_demo(p_space uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE conv uuid := '6f1c2d3e-0000-4000-8000-0000000c0de1'; guest uuid := '6f1c2d3e-0000-4000-8000-00000000a111';
  wine_doc uuid := '6f1c2d3e-0000-4000-8000-0000000d0c01'; pol_doc uuid := '6f1c2d3e-0000-4000-8000-0000000d0c02';
BEGIN
  PERFORM set_config('app.space_id', p_space::text, true);
  INSERT INTO platform.spaces VALUES (p_space, 'CHATEAU-TELAVI', 'Chateau Telavi Wine Resort', 'Kakheti, Georgia', 'Asia/Tbilisi', 'ACTIVE');
  INSERT INTO platform.staff VALUES
    (p_space, '6f1c2d3e-0000-4000-8000-00000000b001', 'Levan Beridze', 'FRONT_DESK_LEAD', true),
    (p_space, '6f1c2d3e-0000-4000-8000-00000000b002', 'Tamar Gelashvili', 'ROOM_ATTENDANT', true),
    (p_space, '6f1c2d3e-0000-4000-8000-00000000b003', 'Ana Jorjadze', 'HOUSEKEEPING_SUPERVISOR', true),
    (p_space, '6f1c2d3e-0000-4000-8000-00000000b004', 'Giorgi Maisuradze', 'SOMMELIER', true);
  INSERT INTO ops.rooms (space_id, id, number, room_type, floor, occupancy, cleaning_state) VALUES
    (p_space, '6f1c2d3e-0000-4000-8000-000000000012', '12', 'Deluxe', 'Garden wing', 'VACANT', 'DIRTY'),
    (p_space, '6f1c2d3e-0000-4000-8000-000000000101', '101', 'Superior', 'Vineyard wing', 'OCCUPIED', 'CLEAN'),
    (p_space, '6f1c2d3e-0000-4000-8000-000000000102', '102', 'Superior', 'Vineyard wing', 'VACANT', 'CLEAN');
  INSERT INTO guest_crm.profiles VALUES (p_space, guest, 'Nino Kakhetelashvili', 'en', '+995555123456', 'nino.k@example.ge', now() - interval '3 days',
    'Gold', '12', current_date, current_date + 3, 'ARRIVING', 1);
  INSERT INTO guest_crm.preferences (space_id, profile_id, domain, label, value, sensitive, basis, evidence) VALUES
    (p_space, guest, 'wine_experience', 'Wine style', 'Dry Kakhetian reds - Saperavi', false, 'contract', 'guest_explicit'),
    (p_space, guest, 'wine_experience', 'Tour interest', 'Qvevri cellar tour', false, 'contract', 'guest_explicit'),
    (p_space, guest, 'room', 'Pillow type', 'Firm', false, 'contract', 'staff_confirmed'),
    (p_space, guest, 'dining', 'Allergen avoidance', 'Tree nuts', true, 'explicit_consent', 'guest_explicit');
  INSERT INTO kb.documents VALUES
    (p_space, wine_doc, 'Cellar & Wine List', 'WINE_LIST', 3, 'APPROVED_ACTIVE', 'Ana Jorjadze (GM delegate)', now() - interval '2 days', tstzrange(now() - interval '2 days', now() + interval '90 days')),
    (p_space, pol_doc, 'Guest Services Policy', 'POLICY', 5, 'APPROVED_ACTIVE', 'Levan Beridze', now() - interval '10 days', tstzrange(now() - interval '10 days', now() + interval '180 days'));
  INSERT INTO kb.chunks (space_id, document_id, content, structured) VALUES
    (p_space, wine_doc, 'Saperavi 2022 Estate Reserve | qvevri-aged dry red | vintage 2022 | 90 GEL per 750ml bottle | allergens: sulphites | contains no tree nuts',
      '{"item":"Saperavi 2022 Estate Reserve","vintage":2022,"price_gel":90,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true,"notes":"Qvevri-aged dry red from Kakheti"}'),
    (p_space, wine_doc, 'Rkatsiteli 2023 Amber | skin-contact white | vintage 2023 | 65 GEL per 750ml bottle | allergens: sulphites',
      '{"item":"Rkatsiteli 2023 Amber","vintage":2023,"price_gel":65,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true}'),
    (p_space, wine_doc, 'Kindzmarauli 2021 | semi-sweet red | vintage 2021 | 70 GEL per 750ml bottle | allergens: sulphites',
      '{"item":"Kindzmarauli 2021","vintage":2021,"price_gel":70,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true}'),
    (p_space, pol_doc, 'Check-out is at 12:00. Late checkout until 14:00 is free for Gold members, subject to availability confirmed by the front desk.',
      '{"topic":"checkout"}'),
    (p_space, pol_doc, 'Wine tastings and cellar tours can be cancelled free of charge up to 24 hours before the start time.', '{"topic":"tasting_cancellation"}'),
    (p_space, pol_doc, 'Extra towels, pillows and bathrobes are complimentary and delivered by housekeeping within 30 minutes.', '{"topic":"amenities"}');
  INSERT INTO workforce.agents (space_id, id, key, display_name, persona, model_route) VALUES
    (p_space, gen_random_uuid(), 'mia', 'Mia', 'Front-Desk Concierge', 'FRONTIER_HIGH'),
    (p_space, gen_random_uuid(), 'sommelier', 'Sommelier', 'Kakheti Cellar Specialist', 'FRONTIER_HIGH'),
    (p_space, gen_random_uuid(), 'ops', 'Operations Coordinator', 'Housekeeping & F&B dispatch', 'FAST');
  INSERT INTO contact_center.conversations (space_id, id, guest_profile_id, channel) VALUES (p_space, conv, guest, 'whatsapp');
  INSERT INTO contact_center.messages (space_id, conversation_id, seq, direction, author_kind, author_name, body) VALUES
    (p_space, conv, 1, 'outbound', 'system', 'Chateau Telavi', 'Welcome to Chateau Telavi Wine Resort, Nino! Your Deluxe room 12 is being prepared for your arrival today.');
  UPDATE contact_center.conversations SET next_seq = 2 WHERE space_id = p_space AND id = conv;
END $$;
CREATE FUNCTION platform.demo_reset(p_space uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM set_config('app.space_id', p_space::text, true);
  DELETE FROM workforce.outbox; DELETE FROM workforce.steps; DELETE FROM workforce.sessions; DELETE FROM workforce.agents;
  DELETE FROM kb.chunks; DELETE FROM kb.documents;
  DELETE FROM ops.outbox; DELETE FROM ops.attestations; DELETE FROM ops.tasks; DELETE FROM ops.rooms;
  DELETE FROM guest_crm.preferences; DELETE FROM guest_crm.profiles;
  DELETE FROM contact_center.outbox; DELETE FROM contact_center.messages; DELETE FROM contact_center.conversations;
  DELETE FROM platform.staff; DELETE FROM platform.spaces;
  PERFORM platform.seed_demo(p_space);
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- runtime role: DML only, no DDL, no BYPASSRLS, no message edits
GRANT USAGE ON SCHEMA platform, contact_center, guest_crm, ops, kb, workforce TO smartstay_app;
GRANT SELECT ON ALL TABLES IN SCHEMA platform, guest_crm, kb TO smartstay_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA contact_center, ops, workforce TO smartstay_app;
REVOKE UPDATE ON contact_center.messages FROM smartstay_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform, kb TO smartstay_app;
"""


def init(reset=True):
    conn = psycopg2.connect(ADMIN_DSN)
    conn.autocommit = False
    with conn, conn.cursor() as cur:
        cur.execute(SCHEMA_SQL)
        cur.execute("SELECT set_config('app.space_id', %s, true)", (SPACE_ID,))
        cur.execute('SELECT platform.seed_demo(%s)', (SPACE_ID,))
        cur.execute("SELECT count(*) FROM pg_available_extensions WHERE name = 'vector'")
        has_vector = cur.fetchone()[0] > 0
    conn.close()
    print(f"[db] schemas created, RLS forced on all tables, Chateau Telavi seeded (space {SPACE_ID}); "
          f"pgvector {'available' if has_vector else 'not installed - knowledge search runs in lexical mode'}")


def reset_demo():
    with tx() as cur:
        cur.execute('SELECT platform.demo_reset(%s)', (SPACE_ID,))


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'init':
        init()
    else:
        print(__doc__)
