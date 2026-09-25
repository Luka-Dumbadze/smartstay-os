-- Additive training/competency workflow for housekeeping tasks.
-- Apply only after the base schemas in db/supabase_master_schema.sql exist. This migration is non-destructive.
begin;

alter table ops.tasks
  add column if not exists required_sop_document_id uuid,
  add column if not exists required_sop_version integer,
  add column if not exists arrival_deadline_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_required_sop_pair' and conrelid = 'ops.tasks'::regclass) then
    alter table ops.tasks add constraint tasks_required_sop_pair
      check ((required_sop_document_id is null) = (required_sop_version is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_required_sop_housekeeping_only' and conrelid = 'ops.tasks'::regclass) then
    alter table ops.tasks add constraint tasks_required_sop_housekeeping_only
      check (required_sop_document_id is null or category = 'housekeeping');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_required_sop_document_fk' and conrelid = 'ops.tasks'::regclass) then
    alter table ops.tasks add constraint tasks_required_sop_document_fk
      foreign key (space_id, required_sop_document_id) references kb.documents(space_id, id) on delete restrict;
  end if;
end $$;

create table if not exists ops.staff_competencies (
  space_id                 uuid not null references platform.spaces(id),
  id                       uuid not null default gen_random_uuid(),
  staff_id                 uuid not null,
  sop_document_id          uuid not null,
  sop_version              integer not null check (sop_version > 0),
  status                   text not null default 'NOT_TRAINED'
                           check (status in ('NOT_TRAINED','KNOWLEDGE_CHECK_PASSED','SUPERVISED','PRACTICALLY_APPROVED')),
  quiz_score               integer check (quiz_score is null or quiz_score between 0 and 100),
  quiz_attempts            integer not null default 0 check (quiz_attempts >= 0),
  quiz_completed_at        timestamptz,
  supervised_at            timestamptz,
  supervised_by_staff_id   uuid,
  practical_approved_at    timestamptz,
  approved_by_staff_id     uuid,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (space_id, id),
  unique (id),
  unique (space_id, staff_id, sop_document_id, sop_version),
  foreign key (space_id, staff_id) references platform.staff(space_id, id) on delete cascade,
  foreign key (space_id, sop_document_id) references kb.documents(space_id, id) on delete restrict,
  foreign key (space_id, supervised_by_staff_id) references platform.staff(space_id, id),
  foreign key (space_id, approved_by_staff_id) references platform.staff(space_id, id),
  check (status <> 'SUPERVISED' or (supervised_at is not null and supervised_by_staff_id is not null)),
  check (status <> 'PRACTICALLY_APPROVED' or (supervised_at is not null and supervised_by_staff_id is not null
                                                   and practical_approved_at is not null and approved_by_staff_id is not null))
);

create table if not exists ops.sop_quiz_questions (
  space_id        uuid not null,
  sop_document_id uuid not null,
  sop_version     integer not null check (sop_version > 0),
  question_key    text not null,
  ordinal         integer not null,
  prompt          text not null,
  choices         jsonb not null check (jsonb_typeof(choices) = 'object'),
  correct_choice  text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (space_id, sop_document_id, sop_version, question_key),
  unique (space_id, sop_document_id, sop_version, ordinal),
  foreign key (space_id, sop_document_id) references kb.documents(space_id, id) on delete cascade,
  check (choices ? correct_choice)
);

create table if not exists ops.training_events (
  space_id        uuid not null references platform.spaces(id),
  id              uuid not null default gen_random_uuid(),
  task_id         uuid,
  target_staff_id uuid not null,
  actor_staff_id  uuid not null,
  sop_document_id uuid not null,
  sop_version     integer not null,
  event_type      text not null check (event_type in (
    'SOP_VIEWED','QUESTION_ASKED','AI_ANSWERED','AI_ABSTAINED','AI_UNAVAILABLE',
    'QUIZ_ATTEMPTED','KNOWLEDGE_CHECK_PASSED','SUPERVISED_PRACTICE_RECORDED',
    'PRACTICAL_APPROVED','PRACTICAL_REJECTED'
  )),
  details         jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at      timestamptz not null default now(),
  primary key (space_id, id),
  unique (id),
  foreign key (space_id, task_id) references ops.tasks(space_id, id),
  foreign key (space_id, target_staff_id) references platform.staff(space_id, id),
  foreign key (space_id, actor_staff_id) references platform.staff(space_id, id),
  foreign key (space_id, sop_document_id) references kb.documents(space_id, id) on delete restrict
);

create index if not exists staff_competencies_lookup
  on ops.staff_competencies (space_id, staff_id, sop_document_id, sop_version, status);
create index if not exists training_events_task_time
  on ops.training_events (space_id, task_id, created_at desc);
create index if not exists training_events_type_time
  on ops.training_events (space_id, event_type, created_at desc);

drop trigger if exists staff_competencies_touch on ops.staff_competencies;
create trigger staff_competencies_touch before update on ops.staff_competencies
  for each row execute function platform.touch_updated_at();

-- Only currently approved SOP versions can expose or score their quiz.
create or replace function ops.get_sop_quiz(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t ops.tasks; me platform.staff; d kb.documents; questions jsonb;
begin
  select * into t from ops.tasks where id = p_task_id;
  if not found then raise exception 'task not found'; end if;
  me := platform.require_staff(t.space_id);
  if t.required_sop_document_id is null or t.required_sop_version is null then
    raise exception 'task has no required SOP' using errcode = '22023';
  end if;
  select * into d from kb.documents
   where space_id = t.space_id and id = t.required_sop_document_id and version = t.required_sop_version
     and kind = 'SOP' and state = 'APPROVED_ACTIVE' and valid_during @> now();
  if not found then raise exception 'required SOP version is no longer current; ask a supervisor' using errcode = '55000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('key', q.question_key, 'prompt', q.prompt, 'choices', q.choices)
                            order by q.ordinal), '[]'::jsonb)
    into questions from ops.sop_quiz_questions q
   where q.space_id = t.space_id and q.sop_document_id = d.id and q.sop_version = d.version and q.active;
  if jsonb_array_length(questions) < 2 then
    raise exception 'knowledge check is not configured for this SOP version' using errcode = '55000';
  end if;
  insert into ops.training_events (space_id, task_id, target_staff_id, actor_staff_id, sop_document_id, sop_version, event_type)
  values (t.space_id, t.id, me.id, me.id, d.id, d.version, 'SOP_VIEWED');
  return jsonb_build_object('title', d.title, 'version', d.version, 'questions', questions);
end $$;

-- Answers are scored in the database. The client never submits a score or receives the answer key.
create or replace function ops.submit_sop_quiz(p_task_id uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t ops.tasks; me platform.staff; d kb.documents; total integer; correct integer; pct integer; passed boolean;
        answer_count integer;
begin
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'answers must be an object' using errcode = '22023'; end if;
  select * into t from ops.tasks where id = p_task_id for update;
  if not found then raise exception 'task not found'; end if;
  me := platform.require_staff(t.space_id);
  if t.required_sop_document_id is null or t.required_sop_version is null then
    raise exception 'task has no required SOP' using errcode = '22023';
  end if;
  select * into d from kb.documents
   where space_id = t.space_id and id = t.required_sop_document_id and version = t.required_sop_version
     and kind = 'SOP' and state = 'APPROVED_ACTIVE' and valid_during @> now();
  if not found then raise exception 'required SOP version is no longer current; ask a supervisor' using errcode = '55000'; end if;
  select count(*) into total from ops.sop_quiz_questions q
   where q.space_id = t.space_id and q.sop_document_id = d.id and q.sop_version = d.version and q.active;
  select count(*) into answer_count from jsonb_object_keys(p_answers);
  if total < 2 or answer_count <> total then raise exception 'answer every current knowledge-check question' using errcode = '22023'; end if;
  select count(*) into correct from ops.sop_quiz_questions q
   where q.space_id = t.space_id and q.sop_document_id = d.id and q.sop_version = d.version and q.active
     and p_answers ->> q.question_key = q.correct_choice;
  pct := floor(correct::numeric * 100 / total)::integer;
  passed := correct = total;

  insert into ops.staff_competencies (space_id, staff_id, sop_document_id, sop_version, status, quiz_score, quiz_attempts, quiz_completed_at)
  values (t.space_id, me.id, d.id, d.version, case when passed then 'KNOWLEDGE_CHECK_PASSED' else 'NOT_TRAINED' end,
          pct, 1, now())
  on conflict (space_id, staff_id, sop_document_id, sop_version) do update
    set status = case when passed and ops.staff_competencies.status = 'NOT_TRAINED' then 'KNOWLEDGE_CHECK_PASSED'
                      else ops.staff_competencies.status end,
        quiz_score = excluded.quiz_score,
        quiz_attempts = ops.staff_competencies.quiz_attempts + 1,
        quiz_completed_at = now();

  insert into ops.training_events (space_id, task_id, target_staff_id, actor_staff_id, sop_document_id, sop_version, event_type, details)
  values (t.space_id, t.id, me.id, me.id, d.id, d.version, 'QUIZ_ATTEMPTED', jsonb_build_object('score', pct, 'passed', passed));
  if passed then
    insert into ops.training_events (space_id, task_id, target_staff_id, actor_staff_id, sop_document_id, sop_version, event_type, details)
    values (t.space_id, t.id, me.id, me.id, d.id, d.version, 'KNOWLEDGE_CHECK_PASSED', jsonb_build_object('score', pct));
  end if;
  return jsonb_build_object('score', pct, 'correct', correct, 'total', total, 'passed', passed,
                            'status', case when passed then 'KNOWLEDGE_CHECK_PASSED' else 'NOT_TRAINED' end,
                            'message', case when passed then 'Knowledge check passed — supervised work only.'
                                            else 'Not passed yet. Review the approved SOP with a supervisor and try again.' end);
end $$;

-- A role-authorized human records observed practice and then explicitly approves independent work.
create or replace function ops.review_sop_competency(p_task_id uuid, p_staff_id uuid, p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t ops.tasks; me platform.staff; d kb.documents; c ops.staff_competencies;
        new_status text; event_name text;
begin
  if p_action not in ('SUPERVISED','PRACTICALLY_APPROVED','REJECT') then
    raise exception 'unknown competency review action' using errcode = '22023';
  end if;
  select * into t from ops.tasks where id = p_task_id for update;
  if not found then raise exception 'task not found'; end if;
  me := platform.require_staff(t.space_id);
  if me.role not in ('HOUSEKEEPING_SUPERVISOR','GENERAL_MANAGER') then
    raise exception 'housekeeping supervisor approval required' using errcode = '42501';
  end if;
  if p_staff_id = me.id then raise exception 'supervisors cannot approve their own competency' using errcode = '42501'; end if;
  if not exists (select 1 from platform.staff where space_id = t.space_id and id = p_staff_id and enabled) then
    raise exception 'employee must be enabled in this property' using errcode = '42501';
  end if;
  if t.required_sop_document_id is null or t.required_sop_version is null then
    raise exception 'task has no required SOP' using errcode = '22023';
  end if;
  select * into d from kb.documents
   where space_id = t.space_id and id = t.required_sop_document_id and version = t.required_sop_version
     and kind = 'SOP' and state = 'APPROVED_ACTIVE' and valid_during @> now();
  if not found then raise exception 'required SOP version is no longer current; reassessment required' using errcode = '55000'; end if;
  select * into c from ops.staff_competencies
   where space_id = t.space_id and staff_id = p_staff_id and sop_document_id = d.id and sop_version = d.version for update;
  if not found then raise exception 'employee has not completed the knowledge check' using errcode = '55000'; end if;

  if p_action = 'SUPERVISED' then
    if c.status <> 'KNOWLEDGE_CHECK_PASSED' then raise exception 'knowledge check must be passed before supervised practice' using errcode = '55000'; end if;
    update ops.staff_competencies set status = 'SUPERVISED', supervised_at = now(), supervised_by_staff_id = me.id
     where space_id = t.space_id and id = c.id returning * into c;
    new_status := c.status; event_name := 'SUPERVISED_PRACTICE_RECORDED';
  elsif p_action = 'PRACTICALLY_APPROVED' then
    if c.status <> 'SUPERVISED' then raise exception 'supervised practice must be recorded before practical approval' using errcode = '55000'; end if;
    update ops.staff_competencies set status = 'PRACTICALLY_APPROVED', practical_approved_at = now(), approved_by_staff_id = me.id
     where space_id = t.space_id and id = c.id returning * into c;
    new_status := c.status; event_name := 'PRACTICAL_APPROVED';
  else
    if c.status not in ('KNOWLEDGE_CHECK_PASSED','SUPERVISED') then raise exception 'no pending practical review' using errcode = '55000'; end if;
    update ops.staff_competencies set status = 'KNOWLEDGE_CHECK_PASSED', supervised_at = null, supervised_by_staff_id = null
     where space_id = t.space_id and id = c.id returning * into c;
    new_status := c.status; event_name := 'PRACTICAL_REJECTED';
  end if;

  insert into ops.training_events (space_id, task_id, target_staff_id, actor_staff_id, sop_document_id, sop_version, event_type)
  values (t.space_id, t.id, p_staff_id, me.id, d.id, d.version, event_name);
  return jsonb_build_object('status', new_status, 'staff_id', p_staff_id, 'sop_version', d.version);
end $$;

-- RLS follows the existing staff-read / server-write pattern. No browser direct writes to training state.
alter table ops.staff_competencies enable row level security;
alter table ops.staff_competencies force row level security;
alter table ops.training_events enable row level security;
alter table ops.training_events force row level security;
alter table ops.sop_quiz_questions enable row level security;
alter table ops.sop_quiz_questions force row level security;
drop policy if exists staff_read on ops.staff_competencies;
create policy staff_read on ops.staff_competencies for select to authenticated
  using (space_id in (select platform.my_space_ids()));
drop policy if exists staff_read on ops.training_events;
create policy staff_read on ops.training_events for select to authenticated
  using (space_id in (select platform.my_space_ids()));
-- No authenticated policy or grant for quiz definitions: answer keys remain server-side.
grant select on ops.staff_competencies, ops.training_events to authenticated;
revoke all on ops.sop_quiz_questions from authenticated, anon;
grant all on ops.staff_competencies, ops.training_events, ops.sop_quiz_questions to service_role;
grant usage on schema ops to authenticated, service_role;

revoke execute on function ops.get_sop_quiz(uuid) from public, anon;
revoke execute on function ops.submit_sop_quiz(uuid, jsonb) from public, anon;
revoke execute on function ops.review_sop_competency(uuid, uuid, text) from public, anon;
grant execute on function ops.get_sop_quiz(uuid) to authenticated, service_role;
grant execute on function ops.submit_sop_quiz(uuid, jsonb) to authenticated, service_role;
grant execute on function ops.review_sop_competency(uuid, uuid, text) to authenticated, service_role;

-- Upgrade the existing state transition entry point additively. Legacy tasks (no required SOP) retain their exact path.
create or replace function ops.task_action(p_task_id uuid, p_action text, p_expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t ops.tasks; me platform.staff; notice uuid; r ops.rooms;
begin
  select * into t from ops.tasks where id = p_task_id for update;
  if not found then raise exception 'task not found'; end if;
  me := platform.require_staff(t.space_id);
  if p_expected_version is not null and p_expected_version <> t.state_version then
    raise exception 'stale action: task is at version %', t.state_version using errcode = '40001';
  end if;

  if t.required_sop_document_id is not null and p_action in ('ClaimTask','StartTask','AttestCompleted') then
    if not exists (
      select 1
        from kb.documents d
        join ops.staff_competencies c on c.space_id = d.space_id and c.sop_document_id = d.id and c.sop_version = d.version
       where d.space_id = t.space_id and d.id = t.required_sop_document_id and d.version = t.required_sop_version
         and d.kind = 'SOP' and d.state = 'APPROVED_ACTIVE' and d.valid_during @> now()
         and c.staff_id = me.id and c.status = 'PRACTICALLY_APPROVED'
    ) then
      raise exception 'current SOP practical competency is required before claiming or performing this task' using errcode = '42501';
    end if;
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

revoke execute on function ops.task_action(uuid, text, bigint) from public, anon;
grant execute on function ops.task_action(uuid, text, bigint) to authenticated, service_role;

-- Close the alternate StartCleaning path for rooms whose open turnover task requires an SOP.
-- The room state machine and the supervisor-only MarkClean release rule remain unchanged.
create or replace function ops.room_action(p_room_id uuid, p_action text) returns jsonb
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
  if p_action = 'StartCleaning' and exists (
    select 1 from ops.tasks t
     where t.space_id = r.space_id and t.room_id = r.id and t.status in ('QUEUED','CLAIMED','IN_PROGRESS')
       and t.required_sop_document_id is not null
       and not exists (
         select 1 from kb.documents d
         join ops.staff_competencies c on c.space_id = d.space_id and c.sop_document_id = d.id and c.sop_version = d.version
        where d.space_id = t.space_id and d.id = t.required_sop_document_id and d.version = t.required_sop_version
          and d.kind = 'SOP' and d.state = 'APPROVED_ACTIVE' and d.valid_during @> now()
          and c.staff_id = me.id and c.status = 'PRACTICALLY_APPROVED'
       )
  ) then
    raise exception 'current SOP practical competency is required before starting this room turnover' using errcode = '42501';
  end if;
  insert into ops.room_events (space_id, room_id, from_state, to_state, staff_id)
  values (r.space_id, r.id, r.cleaning_state, target, me.id);
  update ops.rooms set cleaning_state = target where id = r.id returning * into r;
  if target = 'CLEAN' then
    for g in select c.id as conversation_id, p.full_name from guest_crm.stays s
             join guest_crm.profiles p on p.space_id = s.space_id and p.id = s.profile_id
             join contact_center.conversations c on c.space_id = s.space_id and c.profile_id = s.profile_id
             where s.space_id = r.space_id and s.room_id = r.id and s.status = 'BOOKED'
               and s.arrival_date = (now() at time zone 'Asia/Tbilisi')::date
    loop
      notice := contact_center.queue_guest_notice(g.conversation_id,
                  'Good news, ' || split_part(g.full_name, ' ', 1) || ' — your room ' || r.number || ' is cleaned, inspected and ready.');
    end loop;
  end if;
  return jsonb_build_object('room', to_jsonb(r), 'notice_message_id', notice);
end $$;

revoke execute on function ops.room_action(uuid, text) from public, anon;
grant execute on function ops.room_action(uuid, text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'ops' and tablename = 'staff_competencies') then
      alter publication supabase_realtime add table ops.staff_competencies;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'ops' and tablename = 'training_events') then
      alter publication supabase_realtime add table ops.training_events;
    end if;
  end if;
end $$;

commit;
