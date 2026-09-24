-- =====================================================================================================================
-- Smartstay 3.0 — Supabase master schema (PostgreSQL 15/16/17 + pgvector)                        db/supabase_master_schema.sql
--
-- Paste into Supabase Dashboard → SQL Editor and run once on a NEW / DEMO project. The script:
--   * enables vector, btree_gist, pgcrypto in the `extensions` schema;
--   * creates the six app schemas + a thin platform kernel + analytics views:
--       platform · contact_center · guest_crm · ops · kb · ai_team · analytics;
--   * enforces tenant isolation with FORCE ROW LEVEL SECURITY keyed on staff membership (auth.uid());
--   * exposes writes ONLY through RPC functions (authenticated staff) or the service_role key (server routes);
--   * adds the live tables to the `supabase_realtime` publication;
--   * seeds the Kakheti demo property: Chateau Telavi Wine Resort, Room 12, Saperavi 2022 (90 GEL), guest Nino.
--
-- RE-RUN WARNING: the first block DROPS the seven Smartstay schemas (CASCADE) so the script is repeatable on a demo
-- project. Never run it against a project that holds real guest data.
--
-- After running:  Dashboard → Project Settings → Data API → "Exposed schemas": add
--   platform, contact_center, guest_crm, ops, kb, ai_team, analytics
-- Embeddings are NULL in the seed; run the blueprint's backfill (research/nextjs_supabase_telegram_blueprint.md §6.3).
-- Lexical search (kb.search_hybrid) works immediately; vector ranking joins in as embeddings appear.
-- =====================================================================================================================

begin;

-- ---------------------------------------------------------------------------------------------------------- 0. reset
drop schema if exists analytics, ai_team, kb, ops, guest_crm, contact_center, platform cascade;

-- ---------------------------------------------------------------------------------------------------------- 1. extensions
create schema if not exists extensions;
create extension if not exists vector     with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto   with schema extensions;

create schema platform;
create schema contact_center;
create schema guest_crm;
create schema ops;
create schema kb;
create schema ai_team;
create schema analytics;

-- =====================================================================================================================
-- 2. PLATFORM KERNEL — the only tenant authority, staff identity and membership
-- =====================================================================================================================
create table platform.spaces (
  id            uuid primary key default gen_random_uuid(),
  property_code text not null unique check (property_code = upper(property_code)),
  name          text not null,
  region        text not null,
  timezone      text not null default 'Asia/Tbilisi',
  lifecycle     text not null default 'ACTIVE' check (lifecycle in ('ACTIVE','SUSPENDED','OFFBOARDED')),
  created_at    timestamptz not null default now()
);

-- Staff are members of exactly one property per row; user_id links a Supabase Auth user once they sign up.
create table platform.staff (
  space_id     uuid not null references platform.spaces(id) on delete restrict,
  id           uuid not null default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null,
  role         text not null check (role in ('FRONT_DESK_LEAD','ROOM_ATTENDANT','HOUSEKEEPING_SUPERVISOR','SOMMELIER','GENERAL_MANAGER')),
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (space_id, id),
  unique (id),
  unique (space_id, user_id)
);

-- Set of properties the calling Auth user may see. Evaluated once per statement when used as
-- `space_id in (select platform.my_space_ids())` (Supabase RLS performance guidance: wrap auth calls in a select).
create function platform.my_space_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.space_id from platform.staff s
  join platform.spaces p on p.id = s.space_id and p.lifecycle = 'ACTIVE'
  where s.user_id = (select auth.uid()) and s.enabled
$$;

-- The calling user's staff row for one property (raises if not a member). Used by every staff-facing RPC.
create function platform.require_staff(p_space_id uuid) returns platform.staff
language plpgsql stable security definer set search_path = '' as $$
declare v platform.staff;
begin
  select s.* into v from platform.staff s
  join platform.spaces p on p.id = s.space_id and p.lifecycle = 'ACTIVE'
  where s.space_id = p_space_id and s.user_id = (select auth.uid()) and s.enabled;
  if not found then raise exception 'not a staff member of this property' using errcode = '42501'; end if;
  return v;
end $$;

create function platform.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================================================================
-- 3. GUEST CRM (App 2) — profiles, channel identities, stays, preferences, deep-link binding tokens
-- =====================================================================================================================
create table guest_crm.profiles (
  space_id            uuid not null references platform.spaces(id),
  id                  uuid not null default gen_random_uuid(),
  full_name           text not null,
  locale              text not null default 'en' check (locale in ('ka','ru','en')),
  phone_e164          text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  email               text,
  contact_verified_at timestamptz,
  loyalty_tier        text,
  provisional         boolean not null default false,   -- created from an unknown Telegram user, pending staff review
  privacy_epoch       bigint not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (space_id, id),
  unique (id)
);

create table guest_crm.identities (
  space_id    uuid not null,
  id          uuid not null default gen_random_uuid(),
  profile_id  uuid not null,
  channel     text not null check (channel in ('telegram','whatsapp','email','web')),
  external_id text not null,                 -- telegram: from.id (user id, stable); whatsapp: wa_id
  username    text,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (space_id, id),
  unique (space_id, channel, external_id),
  foreign key (space_id, profile_id) references guest_crm.profiles(space_id, id) on delete cascade
);

create table guest_crm.stays (
  space_id       uuid not null,
  id             uuid not null default gen_random_uuid(),
  profile_id     uuid not null,
  room_id        uuid not null,
  arrival_date   date not null,
  departure_date date not null check (departure_date > arrival_date),
  status         text not null default 'BOOKED' check (status in ('BOOKED','IN_HOUSE','DEPARTED','CANCELLED')),
  source         text not null default 'direct',
  primary key (space_id, id),
  unique (id),
  foreign key (space_id, profile_id) references guest_crm.profiles(space_id, id) on delete cascade,
  -- btree_gist: one active stay per room per night (no double booking inside Smartstay's own ledger)
  constraint stays_no_overlap exclude using gist (
    space_id with =, room_id with =, daterange(arrival_date, departure_date, '[)') with &&
  ) where (status <> 'CANCELLED')
);

create table guest_crm.preferences (
  space_id   uuid not null,
  id         uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  domain     text not null check (domain in ('room','dining','wine_experience','service')),
  label      text not null,
  value      text not null,
  sensitive  boolean not null default false,                   -- e.g. allergens (health data)
  basis      text not null check (basis in ('contract','explicit_consent')),
  evidence   text not null check (evidence in ('guest_explicit','staff_confirmed')),
  consent_ref text,                                           -- consent record for sensitive facts
  status     text not null default 'active' check (status in ('active','withdrawn')),
  created_at timestamptz not null default now(),
  primary key (space_id, id),
  foreign key (space_id, profile_id) references guest_crm.profiles(space_id, id) on delete cascade,
  check (not sensitive or (basis = 'explicit_consent' and consent_ref is not null))
);

-- One-time tokens for Telegram deep links: https://t.me/<bot>?start=<token> binds a Telegram user to a stay.
create table guest_crm.link_tokens (
  space_id    uuid not null,
  token       text not null default encode(extensions.gen_random_bytes(12), 'hex')
              check (token ~ '^[A-Za-z0-9_-]{1,64}$'),
  profile_id  uuid not null,
  stay_id     uuid,
  expires_at  timestamptz not null default now() + interval '30 days',
  redeemed_at timestamptz,
  primary key (token),
  foreign key (space_id, profile_id) references guest_crm.profiles(space_id, id) on delete cascade
);

create trigger profiles_touch before update on guest_crm.profiles for each row execute function platform.touch_updated_at();

-- =====================================================================================================================
-- 4. OPERATIONS (App 3) — rooms, turnover, service tasks, human attestation
-- =====================================================================================================================
create table ops.rooms (
  space_id       uuid not null references platform.spaces(id),
  id             uuid not null default gen_random_uuid(),
  number         text not null,
  room_type      text not null,
  floor          text not null,
  cleaning_state text not null default 'DIRTY' check (cleaning_state in ('DIRTY','CLEANING','CLEAN')),
  version        bigint not null default 1,
  updated_at     timestamptz not null default now(),
  primary key (space_id, id),
  unique (id),
  unique (space_id, number)
);

alter table guest_crm.stays add foreign key (space_id, room_id) references ops.rooms(space_id, id);

create table ops.room_events (
  space_id   uuid not null,
  id         bigint generated always as identity primary key,
  room_id    uuid not null,
  from_state text not null,
  to_state   text not null,
  staff_id   uuid,
  at         timestamptz not null default now(),
  foreign key (space_id, room_id) references ops.rooms(space_id, id) on delete cascade
);

create table ops.tasks (
  space_id        uuid not null references platform.spaces(id),
  id              uuid not null default gen_random_uuid(),
  conversation_id uuid,
  session_id      uuid,
  category        text not null check (category in ('housekeeping','food_beverage','maintenance','front_desk')),
  title           text not null,
  detail          text not null default '',
  room_id         uuid,
  quantity        integer check (quantity is null or quantity > 0),
  priority        text not null default 'ROUTINE' check (priority in ('ROUTINE','URGENT')),
  status          text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','IN_PROGRESS','COMPLETED','CANCELLED')),
  state_version   bigint not null default 1,
  assignee_id     uuid,
  requires_staff_confirmation boolean not null default false,
  due_at          timestamptz not null default now() + interval '30 minutes',
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  primary key (space_id, id),
  unique (id),
  foreign key (space_id, assignee_id) references platform.staff(space_id, id),
  foreign key (space_id, room_id) references ops.rooms(space_id, id)
);

create table ops.attestations (
  space_id     uuid not null,
  task_id      uuid not null,
  staff_id     uuid not null,
  statement    text not null check (statement = 'I personally completed and checked this hotel service.'),
  evidence_ref text,
  attested_at  timestamptz not null default now(),
  primary key (space_id, task_id),
  foreign key (space_id, task_id) references ops.tasks(space_id, id) on delete cascade,
  foreign key (space_id, staff_id) references platform.staff(space_id, id)
);

-- Task state machine: legal transitions, +1 versioning, completion only with a human attestation.
create function ops.guard_task() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'QUEUED'      and new.status in ('CLAIMED','CANCELLED'))
         or (old.status = 'CLAIMED'     and new.status in ('IN_PROGRESS','QUEUED','CANCELLED'))
         or (old.status = 'IN_PROGRESS' and new.status in ('COMPLETED','CANCELLED'))) then
      raise exception 'illegal task transition % -> %', old.status, new.status;
    end if;
    if new.state_version <> old.state_version + 1 then raise exception 'state_version must increment by 1'; end if;
    if new.status = 'COMPLETED' then
      if not exists (select 1 from ops.attestations a where a.space_id = new.space_id and a.task_id = new.id) then
        raise exception 'completion requires a human attestation';
      end if;
      new.completed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger task_guard before update on ops.tasks for each row execute function ops.guard_task();

create function ops.guard_room() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.cleaning_state is distinct from old.cleaning_state then
    if not ((old.cleaning_state = 'DIRTY' and new.cleaning_state = 'CLEANING')
         or (old.cleaning_state = 'CLEANING' and new.cleaning_state = 'CLEAN')
         or (old.cleaning_state = 'CLEAN' and new.cleaning_state = 'DIRTY')) then
      raise exception 'illegal room transition % -> %', old.cleaning_state, new.cleaning_state;
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger room_guard before update on ops.rooms for each row execute function ops.guard_room();

-- =====================================================================================================================
-- 5. CONTACT CENTER (App 1) — channels, conversations, chapters, immutable messages, webhook idempotency ledger
-- =====================================================================================================================
create table contact_center.channels (
  space_id     uuid not null references platform.spaces(id),
  id           uuid not null default gen_random_uuid(),
  kind         text not null check (kind in ('telegram','whatsapp','web')),
  display_name text not null,
  bot_username text,                      -- telegram: @username without the @ (no secrets in the database)
  enabled      boolean not null default true,
  primary key (space_id, id),
  unique (id)
);

create table contact_center.conversations (
  space_id         uuid not null,
  id               uuid not null default gen_random_uuid(),
  channel_id       uuid not null,
  external_chat_id text not null,             -- telegram chat.id (as text: may exceed int32)
  profile_id       uuid,
  state            text not null default 'AI_ACTIVE' check (state in ('AI_ACTIVE','OPERATOR_LOCKED','RESOLVED')),
  owner_staff_id   uuid,
  control_version  bigint not null default 1,
  next_seq         bigint not null default 1,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  primary key (space_id, id),
  unique (id),
  unique (channel_id, external_chat_id),
  foreign key (space_id, channel_id) references contact_center.channels(space_id, id),
  foreign key (space_id, profile_id) references guest_crm.profiles(space_id, id) on delete set null (profile_id),
  foreign key (space_id, owner_staff_id) references platform.staff(space_id, id),
  check ((state = 'OPERATOR_LOCKED') = (owner_staff_id is not null))
);

-- Semantic chapters group a conversation by stay (one open chapter per conversation).
create table contact_center.chapters (
  space_id        uuid not null,
  id              uuid not null default gen_random_uuid(),
  conversation_id uuid not null,
  number          integer not null,
  title           text not null,
  stay_id         uuid,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  primary key (space_id, id),
  unique (id),
  unique (conversation_id, number),
  foreign key (space_id, conversation_id) references contact_center.conversations(space_id, id) on delete cascade
);
create unique index chapters_one_open on contact_center.chapters (conversation_id) where closed_at is null;

create table contact_center.messages (
  space_id            uuid not null,
  id                  uuid not null default gen_random_uuid(),
  conversation_id     uuid not null,
  chapter_id          uuid,
  seq                 bigint not null,
  direction           text not null check (direction in ('inbound','outbound','internal')),
  author_kind         text not null check (author_kind in ('guest','ai','operator','system')),
  author_name         text not null,
  body                text not null check (length(body) <= 4096),   -- Telegram sendMessage text limit
  evidence            jsonb not null default '[]',
  session_id          uuid,
  external_message_id text,                                          -- telegram message_id
  delivery_status     text not null check (delivery_status in ('N/A','PENDING','SENT','FAILED')),
  delivery_error      text,
  created_at          timestamptz not null default clock_timestamp(),
  primary key (space_id, id),
  unique (id),
  unique (conversation_id, seq),
  foreign key (space_id, conversation_id) references contact_center.conversations(space_id, id) on delete cascade,
  check ((direction = 'outbound') = (delivery_status <> 'N/A'))
);
create index messages_conv_seq on contact_center.messages (conversation_id, seq desc);
create index messages_pending on contact_center.messages (created_at) where delivery_status = 'PENDING';

-- Messages are immutable except for delivery bookkeeping of outbound messages.
create function contact_center.guard_message() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'messages are immutable'; end if;
  if (new.space_id, new.id, new.conversation_id, new.chapter_id, new.seq, new.direction, new.author_kind,
      new.author_name, new.body, new.evidence, new.session_id, new.created_at)
     is distinct from
     (old.space_id, old.id, old.conversation_id, old.chapter_id, old.seq, old.direction, old.author_kind,
      old.author_name, old.body, old.evidence, old.session_id, old.created_at) then
    raise exception 'messages are immutable (only delivery fields may change)';
  end if;
  if old.delivery_status = 'SENT' and new.delivery_status <> 'SENT' then raise exception 'a sent message stays sent'; end if;
  return new;
end $$;
create trigger message_guard before update or delete on contact_center.messages
  for each row execute function contact_center.guard_message();

-- Webhook idempotency + durable work ledger: Telegram retries the same update_id until it gets a 2xx.
create table contact_center.inbound_updates (
  space_id     uuid not null,
  id           bigint generated always as identity primary key,
  channel_id   uuid not null,
  update_id    bigint not null,
  payload      jsonb not null,
  status       text not null default 'RECEIVED' check (status in ('RECEIVED','PROCESSING','DONE','FAILED','IGNORED')),
  attempts     integer not null default 0,
  lease_until  timestamptz,
  last_error   text,
  message_id   uuid,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (channel_id, update_id),
  foreign key (space_id, channel_id) references contact_center.channels(space_id, id)
);
create index inbound_updates_work on contact_center.inbound_updates (received_at) where status in ('RECEIVED','PROCESSING');

-- =====================================================================================================================
-- 6. KNOWLEDGE (App 4) — approved, versioned, time-valid documents; chunks with embeddings + full text
-- =====================================================================================================================
create table kb.documents (
  space_id     uuid not null references platform.spaces(id),
  id           uuid not null default gen_random_uuid(),
  doc_key      text not null,                -- stable identity across versions, e.g. 'cellar-list'
  title        text not null,
  kind         text not null check (kind in ('WINE_LIST','POLICY','MENU','SOP')),
  folder       text not null default 'Documents',
  version      integer not null,
  state        text not null check (state in ('DRAFT','APPROVED_ACTIVE','SUPERSEDED','ARCHIVED')),
  approved_by  text,
  approved_at  timestamptz,
  valid_during tstzrange not null,
  primary key (space_id, id),
  unique (id),
  unique (space_id, doc_key, version),
  check (state <> 'APPROVED_ACTIVE' or (approved_by is not null and approved_at is not null)),
  -- btree_gist: at most one approved version of a document is valid at any instant
  constraint documents_one_active exclude using gist (
    space_id with =, doc_key with =, valid_during with &&
  ) where (state = 'APPROVED_ACTIVE')
);

create table kb.chunks (
  space_id       uuid not null,
  id             uuid not null default gen_random_uuid(),
  document_id    uuid not null,
  ordinal        integer not null default 0,
  content        text not null,
  structured     jsonb not null default '{}',
  content_sha256 text generated always as (encode(extensions.digest(content, 'sha256'), 'hex')) stored,
  fts            tsvector generated always as (to_tsvector('simple', content)) stored,
  embedding      extensions.vector(768),        -- gemini-embedding, outputDimensionality = 768
  embedding_model text,
  embedded_at    timestamptz,
  primary key (space_id, id),
  unique (id),
  foreign key (space_id, document_id) references kb.documents(space_id, id) on delete cascade
);
create index chunks_space_doc on kb.chunks (space_id, document_id);
create index chunks_fts on kb.chunks using gin (fts);
-- Per-tenant corpora are small (thousands of chunks), so exact search within one space_id is fast and has perfect
-- recall. Add an ANN index only when a tenant exceeds ~20k chunks (blueprint §5.4), e.g.:
--   create index chunks_embedding_hnsw on kb.chunks using hnsw (embedding extensions.vector_cosine_ops);
--   and set hnsw.iterative_scan = relaxed_order for filtered queries (pgvector >= 0.8).

-- Vector search (canonical Supabase `match_documents` shape, tenant-scoped, approved + valid-now only).
-- SECURITY INVOKER: an authenticated caller only sees its own properties through RLS; the service role passes p_space_id.
create function kb.match_documents(
  query_embedding extensions.vector(768),
  p_space_id      uuid,
  match_count     integer default 5,
  min_similarity  double precision default 0.0
) returns table (
  chunk_id uuid, document_id uuid, document_title text, document_version integer, approved_by text,
  approved_at timestamptz, valid_until timestamptz, content text, structured jsonb, content_sha256 text, similarity double precision
)
language sql stable set search_path = '' as $$
  select c.id, d.id, d.title, d.version, d.approved_by, d.approved_at, upper(d.valid_during), c.content, c.structured,
         c.content_sha256, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from kb.chunks c
  join kb.documents d on d.space_id = c.space_id and d.id = c.document_id
  where c.space_id = p_space_id
    and d.state = 'APPROVED_ACTIVE' and d.valid_during @> now()
    and c.embedding is not null
    and 1 - (c.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 50)
$$;

-- Hybrid search: reciprocal-rank fusion of full-text and (when present) vector ranks. Works before any embedding exists.
create function kb.search_hybrid(
  query_text      text,
  p_space_id      uuid,
  query_embedding extensions.vector(768) default null,
  match_count     integer default 5
) returns table (
  chunk_id uuid, document_id uuid, document_title text, document_version integer, approved_by text,
  approved_at timestamptz, valid_until timestamptz, content text, structured jsonb, content_sha256 text, score double precision
)
language sql stable set search_path = '' as $$
  with q as (
    select to_tsquery('simple', coalesce(nullif(array_to_string(array(
             select lexeme || ':*' from unnest(to_tsvector('simple', coalesce(query_text, ''))) ), ' | '), ''), 'x_no_terms_x')) as tsq
  ),
  eligible as (
    select c.*, d.title, d.version, d.approved_by, d.approved_at, upper(d.valid_during) as valid_until
    from kb.chunks c join kb.documents d on d.space_id = c.space_id and d.id = c.document_id
    where c.space_id = p_space_id and d.state = 'APPROVED_ACTIVE' and d.valid_during @> now()
  ),
  lex as (
    select e.id, row_number() over (order by ts_rank(e.fts, q.tsq) desc, e.id) as r
    from eligible e, q where e.fts @@ q.tsq
  ),
  vec as (
    select e.id, row_number() over (order by e.embedding operator(extensions.<=>) query_embedding, e.id) as r
    from eligible e where query_embedding is not null and e.embedding is not null
    order by e.embedding operator(extensions.<=>) query_embedding limit 50
  ),
  fused as (
    select coalesce(lex.id, vec.id) as id,
           coalesce(1.0 / (60 + lex.r), 0) + coalesce(1.0 / (60 + vec.r), 0) as score
    from lex full join vec on vec.id = lex.id
  )
  select e.id, e.document_id, e.title, e.version, e.approved_by, e.approved_at, e.valid_until, e.content, e.structured,
         e.content_sha256, f.score
  from fused f join eligible e on e.id = f.id
  order by f.score desc, e.id
  limit least(greatest(match_count, 1), 50)
$$;

-- Dispatch-time re-validation: every cited chunk must still belong to an approved, currently valid document.
create function kb.evidence_valid(p_space_id uuid, p_chunk_ids uuid[]) returns boolean
language sql stable set search_path = '' as $$
  select count(*) = coalesce(cardinality(p_chunk_ids), 0)
  from kb.chunks c join kb.documents d on d.space_id = c.space_id and d.id = c.document_id
  where c.space_id = p_space_id and c.id = any(p_chunk_ids) and d.state = 'APPROVED_ACTIVE' and d.valid_during @> now()
$$;

-- =====================================================================================================================
-- 7. AI TEAM (App 5) — agent personas, reasoning sessions, step log (the live reasoning feed)
-- =====================================================================================================================
create table ai_team.agents (
  space_id       uuid not null references platform.spaces(id),
  id             uuid not null default gen_random_uuid(),
  key            text not null,
  display_name   text not null,
  role           text not null,
  persona        text not null,
  instructions   text not null,
  model          text not null default 'gemini-3.8-flash',
  thinking_level text not null default 'medium' check (thinking_level in ('low','medium','high')),
  enabled        boolean not null default true,
  primary key (space_id, id),
  unique (space_id, key)
);

create table ai_team.sessions (
  space_id           uuid not null references platform.spaces(id),
  id                 uuid not null default gen_random_uuid(),
  conversation_id    uuid not null,
  trigger_message_id uuid not null,
  state              text not null default 'RUNNING' check (state in ('RUNNING','COMPLETED','HANDED_TO_HUMAN','FAILED')),
  reply_message_id   uuid,
  input_tokens       integer not null default 0,
  output_tokens      integer not null default 0,
  thinking_tokens    integer not null default 0,
  model_calls        integer not null default 0,
  error              text,
  started_at         timestamptz not null default clock_timestamp(),
  finished_at        timestamptz,
  primary key (space_id, id),
  unique (id),
  unique (trigger_message_id),                  -- one reasoning session per inbound message (retry-safe)
  foreign key (space_id, conversation_id) references contact_center.conversations(space_id, id) on delete cascade
);

create table ai_team.steps (
  space_id   uuid not null,
  id         uuid not null default gen_random_uuid(),
  session_id uuid not null,
  seq        integer not null,
  agent_key  text not null,
  kind       text not null check (kind in ('THOUGHT','TOOL_CALL','TOOL_RESULT','HANDOFF','GUARDRAIL','DECISION','REPLY')),
  title      text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  primary key (space_id, id),
  unique (session_id, seq),
  foreign key (space_id, session_id) references ai_team.sessions(space_id, id) on delete cascade
);

alter table ops.tasks add foreign key (space_id, conversation_id) references contact_center.conversations(space_id, id) on delete set null (conversation_id);
alter table ops.tasks add foreign key (space_id, session_id) references ai_team.sessions(space_id, id) on delete set null (session_id);

-- =====================================================================================================================
-- 8. RPC — server pipeline (service_role only). Called from Next.js Route Handlers with the service key.
-- =====================================================================================================================

-- Append one message with a gap-free per-conversation sequence (row lock on the conversation).
create function contact_center.append_message(
  p_conversation_id uuid, p_direction text, p_author_kind text, p_author_name text, p_body text,
  p_evidence jsonb default '[]', p_session_id uuid default null, p_external_message_id text default null
) returns contact_center.messages
language plpgsql set search_path = '' as $$
declare c contact_center.conversations; ch uuid; m contact_center.messages;
begin
  select * into c from contact_center.conversations where id = p_conversation_id for update;
  if not found then raise exception 'conversation % not found', p_conversation_id; end if;
  select id into ch from contact_center.chapters where conversation_id = c.id and closed_at is null;
  insert into contact_center.messages (space_id, conversation_id, chapter_id, seq, direction, author_kind, author_name, body,
                                       evidence, session_id, external_message_id, delivery_status)
  values (c.space_id, c.id, ch, c.next_seq, p_direction, p_author_kind, p_author_name, left(p_body, 4096),
          coalesce(p_evidence, '[]'), p_session_id, p_external_message_id,
          case when p_direction = 'outbound' then 'PENDING' else 'N/A' end)
  returning * into m;
  update contact_center.conversations set next_seq = next_seq + 1, last_message_at = m.created_at where id = c.id;
  return m;
end $$;

-- Idempotent Telegram ingest: dedupe by update_id, resolve identity/profile/conversation/chapter, store the message.
-- Handles `/start <token>` deep links (binds the Telegram user to a pre-registered guest + stay).
create function contact_center.ingest_telegram_update(p_channel_id uuid, p_update jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  ch contact_center.channels; upd_id bigint; msg jsonb; chat_id text; from_id text; txt text; uname text; fname text;
  lang text; ledger_id bigint; ident guest_crm.identities; tok guest_crm.link_tokens; prof uuid; conv contact_center.conversations;
  m contact_center.messages; cmd text := null; stay record;
begin
  select * into ch from contact_center.channels where id = p_channel_id and kind = 'telegram' and enabled;
  if not found then raise exception 'unknown or disabled telegram channel'; end if;
  upd_id := (p_update ->> 'update_id')::bigint;
  if upd_id is null then raise exception 'update_id missing'; end if;

  insert into contact_center.inbound_updates (space_id, channel_id, update_id, payload)
  values (ch.space_id, ch.id, upd_id, p_update)
  on conflict (channel_id, update_id) do nothing
  returning id into ledger_id;
  if ledger_id is null then                                   -- Telegram retry of an update we already hold
    return jsonb_build_object('duplicate', true, 'update_id', upd_id);
  end if;

  msg := coalesce(p_update -> 'message', p_update -> 'business_message');
  if msg is null or msg -> 'chat' ->> 'type' <> 'private' then
    update contact_center.inbound_updates set status = 'IGNORED', processed_at = now() where id = ledger_id;
    return jsonb_build_object('duplicate', false, 'ignored', true, 'ledger_id', ledger_id);
  end if;

  chat_id := msg -> 'chat' ->> 'id';
  from_id := msg -> 'from' ->> 'id';
  uname   := msg -> 'from' ->> 'username';
  fname   := trim(coalesce(msg -> 'from' ->> 'first_name', '') || ' ' || coalesce(msg -> 'from' ->> 'last_name', ''));
  lang    := case when msg -> 'from' ->> 'language_code' in ('ka','ru','en') then msg -> 'from' ->> 'language_code' else 'en' end;
  txt     := coalesce(msg ->> 'text', msg ->> 'caption',
                      '[unsupported ' || coalesce((select k from jsonb_object_keys(msg) k
                        where k in ('photo','voice','video','document','sticker','location','contact') limit 1), 'content') || ']');

  -- deep link: /start <token>
  if txt ~ '^/start(\s|$)' then
    cmd := 'start';
    select * into tok from guest_crm.link_tokens
    where token = nullif(trim(substr(txt, 7)), '') and space_id = ch.space_id and redeemed_at is null and expires_at > now()
    for update;
    if found then
      insert into guest_crm.identities (space_id, profile_id, channel, external_id, username, verified_at)
      values (ch.space_id, tok.profile_id, 'telegram', from_id, uname, now())
      on conflict (space_id, channel, external_id)
        do update set profile_id = excluded.profile_id, username = excluded.username, verified_at = excluded.verified_at;
      update guest_crm.link_tokens set redeemed_at = now() where token = tok.token;
      cmd := 'start_bound';
    end if;
  end if;

  select * into ident from guest_crm.identities where space_id = ch.space_id and channel = 'telegram' and external_id = from_id;
  if found then
    prof := ident.profile_id;
  else                                                           -- unknown sender: provisional profile for staff review
    insert into guest_crm.profiles (space_id, full_name, locale, provisional)
    values (ch.space_id, coalesce(nullif(fname, ''), 'Telegram guest ' || from_id), lang, true) returning id into prof;
    insert into guest_crm.identities (space_id, profile_id, channel, external_id, username)
    values (ch.space_id, prof, 'telegram', from_id, uname);
  end if;

  insert into contact_center.conversations (space_id, channel_id, external_chat_id, profile_id)
  values (ch.space_id, ch.id, chat_id, prof)
  on conflict (channel_id, external_chat_id) do update set profile_id = excluded.profile_id
  returning * into conv;

  if not exists (select 1 from contact_center.chapters where conversation_id = conv.id and closed_at is null) then
    select s.id, s.arrival_date, s.departure_date into stay from guest_crm.stays s
    where s.space_id = ch.space_id and s.profile_id = prof and s.status in ('BOOKED','IN_HOUSE')
    order by s.arrival_date limit 1;
    insert into contact_center.chapters (space_id, conversation_id, number, title, stay_id)
    values (ch.space_id, conv.id,
            coalesce((select max(number) from contact_center.chapters where conversation_id = conv.id), 0) + 1,
            case when stay.id is not null then 'Stay ' || to_char(stay.arrival_date, 'DD Mon') || ' – ' || to_char(stay.departure_date, 'DD Mon')
                 else 'Enquiry ' || to_char(now() at time zone 'Asia/Tbilisi', 'DD Mon YYYY') end,
            stay.id);
  end if;

  m := contact_center.append_message(conv.id, 'inbound', 'guest', coalesce(nullif(fname, ''), 'Guest'), txt,
                                     '[]', null, msg ->> 'message_id');
  update contact_center.inbound_updates set message_id = m.id where id = ledger_id;

  return jsonb_build_object(
    'duplicate', false, 'ledger_id', ledger_id, 'space_id', ch.space_id, 'conversation_id', conv.id,
    'message_id', m.id, 'chat_id', chat_id, 'profile_id', prof, 'command', cmd,
    'needs_ai', conv.state = 'AI_ACTIVE' and cmd is distinct from 'start_bound');
end $$;

-- Durable work queue over the ledger (Vercel Cron sweeper / after() both use it). Leases make crashes recoverable.
create function contact_center.claim_updates(p_limit integer default 10, p_lease interval default interval '2 minutes',
                                             p_max_attempts integer default 5)
returns setof contact_center.inbound_updates
language plpgsql set search_path = '' as $$
begin
  return query
  with c as (
    select id from contact_center.inbound_updates
    where status = 'RECEIVED' or (status = 'PROCESSING' and lease_until < now())
    order by received_at, id
    limit p_limit
    for update skip locked
  )
  update contact_center.inbound_updates u
     set status = case when u.attempts + 1 > p_max_attempts then 'FAILED' else 'PROCESSING' end,
         attempts = u.attempts + 1, lease_until = now() + p_lease,
         last_error = case when u.attempts + 1 > p_max_attempts then coalesce(u.last_error, 'max attempts exceeded') else u.last_error end
    from c where u.id = c.id
  returning u.*;
end $$;

create function contact_center.claim_update(p_ledger_id bigint, p_lease interval default interval '2 minutes')
returns boolean language plpgsql set search_path = '' as $$
begin
  update contact_center.inbound_updates set status = 'PROCESSING', attempts = attempts + 1, lease_until = now() + p_lease
  where id = p_ledger_id and (status = 'RECEIVED' or (status = 'PROCESSING' and lease_until < now()));
  return found;
end $$;

create function contact_center.finish_update(p_ledger_id bigint, p_ok boolean, p_error text default null)
returns void language sql set search_path = '' as $$
  update contact_center.inbound_updates
     set status = case when p_ok then 'DONE' else 'RECEIVED' end,   -- failures go back to the queue for the sweeper
         last_error = p_error, lease_until = null, processed_at = case when p_ok then now() end
   where id = p_ledger_id;
$$;

-- AI reply dispatch gate: sends only while the AI owns the conversation and all cited evidence is still valid;
-- otherwise stores a private draft for staff. Returns the message row (PENDING outbound → the server sends it).
create function contact_center.dispatch_ai_reply(p_session_id uuid, p_body text, p_evidence jsonb default '[]')
returns jsonb language plpgsql set search_path = '' as $$
declare s ai_team.sessions; c contact_center.conversations; ok boolean; m contact_center.messages; chunk_ids uuid[];
begin
  select * into s from ai_team.sessions where id = p_session_id for update;
  if not found or s.state <> 'RUNNING' then raise exception 'session is not running'; end if;
  select * into c from contact_center.conversations where id = s.conversation_id for update;
  select coalesce(array_agg((e ->> 'chunk_id')::uuid), '{}') into chunk_ids
    from jsonb_array_elements(coalesce(p_evidence, '[]')) e where e ? 'chunk_id';
  ok := c.state = 'AI_ACTIVE' and kb.evidence_valid(s.space_id, chunk_ids);
  if ok then
    m := contact_center.append_message(c.id, 'outbound', 'ai', 'Mia · AI Concierge', p_body, p_evidence, s.id);
  else
    m := contact_center.append_message(c.id, 'internal', 'ai', 'Mia · draft for staff', p_body, p_evidence, s.id);
  end if;
  update ai_team.sessions set state = case when ok then 'COMPLETED' else 'HANDED_TO_HUMAN' end,
         reply_message_id = m.id, finished_at = clock_timestamp()
   where id = s.id;
  return jsonb_build_object('sent', ok, 'message_id', m.id, 'chat_id', c.external_chat_id, 'channel_id', c.channel_id,
                            'reason', case when ok then null when c.state <> 'AI_ACTIVE' then 'operator_owns_conversation' else 'evidence_invalid' end);
end $$;

create function contact_center.mark_delivery(p_message_id uuid, p_ok boolean, p_external_message_id text default null,
                                             p_error text default null)
returns void language sql set search_path = '' as $$
  update contact_center.messages
     set delivery_status = case when p_ok then 'SENT' else 'FAILED' end,
         external_message_id = coalesce(p_external_message_id, external_message_id), delivery_error = p_error
   where id = p_message_id and direction = 'outbound' and delivery_status <> 'SENT';
$$;

create function ai_team.start_session(p_conversation_id uuid, p_trigger_message_id uuid) returns ai_team.sessions
language plpgsql set search_path = '' as $$
declare c contact_center.conversations; s ai_team.sessions;
begin
  select * into c from contact_center.conversations where id = p_conversation_id;
  insert into ai_team.sessions (space_id, conversation_id, trigger_message_id)
  values (c.space_id, c.id, p_trigger_message_id)
  on conflict (trigger_message_id) do update set state = ai_team.sessions.state   -- retry returns the same session
  returning * into s;
  return s;
end $$;

create function ai_team.log_step(p_session_id uuid, p_agent_key text, p_kind text, p_title text, p_detail jsonb default '{}',
                                 p_input_tokens integer default 0, p_output_tokens integer default 0, p_thinking_tokens integer default 0)
returns ai_team.steps language plpgsql set search_path = '' as $$
declare s ai_team.sessions; st ai_team.steps;
begin
  select * into s from ai_team.sessions where id = p_session_id for update;
  insert into ai_team.steps (space_id, session_id, seq, agent_key, kind, title, detail)
  values (s.space_id, s.id, coalesce((select max(seq) from ai_team.steps where session_id = s.id), 0) + 1,
          p_agent_key, p_kind, p_title, coalesce(p_detail, '{}'))
  returning * into st;
  if p_input_tokens + p_output_tokens + p_thinking_tokens > 0 then
    update ai_team.sessions set input_tokens = input_tokens + p_input_tokens, output_tokens = output_tokens + p_output_tokens,
           thinking_tokens = thinking_tokens + p_thinking_tokens, model_calls = model_calls + 1 where id = s.id;
  end if;
  return st;
end $$;

create function ai_team.fail_session(p_session_id uuid, p_error text) returns void
language sql set search_path = '' as $$
  update ai_team.sessions set state = 'FAILED', error = left(p_error, 2000), finished_at = clock_timestamp()
  where id = p_session_id and state = 'RUNNING';
$$;

-- Guest context for the concierge (Layer-1 CRM memory). Sensitive facts are returned separately so the caller can
-- use them for safety checks without placing them in the prompt.
create function guest_crm.guest_context(p_profile_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'locale', p.locale, 'loyalty_tier', p.loyalty_tier,
                                  'provisional', p.provisional, 'privacy_epoch', p.privacy_epoch),
    'stay', (select jsonb_build_object('id', s.id, 'room_number', r.number, 'room_id', r.id, 'arrival', s.arrival_date,
                                       'departure', s.departure_date, 'status', s.status)
             from guest_crm.stays s join ops.rooms r on r.space_id = s.space_id and r.id = s.room_id
             where s.space_id = p.space_id and s.profile_id = p.id and s.status in ('BOOKED','IN_HOUSE')
             order by s.arrival_date limit 1),
    'preferences', coalesce((select jsonb_agg(jsonb_build_object('domain', f.domain, 'label', f.label, 'value', f.value) order by f.domain, f.label)
                             from guest_crm.preferences f where f.space_id = p.space_id and f.profile_id = p.id and f.status = 'active' and not f.sensitive), '[]'),
    'sensitive', coalesce((select jsonb_agg(jsonb_build_object('label', f.label, 'value', f.value))
                           from guest_crm.preferences f where f.space_id = p.space_id and f.profile_id = p.id and f.status = 'active' and f.sensitive), '[]'))
  from guest_crm.profiles p where p.id = p_profile_id
$$;

create function ops.create_task(p_conversation_id uuid, p_session_id uuid, p_category text, p_title text, p_detail text,
                                p_room_id uuid default null, p_quantity integer default null, p_priority text default 'ROUTINE',
                                p_requires_confirmation boolean default false, p_due_in interval default interval '30 minutes')
returns ops.tasks language plpgsql set search_path = '' as $$
declare c contact_center.conversations; t ops.tasks;
begin
  select * into c from contact_center.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found'; end if;
  insert into ops.tasks (space_id, conversation_id, session_id, category, title, detail, room_id, quantity, priority,
                         requires_staff_confirmation, due_at)
  values (c.space_id, c.id, p_session_id, p_category, p_title, coalesce(p_detail, ''), p_room_id, p_quantity, p_priority,
          p_requires_confirmation, now() + p_due_in)
  returning * into t;
  return t;
end $$;

-- Queue a system notice to the guest if (and only if) the AI owns the conversation.
create function contact_center.queue_guest_notice(p_conversation_id uuid, p_body text) returns uuid
language plpgsql set search_path = '' as $$
declare c contact_center.conversations; m contact_center.messages;
begin
  select * into c from contact_center.conversations where id = p_conversation_id;
  if not found or c.state <> 'AI_ACTIVE' then return null; end if;
  m := contact_center.append_message(c.id, 'outbound', 'system', 'Chateau Telavi', p_body);
  return m.id;
end $$;

-- =====================================================================================================================
-- 9. RPC — staff console (authenticated). SECURITY DEFINER with explicit membership + capability checks.
-- =====================================================================================================================
create function contact_center.set_control(p_conversation_id uuid, p_mode text) returns contact_center.conversations
language plpgsql security definer set search_path = '' as $$
declare c contact_center.conversations; me platform.staff;
begin
  select * into c from contact_center.conversations where id = p_conversation_id for update;
  if not found then raise exception 'conversation not found'; end if;
  me := platform.require_staff(c.space_id);
  if p_mode = 'operator' then
    update contact_center.conversations set state = 'OPERATOR_LOCKED', owner_staff_id = me.id, control_version = control_version + 1
     where id = c.id returning * into c;
  elsif p_mode = 'ai' then
    update contact_center.conversations set state = 'AI_ACTIVE', owner_staff_id = null, control_version = control_version + 1
     where id = c.id returning * into c;
  else
    raise exception 'mode must be operator or ai';
  end if;
  return c;
end $$;

-- Staff reply: only the staff member who holds the conversation may send. Returns the PENDING outbound message.
create function contact_center.operator_reply(p_conversation_id uuid, p_body text) returns contact_center.messages
language plpgsql security definer set search_path = '' as $$
declare c contact_center.conversations; me platform.staff;
begin
  select * into c from contact_center.conversations where id = p_conversation_id;
  if not found then raise exception 'conversation not found'; end if;
  me := platform.require_staff(c.space_id);
  if c.state <> 'OPERATOR_LOCKED' or c.owner_staff_id <> me.id then
    raise exception 'take over the conversation before replying' using errcode = '42501';
  end if;
  return contact_center.append_message(c.id, 'outbound', 'operator', me.display_name || ' · Front desk', p_body);
end $$;

create function ops.task_action(p_task_id uuid, p_action text, p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t ops.tasks; me platform.staff; notice uuid; r ops.rooms;
begin
  select * into t from ops.tasks where id = p_task_id for update;
  if not found then raise exception 'task not found'; end if;
  me := platform.require_staff(t.space_id);
  if p_expected_version is not null and p_expected_version <> t.state_version then
    raise exception 'stale action: task is at version %', t.state_version using errcode = '40001';
  end if;
  if p_action = 'ClaimTask' then
    update ops.tasks set status = 'CLAIMED', assignee_id = me.id, state_version = state_version + 1 where id = t.id returning * into t;
  elsif p_action = 'StartTask' then
    if t.assignee_id is distinct from me.id then raise exception 'only the assignee can start this task' using errcode = '42501'; end if;
    update ops.tasks set status = 'IN_PROGRESS', state_version = state_version + 1 where id = t.id returning * into t;
  elsif p_action = 'AttestCompleted' then
    if t.assignee_id is distinct from me.id then raise exception 'only the assignee can attest this task' using errcode = '42501'; end if;
    insert into ops.attestations (space_id, task_id, staff_id, statement, evidence_ref)
    values (t.space_id, t.id, me.id, 'I personally completed and checked this hotel service.', 'console:' || t.id);
    update ops.tasks set status = 'COMPLETED', state_version = state_version + 1 where id = t.id returning * into t;
    if t.conversation_id is not null then
      select * into r from ops.rooms where id = t.room_id;
      notice := contact_center.queue_guest_notice(t.conversation_id,
        case t.category when 'housekeeping' then 'Done: ' || lower(t.title) || coalesce(' — room ' || r.number, '') || '.'
                        when 'food_beverage' then 'Delivered: ' || t.title || coalesce(' to room ' || r.number, '') || '. Enjoy!'
                        else 'The front desk has taken care of your request.' end);
    end if;
  elsif p_action = 'ReleaseTask' then
    update ops.tasks set status = 'QUEUED', assignee_id = null, state_version = state_version + 1 where id = t.id returning * into t;
  elsif p_action = 'CancelTask' then
    if me.role not in ('FRONT_DESK_LEAD','GENERAL_MANAGER','HOUSEKEEPING_SUPERVISOR') then raise exception 'not allowed' using errcode = '42501'; end if;
    update ops.tasks set status = 'CANCELLED', state_version = state_version + 1 where id = t.id returning * into t;
  else
    raise exception 'unknown action %', p_action;
  end if;
  return jsonb_build_object('task', to_jsonb(t), 'notice_message_id', notice);
end $$;

create function ops.room_action(p_room_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r ops.rooms; me platform.staff; target text; notice uuid; g record;
begin
  select * into r from ops.rooms where id = p_room_id for update;
  if not found then raise exception 'room not found'; end if;
  me := platform.require_staff(r.space_id);
  target := case p_action when 'StartCleaning' then 'CLEANING' when 'MarkClean' then 'CLEAN' when 'MarkDirty' then 'DIRTY' end;
  if target is null then raise exception 'unknown action %', p_action; end if;
  if p_action = 'MarkClean' and me.role not in ('HOUSEKEEPING_SUPERVISOR','GENERAL_MANAGER') then
    raise exception 'a housekeeping supervisor must inspect and release the room' using errcode = '42501';
  end if;
  insert into ops.room_events (space_id, room_id, from_state, to_state, staff_id) values (r.space_id, r.id, r.cleaning_state, target, me.id);
  update ops.rooms set cleaning_state = target where id = r.id returning * into r;
  if target = 'CLEAN' then            -- tell an arriving guest their room is ready
    for g in select c.id as conversation_id, p.full_name from guest_crm.stays s
             join guest_crm.profiles p on p.space_id = s.space_id and p.id = s.profile_id
             join contact_center.conversations c on c.space_id = s.space_id and c.profile_id = s.profile_id
             where s.space_id = r.space_id and s.room_id = r.id and s.status = 'BOOKED' and s.arrival_date = (now() at time zone 'Asia/Tbilisi')::date
    loop
      notice := contact_center.queue_guest_notice(g.conversation_id,
                  'Good news, ' || split_part(g.full_name, ' ', 1) || ' — your room ' || r.number || ' is cleaned, inspected and ready.');
    end loop;
  end if;
  return jsonb_build_object('room', to_jsonb(r), 'notice_message_id', notice);
end $$;

-- Create a Telegram deep-link token for a guest (front desk shares https://t.me/<bot>?start=<token>).
create function guest_crm.create_link_token(p_profile_id uuid, p_stay_id uuid default null) returns text
language plpgsql security definer set search_path = '' as $$
declare p guest_crm.profiles; t text;
begin
  select * into p from guest_crm.profiles where id = p_profile_id;
  if not found then raise exception 'profile not found'; end if;
  perform platform.require_staff(p.space_id);
  insert into guest_crm.link_tokens (space_id, profile_id, stay_id) values (p.space_id, p.id, p_stay_id) returning token into t;
  return t;
end $$;

-- =====================================================================================================================
-- 10. ANALYTICS (App 6) — live views over the operational tables; security_invoker so RLS applies to the caller
-- =====================================================================================================================
create view analytics.kpis with (security_invoker = true) as
select sp.id as space_id,
  (select count(*) from guest_crm.stays s where s.space_id = sp.id and s.status in ('BOOKED','IN_HOUSE')
      and (now() at time zone sp.timezone)::date >= s.arrival_date and (now() at time zone sp.timezone)::date < s.departure_date) as guests_in_house_or_arriving,
  (select count(*) from ops.tasks t where t.space_id = sp.id and t.status in ('QUEUED','CLAIMED','IN_PROGRESS'))           as open_tasks,
  (select count(*) from ops.rooms r where r.space_id = sp.id and r.cleaning_state = 'CLEAN')                                 as rooms_ready,
  (select count(*) from ops.rooms r where r.space_id = sp.id)                                                                 as rooms_total,
  (select count(*) from contact_center.messages m where m.space_id = sp.id and m.direction = 'inbound'
      and m.created_at >= date_trunc('day', now() at time zone sp.timezone) at time zone sp.timezone)                       as inbound_today,
  (select count(*) from ai_team.sessions a where a.space_id = sp.id and a.started_at >= now() - interval '24 hours')        as ai_sessions_24h,
  (select count(*) from ai_team.sessions a where a.space_id = sp.id and a.state = 'HANDED_TO_HUMAN'
      and a.started_at >= now() - interval '24 hours')                                                                       as handoffs_24h,
  (select round(avg(extract(epoch from t.completed_at - t.created_at) / 60)::numeric, 1) from ops.tasks t
      where t.space_id = sp.id and t.status = 'COMPLETED' and t.completed_at >= now() - interval '7 days')                  as avg_task_minutes_7d,
  (select coalesce(sum(a.input_tokens + a.output_tokens + a.thinking_tokens), 0) from ai_team.sessions a
      where a.space_id = sp.id and a.started_at >= now() - interval '24 hours')                                             as tokens_24h
from platform.spaces sp;

create view analytics.daily_messages with (security_invoker = true) as
select m.space_id, (m.created_at at time zone 'Asia/Tbilisi')::date as day, m.author_kind, m.direction, count(*) as messages
from contact_center.messages m group by 1, 2, 3, 4;

create view analytics.task_throughput with (security_invoker = true) as
select t.space_id, (t.created_at at time zone 'Asia/Tbilisi')::date as day, t.category,
       count(*) as created, count(*) filter (where t.status = 'COMPLETED') as completed,
       round(avg(extract(epoch from t.completed_at - t.created_at) / 60) filter (where t.status = 'COMPLETED')::numeric, 1) as avg_minutes
from ops.tasks t group by 1, 2, 3;

-- =====================================================================================================================
-- 11. ROW LEVEL SECURITY — enable + force on every table; staff read their own properties; no direct staff writes
-- =====================================================================================================================
do $$
declare r record; tenant_col text;
begin
  for r in select schemaname, tablename from pg_tables
           where schemaname in ('platform','contact_center','guest_crm','ops','kb','ai_team') loop
    tenant_col := case when r.schemaname = 'platform' and r.tablename = 'spaces' then 'id' else 'space_id' end;
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('alter table %I.%I force row level security', r.schemaname, r.tablename);
    execute format('create policy staff_read on %I.%I for select to authenticated using (%I in (select platform.my_space_ids()))',
                   r.schemaname, r.tablename, tenant_col);
  end loop;
end $$;

-- Tighter reads for sensitive tables: the webhook ledger (raw payloads) and link tokens are server-only.
drop policy staff_read on contact_center.inbound_updates;
drop policy staff_read on guest_crm.link_tokens;
-- Sensitive preferences (allergens) are visible to staff of the property (operational safety need), never to anon.

-- =====================================================================================================================
-- 12. GRANTS — anon: nothing. authenticated: SELECT (filtered by RLS) + selected RPCs. service_role: everything.
-- =====================================================================================================================
revoke all on schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics from public;
grant usage on schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics to authenticated, service_role;

grant select on all tables in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics to authenticated;
revoke select on contact_center.inbound_updates, guest_crm.link_tokens from authenticated;
grant all on all tables in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics to service_role;
grant usage, select on all sequences in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics to service_role;

-- Functions are EXECUTE-able by PUBLIC by default in PostgreSQL: revoke, then grant deliberately.
revoke execute on all functions in schema platform, contact_center, guest_crm, ops, kb, ai_team from public;
grant execute on all functions in schema platform, contact_center, guest_crm, ops, kb, ai_team to service_role;
grant execute on function
  platform.my_space_ids(),
  contact_center.set_control(uuid, text),
  contact_center.operator_reply(uuid, text),
  ops.task_action(uuid, text, bigint),
  ops.room_action(uuid, text),
  guest_crm.create_link_token(uuid, uuid),
  kb.match_documents(extensions.vector, uuid, integer, double precision),
  kb.search_hybrid(text, uuid, extensions.vector, integer)
to authenticated;

-- Future migrations by the same owner inherit the model: service_role full, authenticated read-only (RLS), no PUBLIC
-- EXECUTE on new functions. (New Supabase projects no longer auto-grant Data API access to new objects.)
alter default privileges in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics
  grant all on tables to service_role;
alter default privileges in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics
  grant select on tables to authenticated;
alter default privileges in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics
  grant usage, select on sequences to service_role;
alter default privileges in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics
  revoke execute on functions from public;
alter default privileges in schema platform, contact_center, guest_crm, ops, kb, ai_team, analytics
  grant execute on functions to service_role;

-- =====================================================================================================================
-- 13. REALTIME — Postgres Changes for the live console (RLS-filtered per subscriber)
-- =====================================================================================================================
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'publication supabase_realtime not found (not a Supabase project?) — skipping realtime setup';
    return;
  end if;
  foreach t in array array['contact_center.messages','contact_center.conversations','ops.tasks','ops.rooms',
                           'ai_team.sessions','ai_team.steps'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname || '.' || tablename = t) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end $$;

-- =====================================================================================================================
-- 14. SEED — Chateau Telavi Wine Resort (Kakheti). Fixed UUIDs so the app and docs can reference them.
-- =====================================================================================================================
insert into platform.spaces (id, property_code, name, region, timezone) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', 'CHATEAU-TELAVI', 'Chateau Telavi Wine Resort', 'Kakheti, Georgia', 'Asia/Tbilisi');

insert into platform.staff (space_id, id, display_name, role) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000b001', 'Levan Beridze',     'FRONT_DESK_LEAD'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000b002', 'Tamar Gelashvili',  'ROOM_ATTENDANT'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000b003', 'Ana Jorjadze',      'HOUSEKEEPING_SUPERVISOR'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000b004', 'Giorgi Maisuradze', 'SOMMELIER'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000b005', 'Nana Kapanadze',    'GENERAL_MANAGER');

insert into ops.rooms (space_id, id, number, room_type, floor, cleaning_state) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-000000000012', '12',  'Deluxe',   'Garden wing',   'DIRTY'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-000000000101', '101', 'Superior', 'Vineyard wing', 'CLEAN'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-000000000102', '102', 'Superior', 'Vineyard wing', 'CLEAN');

insert into guest_crm.profiles (space_id, id, full_name, locale, phone_e164, email, contact_verified_at, loyalty_tier) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000a111', 'Nino Kakhetelashvili', 'en',
   '+995555123456', 'nino.k@example.ge', now() - interval '3 days', 'Gold');

insert into guest_crm.stays (space_id, id, profile_id, room_id, arrival_date, departure_date, status, source) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000057a1', '6f1c2d3e-0000-4000-8000-00000000a111',
   '6f1c2d3e-0000-4000-8000-000000000012', (now() at time zone 'Asia/Tbilisi')::date, (now() at time zone 'Asia/Tbilisi')::date + 3,
   'BOOKED', 'direct');

insert into guest_crm.preferences (space_id, profile_id, domain, label, value, sensitive, basis, evidence, consent_ref) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000a111', 'wine_experience', 'Wine style', 'Dry Kakhetian reds - Saperavi', false, 'contract', 'guest_explicit', null),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000a111', 'wine_experience', 'Tour interest', 'Qvevri cellar tour', false, 'contract', 'guest_explicit', null),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000a111', 'room', 'Pillow type', 'Firm', false, 'contract', 'staff_confirmed', null),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-00000000a111', 'dining', 'Allergen avoidance', 'Tree nuts', true, 'explicit_consent', 'guest_explicit', 'consent:booking-form-2026-09-21');

-- Demo deep link for Nino: https://t.me/<your_bot>?start=nino-telavi-demo
insert into guest_crm.link_tokens (space_id, token, profile_id, stay_id, expires_at) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', 'nino-telavi-demo', '6f1c2d3e-0000-4000-8000-00000000a111',
   '6f1c2d3e-0000-4000-8000-0000000057a1', now() + interval '60 days');

insert into contact_center.channels (space_id, id, kind, display_name, bot_username) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000c4a01', 'telegram', 'Telegram · Chateau Telavi', 'ChateauTelaviBot');

insert into kb.documents (space_id, id, doc_key, title, kind, folder, version, state, approved_by, approved_at, valid_during) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c01', 'cellar-list', 'Cellar & Wine List', 'WINE_LIST',
   'Menus & Cellar', 3, 'APPROVED_ACTIVE', 'Ana Jorjadze (GM delegate)', now() - interval '2 days',
   tstzrange(now() - interval '2 days', now() + interval '90 days')),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c02', 'guest-services', 'Guest Services Policy', 'POLICY',
   'Policies', 5, 'APPROVED_ACTIVE', 'Levan Beridze', now() - interval '10 days',
   tstzrange(now() - interval '10 days', now() + interval '180 days'));

insert into kb.chunks (space_id, document_id, ordinal, content, structured) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c01', 1,
   'Saperavi 2022 Estate Reserve | qvevri-aged dry red | vintage 2022 | 90 GEL per 750ml bottle | allergens: sulphites | contains no tree nuts',
   '{"item":"Saperavi 2022 Estate Reserve","vintage":2022,"price_gel":90,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true,"notes":"Qvevri-aged dry red from Kakheti"}'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c01', 2,
   'Rkatsiteli 2023 Amber | skin-contact white | vintage 2023 | 65 GEL per 750ml bottle | allergens: sulphites',
   '{"item":"Rkatsiteli 2023 Amber","vintage":2023,"price_gel":65,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true}'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c01', 3,
   'Kindzmarauli 2021 | semi-sweet red | vintage 2021 | 70 GEL per 750ml bottle | allergens: sulphites',
   '{"item":"Kindzmarauli 2021","vintage":2021,"price_gel":70,"unit":"750ml bottle","allergens":["sulphites"],"allergen_verified":true}'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c02', 1,
   'Check-out is at 12:00. Late checkout until 14:00 is free for Gold members, subject to availability confirmed by the front desk.',
   '{"topic":"checkout"}'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c02', 2,
   'Wine tastings and cellar tours can be cancelled free of charge up to 24 hours before the start time.',
   '{"topic":"tasting_cancellation"}'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', '6f1c2d3e-0000-4000-8000-0000000d0c02', 3,
   'Extra towels, pillows and bathrobes are complimentary and delivered by housekeeping within 30 minutes.',
   '{"topic":"amenities"}');

insert into ai_team.agents (space_id, key, display_name, role, persona, instructions, model, thinking_level) values
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', 'mia', 'Mia', 'Customer Advisor', 'Front-Desk Concierge',
   'Greet warmly, answer only from approved knowledge, personalise with non-sensitive CRM preferences, never claim a service is completed, hand unsupported requests to the front desk.',
   'gemini-3.8-flash', 'medium'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', 'sommelier', 'Sommelier', 'Cellar Specialist', 'Kakheti Cellar Specialist',
   'Recommend only wines on the approved Cellar & Wine List, quote prices exactly, check allergens against the guest''s sensitive facts, abstain when no approved entry matches.',
   'gemini-3.8-flash', 'high'),
  ('6f1c2d3e-0000-4000-8000-00000000c7e1', 'coordinator', 'Operations Coordinator', 'Task Dispatcher', 'Housekeeping & F&B dispatch',
   'Turn requests into precise tasks with room, quantity and SLA from the Guest Services Policy; charges need front-desk confirmation; never mark tasks complete.',
   'gemini-3.8-flash', 'low');

commit;

-- Verification (optional, run separately):
--   select * from analytics.kpis;
--   select chunk_id, document_title, score from kb.search_hybrid('Saperavi 2022', '6f1c2d3e-0000-4000-8000-00000000c7e1');
--   select contact_center.ingest_telegram_update('6f1c2d3e-0000-4000-8000-0000000c4a01',
--     '{"update_id":1,"message":{"message_id":1,"date":1790000000,"chat":{"id":424242,"type":"private"},
--       "from":{"id":424242,"first_name":"Nino","language_code":"en"},"text":"/start nino-telavi-demo"}}');
