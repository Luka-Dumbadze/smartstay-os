# SmartStay Hackathon Implementation Report

## 1. Executive Summary

This implementation adds a narrow digital-onboarding and housekeeping-readiness workflow to the deployed root Next.js application. An employee can ask a Georgian-language question against the exact approved SOP version linked to a housekeeping task, complete a server-scored knowledge check, and wait for a supervisor to record observed practice and approve independent work. Only then can the employee claim, start, or attest completion of that linked task. The existing supervisor-controlled room inspection and release remains the final room-state authority.

The work is additive. Existing tasks with no linked SOP keep their current behavior; existing guest AI, Contact Center, Telegram, authentication, hash routes, tenant selection, task transitions, room states, and the separate Vite/FastAPI app were not intentionally changed.

The canonical root Next.js app passes `npm run typecheck` and the production webpack build. The user confirmed the configured Supabase project is disposable and contains no customer/production data. The additive migration and two guarded reset/seed cycles completed successfully. Three disposable Auth users were login-tested and linked to the synthetic staff rows with expected roles. Runtime checks verified all nine requested negative cases, RLS and tenant isolation, quiz-key protection, deterministic scoring, and safe competency/version boundaries. A grounded Georgian answer with an exact SOP v3 citation, no-evidence abstention and Gemini-disabled fallback were all exercised. Both full demo rehearsals completed from separate clean resets. Run 1 returned the grounded answer; during Run 2 Gemini was temporarily unavailable and the guide returned the current approved SOP excerpts plus its safe supervisor fallback, after which the deterministic training/task workflow still completed. Both runs ended with task COMPLETED and Room 12 CLEAN before the modeled 14:00 arrival. Persisted training/task/room history was verified in both runs, and Run 2 received Realtime changes for tasks, rooms, competencies and training events. Final typecheck and production webpack build pass. Status is READY for the hackathon prototype, with transient upstream Gemini availability recorded as a demo limitation.

## 2. Final Architecture

The existing application remains the system of record and its signed-in Supabase client remains the actor for staff mutations.

    Existing Next.js Operations view
      ├─ Reads rooms, tasks, stays, approved documents, competency and event rows under RLS
      ├─ POST /api/training/guide
      │    ├─ Authenticates current staff and RLS-reads task + linked SOP
      │    ├─ kb.search_hybrid → filters to exact current task SOP/version
      │    ├─ Gemini explains only retrieved excerpts; server validates citation IDs
      │    └─ Safe SOP/supervisor fallback on no evidence or model failure
      ├─ GET/POST /api/training/quiz → ops.get_sop_quiz / ops.submit_sop_quiz
      │    └─ Quiz answer key and score stay in database functions
      ├─ POST /api/training/practical → ops.review_sop_competency
      │    └─ Supervisor-only, explicit observed-practice then approval transition
      ├─ Existing POST /api/tasks/[id] → ops.task_action
      │    └─ Required SOP version + current PRACTICALLY_APPROVED competency gate
      └─ Existing POST /api/rooms/[id] → ops.room_action
           ├─ StartCleaning checks competency if an open linked SOP task exists
           └─ MarkClean remains restricted to housekeeping supervisor / general manager

The new SQL is in an additive migration after the existing base schema. The base schema file drops the Smartstay schemas and is explicitly for a new/demo project only; it must never be run against customer data.

The canonical deployed target is the root Next.js application. apps/frontend and apps/backend remain separate and untouched.

## 3. Existing Architecture Reused

Verified systems reused from the repository:

- Root app: Next.js App Router, React 19, TypeScript, Tailwind, lucide-react.
- Platform tenancy/auth: platform.spaces, platform.staff, auth.uid(), platform.my_space_ids(), platform.require_staff(), and the existing RLS tenant boundary.
- Operations: ops.rooms, ops.tasks, ops.room_events, ops.attestations, task state/version checks, and existing room state machine.
- Knowledge: approved/versioned kb.documents, kb.chunks and kb.search_hybrid, which already restricts retrieval to currently approved and time-valid documents.
- AI: existing lib/ai/gemini.ts provider wrapper and lib/ai/embed.ts query embedding with lexical retrieval fallback.
- UI: OperationsView, existing task/room actions, OsShell snapshot loading, authenticated browser Supabase reads, existing presence/realtime and polling fallback.
- Existing Next route handlers /api/tasks/[id] and /api/rooms/[id] keep their request shapes and call the same RPC names.
- Guest pipeline, Contact Center, Mia/Telegram guest behavior, analytics views, SignIn, and navigation/hash keys were left alone.

## 4. Changes Made

- db/migrations/20260925_housekeeping_readiness.sql adds the tenant-scoped competency/event/quiz model, nullable task SOP and arrival fields, quiz/review functions, task gates, a linked-room StartCleaning gate, RLS grants and realtime publication entries.
- db/demo/housekeeping_readiness_seed.sql adds an explicit opt-in synthetic Kakheti tenant, rooms, stays, staff, Georgian SOP v3, questions, initial competency records and Room 12 task. It does not attach Auth users.
- db/demo/housekeeping_readiness_reset.sql deletes only the KAKHETI-SYNTH-40 tenant and its seeded operational/training rows, behind an explicit custom-setting guard.
- app/api/training/guide/route.ts validates task membership, retrieves only the linked active approved SOP version, calls the existing Gemini wrapper for a structured Georgian explanation, validates source identifiers, abstains safely, and writes AI activity without storing question text.
- app/api/training/quiz/route.ts exposes the version-specific questions and submits answers to server-side scoring functions.
- app/api/training/practical/route.ts sends a supervisor decision to the role-checked database function.
- components/os/ui.tsx adds typed task arrival/SOP fields and competency/event snapshot types.
- components/os/OsShell.tsx reads competencies/events and subscribes to them when the migration is present. Missing new tables are treated as a migration-not-installed compatibility case so the existing workspace snapshot and realtime tables still load.
- components/os/OperationsView.tsx adds task-context SOP Q&A/citations, knowledge check, competency status, supervisor review actions, arrival deadlines, and operational pilot counters. It disables unqualified task actions in the UI; database functions remain authoritative.

No files were deleted. No changes were made under apps/frontend or apps/backend.

## 5. Database Changes

Migration: db/migrations/20260925_housekeeping_readiness.sql.

New columns on ops.tasks:

- required_sop_document_id and required_sop_version must be both null or both set; a linked SOP is permitted only on housekeeping tasks.
- arrival_deadline_at holds the modeled guest-arrival deadline independently of the existing task due_at.

New tables:

- ops.staff_competencies: one row per property/staff/document/version; status is NOT_TRAINED, KNOWLEDGE_CHECK_PASSED, SUPERVISED, or PRACTICALLY_APPROVED. Quiz score/attempt count, practice observer and approval actor/timestamps are recorded. Composite tenant foreign keys prevent cross-property references.
- ops.sop_quiz_questions: version-bound Georgian prompts/options and answer key. Authenticated users cannot select this table; only server-side functions return prompt/options or score answers.
- ops.training_events: tenant-bound event history for SOP views, AI outcomes, quiz attempts, supervised practice and practical decisions. It does not store employee question text.

New database functions:

- ops.get_sop_quiz(task_id) requires staff membership, checks current approved SOP state/range/version, records SOP_VIEWED and returns choices without answers.
- ops.submit_sop_quiz(task_id, answers) checks the current version and scores every answer in SQL. The pass threshold is 100%; a pass sets KNOWLEDGE_CHECK_PASSED only.
- ops.review_sop_competency(task_id, staff_id, action) requires an enabled employee and HOUSEKEEPING_SUPERVISOR or GENERAL_MANAGER, prevents self-approval, requires a prior knowledge pass, and enforces SUPERVISED before PRACTICALLY_APPROVED. Rejection returns the employee to knowledge-passed/supervised-only state and is audited.
- ops.task_action retains the existing state transitions and adds a check on ClaimTask, StartTask and AttestCompleted only when a task has a required SOP.
- ops.room_action retains the same room state machine and MarkClean role check. It adds a StartCleaning competency check only if an open room task explicitly requires an SOP. Legacy room actions with no such task follow the existing path.

RLS is enabled and forced on new tables. Staff can select only rows for properties in platform.my_space_ids(); browser clients receive no direct training-state write grants. Quiz key rows have no authenticated policy/grant. Staff writes happen through the guarded RPCs; the server-only AI route writes its minimal event using the service-role helper only after it has RLS-read the task and verified the current user’s enabled staff row.

Competency rows are never treated as valid for a different SOP version. A superseded, expired or non-current SOP causes the task/quiz functions to deny the action; the old competency remains historical but does not authorize work for a newer version.

## 6. Backend / API Changes

New endpoints:

- POST /api/training/guide accepts task_id and question (maximum 500 characters). It authenticates the user, RLS-reads the task and enabled staff membership, verifies the task's required SOP identity/version, runs knowledge search, and returns answer/abstention plus source title/version/section/chunk. It does not accept a space ID or score from the client.
- GET /api/training/quiz?task_id=... returns question prompts/options via ops.get_sop_quiz.
- POST /api/training/quiz accepts task_id and option selections; ops.submit_sop_quiz calculates score.
- POST /api/training/practical accepts task_id, staff_id and one of SUPERVISED, PRACTICALLY_APPROVED or REJECT. The SQL function—not the frontend—authorizes the role and transition.

Existing POST /api/tasks/[id] and POST /api/rooms/[id] retain their URL/body/action contracts. Their SQL RPC implementations are extended only for tasks/rooms with the new explicit SOP link.

## 7. AI Implementation

Input: authenticated staff question (1–500 characters) and task ID.

Retrieval: the route reads the task under the signed-in user's RLS context, obtains its exact required SOP ID/version, calls the existing kb.search_hybrid with lexical/vector query support, filters results to that exact document/version, and reads matching chunk ordinals/content under RLS. Search only returns currently approved/time-valid knowledge; a stale or unapproved document is rejected.

Generation: the existing Gemini wrapper receives only the question and up to five matching excerpts from the one SOP version. Structured output requires sufficient, answer, and source_chunk_ids. The server discards any cited ID outside the retrieved set and abstains if the answer is empty, lacks a valid citation, or reports insufficient evidence. The UI shows the document title, version, section ordinal and chunk ID with the excerpt.

Fallback: if retrieval has no matching source, Gemini is unconfigured/unavailable, or model output fails grounding checks, the endpoint returns no generated instruction. The UI displays the SOP/version where available, the excerpt where available, and tells the employee to use the approved SOP and ask the on-duty supervisor.

Human boundary: the model cannot decide competency, quiz score, eligibility, task state, room state or release. Those remain deterministic database/human actions. AI audit rows store event type and evidence count only, not question text.

Limitation: citation validation confirms that cited chunks came from the retrieved SOP, but it is not an independent semantic-entailment verifier. The response still depends on model compliance with the grounding instruction.

## 8. Frontend Changes

Operations remains the only migrated feature page. The Room 12 task card now has:

- arrival deadline and required SOP/version;
- current operator eligibility, including the exact “Knowledge check passed — supervised work only” status;
- a collapsible contextual Georgian SOP Guide;
- approved-source citations and safe abstention/provider fallback;
- a server-scored knowledge check;
- supervisor selection of an enabled room attendant and two-step supervised/practical approval;
- task claim/start/completion actions that remain the existing workflow;
- current-day arrivals/departures and observed training/readiness counters.

Room cards continue to use existing StartCleaning / MarkClean actions. StartCleaning is disabled in the UI for a linked task when the current operator lacks practical approval; the server enforces the same condition. MarkClean still requires the existing supervisor/manager role. No feature page beyond Operations was visually migrated.

Pilot counters are derived from persisted rows: stay dates, quiz/question/review events, approvals, knowledge-pass-to-approval duration, and linked task completion plus current room release before arrival_deadline_at. No GEL savings, trainer minutes, rework, or causal impact is claimed because this code has no reliable source for them.

## 9. Final Demo Workflow

1. Maka signs in to the synthetic property and opens Room 12's queued turnover task.
2. She opens the contextual SOP Guide and asks in Georgian what to do if a guest's personal item remains.
3. The guide answers only if the current SOP search provides supporting chunks; the UI shows Housekeeping Turnover SOP v3 and the supporting section/chunk. If not, it abstains and directs her to the SOP/supervisor.
4. Maka opens the knowledge check and submits both answers. The server returns the score. A pass displays “Knowledge check passed — supervised work only”; the task remains unavailable.
5. Ana signs in. She records that she observed supervised practice, then separately approves practical competency after observing safe performance. Each decision has an actor/time event.
6. Maka signs in again, claims the task, starts work and personally attests completion. Server-side ClaimTask, StartTask and AttestCompleted each require her exact-version practical approval.
7. Maka starts the existing Room 12 cleaning state. Ana inspects and uses the existing supervisor-only release to mark the room CLEAN. Room history and room status remain visible on Operations.

## 10. Demo Data

The separate seed script creates property code KAKHETI-SYNTH-40, fixed space ID e25b4000-0000-4000-8000-000000000001, labelled “SYNTHETIC DEMO · Kakheti Boutique Hotel (40 rooms)”. It creates room numbers 01–40, nine synthetic departures and eight synthetic arrivals dated for the seed day in Asia/Tbilisi, and one urgent Room 12 housekeeping task with a 14:00 arrival deadline.

Staff rows: Maka (seasonal ROOM_ATTENDANT, initially NOT_TRAINED), Ana (HOUSEKEEPING_SUPERVISOR), Tamar (ROOM_ATTENDANT with SOP v3 practical approval), and Levan (FRONT_DESK_LEAD). Each reset/seed cycle recreates the rows with null Auth `user_id`; after seeding, link only the three existing disposable Auth users. Both rehearsal fixtures were linked and role-verified. Never link real customer accounts.

The seed includes the Georgian Housekeeping Turnover SOP v3 with four searchable chunks covering entry/privacy, room checklist, guest belongings, and supervisor inspection/release. Its two knowledge-check questions ask about left belongings and who releases the room. The correct choices are stored in ops.sop_quiz_questions and are not returned to staff.

Run the reset script before each clean rehearsal, then run the seed script. Both scripts require the explicit `smartstay.allow_synthetic_demo` custom setting in the same SQL session and affect only the fixed synthetic property code. The initial attempts were safely rejected because the setting was omitted; the user subsequently reran both scripts successfully. Both Run 1 and Run 2 used separately verified fresh states.

## 11. Security / Permissions

- New data uses the existing property tenancy and composite foreign keys.
- Training reads use the signed-in Supabase client and existing RLS. A task ID from another tenant is not visible; each security-definer RPC calls platform.require_staff for the task’s property.
- The answer key is not selectable by authenticated users and is scored server-side.
- Practical review requires an enabled employee, a different authorized supervisor/manager, the exact active SOP version, and the expected preceding state.
- Task performance is gated server-side on every ClaimTask, StartTask and AttestCompleted transition. A UI-disabled control is not the security boundary.
- The separate room StartCleaning transition is gated for rooms with open SOP-linked tasks. MarkClean is unchanged and still supervisor/manager-only.
- No AI route can mark competency, claim/complete a task or release a room.
- The synthetic seed uses a separate property code and null Auth links; only the three disposable `.invalid` users were linked for the demo. Real login accounts must not be used as demo staff.
- Guest data, guest AI, Telegram, authentication rules, and tenant resolution code were not changed.

## 12. Tests Performed

Verification date: 2026-09-25. Results below distinguish build checks from runtime workflow tests. Static code inspection is not counted as runtime evidence.

| Test | Expected | Actual | Result |
|---|---|---|---|
| `npm run typecheck` | Root app typechecks | Reran in the root app; `tsc --noEmit` exited 0. | PASS |
| `npm run build -- --webpack` | Production webpack build completes and includes training API routes | Production build completed with type validation/page generation and listed guide, quiz and practical routes. The initial sandboxed subprocess `EPERM` was resolved by running with subprocess permission. | PASS |
| Lint / automated tests | Configured lint and test commands pass | `package.json` has no lint or test script; ESLint and a project test runner are not installed. | NOT AVAILABLE |
| Disposable project / base schema | Confirm the configured project is safe and base schema exists | User confirmed the project is disposable and has no customer/production data. Read-only probes found `platform.spaces`. | PASS |
| Migration | Additive training migration applies | User applied `db/migrations/20260925_housekeeping_readiness.sql` in SQL Editor without errors. Read-only probes verified all three training tables and added task columns. | PASS |
| Initial reset/seed attempts | Guard rejects invocations without same-session opt-in | Reset and seed each raised the exact guard error below before mutation. The user later reran both successfully with the opt-in. This is a recovered precondition error, not a remaining product failure. | PASS — guard behaved as designed; retry succeeded |
| Reset/seed before Run 1 | Fresh isolated fixture is created | Read-only probe showed synthetic property KAKHETI-SYNTH-40; four staff rows; Room 12 DIRTY; task QUEUED/version 1; SOP v3; Maka NOT_TRAINED/zero attempts; zero training events. | PASS |
| Reset/seed before Run 2 | A second reset returns the same isolated fixture to its initial state | Read-only probe showed Room 12 DIRTY/version 1, task QUEUED/version 1 with SOP v3, Maka NOT_TRAINED/zero attempts, and zero training events; only then were the same three disposable Auth users relinked. | PASS |
| Disposable Auth accounts and roles | Maka/Ana/Tamar can sign in and have the intended roles | All three password logins succeeded. Their existing synthetic Auth UUIDs were linked to the seeded rows and verified enabled: Maka ROOM_ATTENDANT, Ana HOUSEKEEPING_SUPERVISOR, Tamar ROOM_ATTENDANT. | PASS |
| Run 2 signed-in browser smoke | The authenticated production UI loads the synthetic property and Operations view | Headless Chrome signed in as disposable Maka, rendered the dynamic synthetic property and user identity, followed the existing Ops navigation button to `#/ops`, and showed the completed Room 12 task with SOP v3 and the 14:00 arrival context. This was read-only. | PASS |
| Negative A — Untrained worker | Claim and start denied; no state mutation | Direct task API calls as Maka returned HTTP 403/403; task remained QUEUED/version 1. Repeated from the clean Run 1 fixture with the same result. | PASS |
| Negative B — Quiz only | Knowledge pass does not authorize independent work | After server-scored 100% quiz, Maka claim/start returned HTTP 403/403; task remained QUEUED and competency stayed KNOWLEDGE_CHECK_PASSED. | PASS |
| Negative C — Non-supervisor approval | Unauthorized practical approval denied without competency mutation | Tamar (ROOM_ATTENDANT) received HTTP 403. | PASS |
| Negative D — Self approval | Supervisor cannot approve own competency | Ana self-approval received HTTP 403; Maka competency remained unchanged. | PASS |
| Negative E — Wrong tenant | Other-tenant task data hidden and action rejected | A temporary synthetic other-tenant row was not visible under RLS (0 rows); cross-tenant action returned HTTP 403; temporary test rows were removed. | PASS |
| Negative F — Stale SOP version | Old competency cannot authorize a superseded SOP | With the synthetic approved SOP temporarily changed to v4, v3 task guide returned HTTP 409 and Tamar claim returned HTTP 403; task stayed QUEUED. SOP v3 was restored, and the later reset/seed recreated v3. | PASS |
| Negative G — Quiz manipulation | Client cannot submit a score or malformed answers to grant competency | Forged score field did not grant a pass or change status; malformed/incomplete submission returned HTTP 400. Database computed the real score. | PASS |
| Negative H — Unauthorized room release | Attendant cannot invoke supervisor MarkClean | Maka received HTTP 403; room remained DIRTY in the negative-test fixture. | PASS |
| Negative I — Legacy task | No-SOP task retains the existing transitions | Synthetic legacy task Claim/Start/Attest returned HTTP 200/200/200 and ended COMPLETED. | PASS |
| Unauthenticated quiz API | Requests without a session are denied | GET returned HTTP 401. | PASS |
| Quiz answer-key protection | Authenticated client cannot read quiz answer keys | Quiz endpoint returned prompts/options without answer fields; direct authenticated table read was denied (`42501`). | PASS |
| Direct competency write | Browser role cannot write competency state | Authenticated direct update was denied (`42501`); status remained unchanged. | PASS |
| RLS property scope | Staff reads expose only their property | Maka saw the synthetic property and its four staff rows; the other tenant task returned 0 rows. | PASS |
| AI 1 — Grounded Georgian SOP answer | Concise Georgian answer cites exact current approved SOP/chunk | Live guide API returned HTTP 200, Housekeeping Turnover SOP v3, chunk `e25b4000-0000-4000-8000-000000000013` (section 3), and a Georgian answer grounded in that chunk. Repeated successfully during Run 1. | PASS |
| AI 2 — Insufficient evidence | Unsupported question abstains, gives no invented procedure, directs to supervisor | A question about QCD/the Lagrangian returned HTTP 200, `no_matching_evidence`, no answer or source chunks, and the approved-SOP/supervisor fallback. | PASS |
| AI 3 — Gemini unavailable | Provider failure shows cited SOP/supervisor fallback, no generated instructions | Ran a second production process with Gemini disabled only in that process. API returned HTTP 200, `ai_unavailable`, current SOP v3/source excerpts and the no-instructions fallback. No project env file was changed. | PASS |
| AI route state boundary | Guide cannot mutate task, room or competency | Run 1 before/after authenticated reads showed task QUEUED, room DIRTY and competency NOT_TRAINED unchanged by the guide call. | PASS |
| Full demo Run 1 after reset | Complete training-to-room-release scenario succeeds | Password-authenticated requests through the production Next.js routes and RLS-scoped Supabase client followed the full scenario: grounded answer/citation, 100% server quiz, quiz-only denial, Ana's supervised practice and practical approval, Maka claim/start/clean/attest, and Ana room release. Task COMPLETED and room CLEAN were recorded at 07:05 UTC, before the 10:00 UTC/14:00 Tbilisi deadline. | PASS |
| Run 1 persisted history | Training, attestation and room transitions are visible under RLS | Authenticated read returned QUESTION_ASKED, AI_ANSWERED, SOP_VIEWED, QUIZ_ATTEMPTED, KNOWLEDGE_CHECK_PASSED, SUPERVISED_PRACTICE_RECORDED and PRACTICAL_APPROVED; one task attestation; DIRTY → CLEANING → CLEAN room events. | PASS |
| Realtime event delivery | Realtime events are received for the full task/room/training sequence | The Run 1 test harness did not summarize delivery because it queried nonexistent `room_events.created_at` (the schema column is `at`). The complete Run 2 listener received changes for all four required tables. | PASS — Run 2 |
| Full demo Run 2 after reset | Complete workflow passes again from a separate reset/reseed | Password-authenticated production Next.js API requests and RLS-scoped Supabase reads followed the full workflow. Maka passed quiz and remained blocked until Ana's supervised-practice and practical approvals. Maka claimed/started/attested the task; Ana released the room. Task COMPLETED at 07:23:59 UTC and room CLEAN at 07:24:00 UTC, before the 10:00 UTC/14:00 Tbilisi deadline. Gemini returned `ai_unavailable` with exact SOP v3 source excerpts and no generated instructions; the safe fallback was shown and the operational flow remained usable. | PASS — safe fallback path |
| Run 2 history and Realtime | Persisted training/task/room history and live updates are visible | RLS reads showed question/AI/quiz/pass/practice/approval events, one task attestation, and DIRTY → CLEANING → CLEAN. Live Realtime callbacks arrived for `training_events` INSERT, `staff_competencies` UPDATE, `tasks` UPDATE and `rooms` UPDATE. | PASS |
| Run 2 AI state boundary | AI guide leaves task, room and competency state unchanged | The initial temporary verifier used the wrong result wrapper and flagged false; rerun with a corrected authenticated snapshot passed. Task remained COMPLETED, room CLEAN, competency PRACTICALLY_APPROVED before and after the guide call. | PASS — corrected rerun |

Runtime results: all 17 negative/security checks passed; all three AI branch checks passed across the live grounded answer, no-evidence abstention, and disabled-provider fallback; both reset-based operational runs reached task completion and supervisor room release; authenticated history passed for both; full four-table Realtime delivery passed in Run 2. One additional attempt to obtain a generated Gemini answer during Run 2 received the upstream high-demand 503 response. The endpoint returned the approved v3 evidence and safe fallback, and the workflow completed. The Run 2 state-boundary verifier initially had a test-harness result-wrapper error and passed when rerun correctly. No required behavior remains unverified; the residual external risk is Gemini availability during a live presentation.

Exact SQL errors from the first reset/seed attempts:

```text
Failed to run sql query: ERROR:  P0001: synthetic reset blocked: explicitly set smartstay.allow_synthetic_demo in this SQL session

CONTEXT:  PL/pgSQL function inline_code_block line 5 at RAISE
```

```text
Failed to run sql query: ERROR:  P0001: synthetic seed blocked: explicitly set smartstay.allow_synthetic_demo in this SQL session

CONTEXT:  PL/pgSQL function inline_code_block line 5 at RAISE
```

To pass the guard, prepend the exact `SET smartstay.allow_synthetic_demo = 'YES_I_AM_USING_A_DISPOSABLE_DEMO_OR_STAGING_PROJECT';` line before the full reset script and execute it as one SQL Editor request. Then repeat with the seed script in one request. Running the `SET` as a separate SQL Editor request is insufficient because the setting is session-local.

### Environment and deployment verification

- Canonical app: root Next.js App Router. The build output listed `/api/training/guide`, `/api/training/quiz`, and `/api/training/practical`. `apps/frontend/` and `apps/backend/` were not changed.
- The root `.env.local` contains the variable names `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GEMINI_API_KEY`. Values were not copied into this report. Presence does not establish that credentials are valid or that the target is safe for synthetic writes.
- The user confirmed the configured remote project is disposable and contains no production/customer data. The migration is applied. Two guarded reset/seed cycles and both demo rehearsals completed. Three disposable Auth users exist, sign in, and were linked to the synthetic staff rows with expected roles. Gemini grounded, abstention and provider-failure paths were exercised against the demo SOP.
- Synthetic Auth users created: Maka — `maka.demo.57bcb5fe@smartstay.invalid`, UUID `e571fa92-698f-4ee1-8258-5baab388bdd1`; Ana — `ana.demo.57bcb5fe@smartstay.invalid`, UUID `3fc582a2-5c68-4fa4-98c2-abafc8cc2749`; Tamar — `tamar.demo.57bcb5fe@smartstay.invalid`, UUID `6e745640-3cc8-4c14-a685-ba7455d38933`. These are synthetic addresses. Random passwords are stored only in `/tmp/smartstay-demo-auth.json` (mode 0600), not in the repository or this report.
- `.env.local` has the Supabase URL, anon key and service-role key, but no `SUPABASE_ACCESS_TOKEN` or `SUPABASE_DB_PASSWORD` is available. The service-role key authorized the three synthetic Auth account creations and PostgREST reads; it cannot run the arbitrary SQL reset/seed scripts. The user is executing these guarded SQL files in SQL Editor.
- A local PostgreSQL server was not available (`pg_isready` reported no response), Docker daemon access was denied, and Supabase CLI was unavailable.
- Required order for a confirmed empty disposable project: apply `db/supabase_master_schema.sql` only if the base schema is absent; then apply `db/migrations/20260925_housekeeping_readiness.sql`; create disposable Auth users and link their UUIDs to the synthetic staff rows; finally run `db/demo/housekeeping_readiness_reset.sql` followed by `db/demo/housekeeping_readiness_seed.sql`. Set `smartstay.allow_synthetic_demo` to the exact opt-in value documented in both scripts in the same SQL session before each guarded reset/seed. Never run the base schema against an existing/customer database.
- Available root commands are `npm run typecheck`, `npm run build` and `npm run build -- --webpack`; no lint/test script exists. The default Turbopack build previously failed in this host while binding an internal port; the required webpack build passed in this verification session after allowing its TypeScript subprocess.

## 13. Known Issues

- Both separate reset-based rehearsals completed. Full Realtime updates for tasks, rooms, competencies and training events were observed in Run 2. Run 1's initial verifier did not collect a complete event summary because of its incorrect history-column query; Run 2 provides the full Realtime evidence.
- No local PostgreSQL service, accessible Docker daemon or Supabase CLI was available. The user executes guarded SQL in the disposable project's SQL Editor. Reset/seed durations and manual operator time were not measured.
- The two complete stateful rehearsals used real disposable Auth sessions against the local production Next.js routes and the live synthetic Supabase tenant; a separate headless Chrome smoke verified sign-in, the property context and navigation to `#/ops`. No reusable browser automation suite is configured, so all individual task/quiz/review/room actions were exercised through authenticated APIs rather than a click-by-click browser script.
- The first SQL Editor reset and seed attempts omitted the session opt-in and returned the guard errors recorded in Section 12. Both scripts later completed successfully with the opt-in; the guard worked as intended and no customer data was touched.
- Seed dates are generated dynamically from the current Asia/Tbilisi date; Room 12's arrival deadline is 14:00 local time on that date. Both rehearsals completed before that modeled deadline.
- Georgian SOP language/content and quiz choices are synthetic hackathon material and need operational review by a Georgian-speaking hotel supervisor before a real pilot.
- The AI answer uses prompt constraints plus allowlisted citations, not a formal entailment checker. Keep the fallback visible and have a supervisor validate high-risk answers during a pilot. Gemini returned a transient 503/high-demand response for one additional query; the endpoint safely fell back, while the grounded answer and explicit no-evidence path both passed separately.
- The basic metric panel measures workflow events and timings; it does not prove time savings or financial impact. Collect a baseline/control period before making ROI claims.
- No PMS/Channel Manager/POS integration was added. Arrival and task deadline data are manually present in the synthetic database for this prototype.
- Temporary verification harness issues were corrected: a history query used nonexistent `room_events.created_at` instead of `at`; an immediate retry omitted `room_id` from its selected task columns before using it; and one AI state-boundary assertion expected a `{data}` wrapper from a helper that returned rows directly. Corrected authenticated queries/assertions passed; these were test-harness defects, not application/database defects.
- Gemini returned upstream 503/UNAVAILABLE high-demand responses during Run 2's generated-answer attempts. The guide safely returned approved SOP v3 excerpts, citation metadata and the supervisor fallback; the room-readiness workflow remained usable and completed. A grounded Gemini answer had passed in Run 1. For a live presentation, this external provider availability is the remaining operational risk.
- The default Turbopack build previously could not run in this host because it could not bind its internal port. The required production webpack build passed on 2026-09-25 after retrying outside the child-process restriction.
- No lint/test scripts are defined in package.json. Typecheck and webpack production build are available and have passed.

## 14. Remaining Hackathon Tasks

1. For the live demo, confirm Gemini availability shortly before presenting; if it is unavailable, use the verified cited-SOP/supervisor fallback without claiming a generated answer.
2. Have a Georgian-speaking hotel supervisor review the synthetic SOP and quiz before any real pilot.
3. For pilot claims, establish a measured baseline for trainer minutes, time-to-competency, room readiness and rework; agree the arrival feed and SOP-version reassessment process with the hotel.

## 15. Recommended 90-Second Demo Script

- 0–10s: Show the synthetic Kakheti property, 9 departures, 8 arrivals and Room 12 due at 14:00.
- 10–28s: Sign in as Maka, open the Room 12 task, ask the SOP Guide in Georgian about a guest's left item. Point to the v3 source/chunk citation.
- 28–40s: Submit the two-question check. Show the score and the “supervised work only” state; attempt to claim and show that the task is still blocked.
- 40–55s: Sign in as Ana. Record observed supervised practice, then explicitly approve independent work.
- 55–73s: Sign back in as Maka, claim/start the task, start Room 12 cleaning and attest task completion.
- 73–85s: Sign in as Ana, inspect and release Room 12 through the existing supervisor-only room action.
- 85–90s: Show the room state/history and recorded pilot counters. State clearly that all scenario data is synthetic and savings are not yet claimed.

## 16. File Change Manifest

Created by this implementation:

- app/api/training/guide/route.ts — authenticated grounded SOP guide/fallback.
- app/api/training/quiz/route.ts — versioned quiz read and submission API.
- app/api/training/practical/route.ts — supervisor practical-review API.
- db/migrations/20260925_housekeeping_readiness.sql — additive task fields, competency/audit/quiz tables, RLS, realtime and server gates.
- db/demo/housekeeping_readiness_seed.sql — opt-in isolated synthetic tenant fixture.
- db/demo/housekeeping_readiness_reset.sql — opt-in synthetic tenant reset.
- SMARTSTAY_HACKATHON_IMPLEMENTATION_REPORT.md — this handoff.
- SMARTSTAY_HACKATHON_STATUS.md — concise status.

Modified by this implementation:

- components/os/OperationsView.tsx — contextual guide, check, supervisor approval and readiness signals.
- components/os/OsShell.tsx — competency/event reads and conditional realtime subscriptions.
- components/os/ui.tsx — task/training snapshot types.

Deleted: none.

The workspace was already dirty before this task. Pre-existing edits retained without intentional changes include the Batch 1/2 shell files (app/globals.css, app/layout.tsx, components/os/BottomDock.tsx, components/os/Header.tsx, components/os/LeftRail.tsx, components/os/SignIn.tsx, tailwind.config.ts), components/os/primitives.tsx, docs/DESIGN_SYSTEM.md, docs/ui-migration-plan.md, docs/gita_35_rubric.md, research/challenges/, and tsconfig.tsbuildinfo. These are not part of this implementation's feature change.

## 17. How Another AI Should Continue

Treat this report and the repository as the implementation record. The canonical app is the root Next.js project; `apps/frontend/` and `apps/backend/` were not modified. The user confirmed the configured Supabase project is disposable and contains no customer data. The base schema was present and migration `db/migrations/20260925_housekeeping_readiness.sql` is applied. Three disposable Auth accounts already exist and their logins/roles passed; their IDs and the local-only credentials-file path are in Section 12. Do not recreate accounts. The user successfully completed guarded reset/seed for Run 1, and the Run 1 scenario and history passed. The current DB reflects that completed run, not a clean state.

The required runtime verification is complete: migration, two guarded reset/seed cycles, account linking, negative cases, AI grounding/abstention/provider fallback, two full operational workflows, persisted history, Run 2 Realtime delivery, a signed-in browser smoke check, typecheck and production webpack build all have runtime evidence in Section 12. Status is READY for the hackathon prototype. Gemini had intermittent upstream 503/high-demand responses in Run 2; the safe approved-source fallback was verified and the task-to-room workflow remained usable. Before the live demo, check provider availability and use the fallback honestly if it is still unavailable. Do not recreate Auth users. Do not change guest AI, route/hash behavior, tenancy, existing task state semantics, or supervisor MarkClean permission. Keep any future changes small and limited to the root Next.js app; do not edit apps/frontend or apps/backend.

Do not change guest AI, route/hash behavior, tenancy, existing task state semantics, or supervisor MarkClean permission. Keep any bug fix limited to the existing training workflow and root Next.js app. Never claim a live, AI or DB behavior without runtime evidence against the disposable project.
