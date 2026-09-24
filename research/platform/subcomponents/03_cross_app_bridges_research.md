# Sub-Component C — Cross-App Change Requests and Integration Bridges (CR1–CR14)

**Empirical micro-research and proof of concept · 24 September 2026 · PostgreSQL 16.15 · SmartStay Kakheti hospitality platform**

This report designs and tests the minimal, non-breaking extensions that close the one-sided and missing contracts identified in `00_master_kernel_research.md` §8. It also covers the App 5 authorization defects F1–F3 found by Sub-Component A (`01 §5.6`). Everything ran in disposable PostgreSQL 16 clusters under `/tmp`.

The bridge SQL (Appendix A), the kernel revision (Appendix B) and the two JSON Schemas (Appendix C) are **experimental fixtures, not master DDL**. No locked dossier, contract file or dossier-embedded DDL was edited. Every change is applied on top of the unmodified locked DDL inside throwaway databases.

## 0. Status, evidence and environment

**Result:**

- **Bridge suite:** 51 of 51 checks passed (§1–§4).
- **Zero-regression gate** (§5), all against the bridged schemas:
  - every published locked app suite passes unchanged (47 / 43 / 17 / 59 / 11);
  - the Sub-Component B suite passes 43 / 43;
  - the Sub-Component A suite passes everywhere except **three checks that were written to demonstrate defects this phase fixes**, and which therefore invert as intended.

All of this comes from one clean end-to-end run of `run_all.sh`, which rebuilds everything from the pristine locked DDL. It was then reproduced from this document alone (§8).

**Labels:** **[O]** observed in this investigation's runs; **[L]** stated in a locked dossier (`NN:Lnnn`); **[A]/[B]** established by Sub-Component A (`01`) or B (`02`); **[I]** inference or recommendation.

**Environment [O]:**

- **Server:** PostgreSQL `16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)` with pgvector 0.8.6, using the relocated local binaries from `01 §0`. Nothing was installed system-wide.
- **Cluster:** a fresh cluster at `/tmp/bridges.BRU00w`, reachable only through a private Unix socket on port 55466, with no TCP. `trust` authentication applies only inside that owner-only directory.
- **Reused artifacts:** the Sub-A artifacts (`prepare.py`, `kernel_experiment.sql`, `test_kernel.py`) and Sub-B artifacts (`mesh_experiment.sql`, `build_base.py`, `test_mesh.py`) were extracted byte-for-byte from reports 01 and 02, with hashes matching `01 §7` and `02 §8`.

**Read-only inputs (verified unchanged after writing):**

| Input | SHA-256 |
|---|---|
| `research/platform/00_master_kernel_research.md` | `8f2a8c41a70cf9bb73716422abd1d4faf4f3390d2354c902628fd68f2e0f688c` |
| `research/platform/subcomponents/01_kernel_iam_research.md` | `08174bea0edaf1db815003c5c8530da37fdd30047cdd8f417a8c6bcff0fb2802` |
| `research/platform/subcomponents/02_event_mesh_research.md` | `c897ae17140c4ec55286b6acb864d1b7a035df818b2ee210352e4bd3ae0f037b` |
| `research/apps/01_contact_center_dossier.md` | `d60c9100092e275a9a4165e5a139f3f7e5c96273dbec53e6a18f234b485edd65` |
| `research/apps/02_guest_crm_dossier.md` | `e7481fcce7303cb55864ddfaac5c6f2bd8b4d2458eb427f6d3a286c815b7f2fb` |
| `research/apps/03_operations_task_dossier.md` | `e0de5d8b68a4ff106d164dfdf39790213d7b83b4e2b372d8ba875946419f5c1b` |
| `research/apps/04_storage_knowledge_dossier.md` | `fb7d4c8dee0e5ab423421a548716b83452560f99ebb5ff863bb1ea7acaaa870a` |
| `research/apps/05_ai_team_agent_core_dossier.md` | `d3bb193d0be03f0f78bd9b7b263a571cd04fd5e6d75f86045348f232e78dd97e` |

### 0.1 What "non-breaking" means here, precisely [O]

Every extension is one of the following, and nothing else:

1. **New objects** in the owning app's schema (tables, functions, triggers). Each is owned by a `NOSUPERUSER NOBYPASSRLS` bridge owner (`cc_bridge_owner`, `crm_bridge_owner`) or by the app's own locked owner role (`ops_owner`, `kb_owner`, `ai_owner`). Every new table has `ENABLE` + `FORCE` RLS.
2. **`ALTER FUNCTION … SET search_path`** on existing App 1 and App 2 functions. The function bodies are unchanged.
3. **Two nullable columns plus constraints:**
   - `contact_center.participants.disabled_at` / `disabled_reason`;
   - `workforce.ai_members.auth_subject` with a partial unique index.
4. **`CREATE OR REPLACE` of exactly two locked functions, with identical signatures, owners and grants:**
   - `ops.actor()` (CR8);
   - `workforce.resume_session(uuid, bigint)` (F1), whose body is unchanged except the authorization predicate.

No locked column, constraint, JSON contract or API was removed or narrowed. One further switch, `@@cr12_f3_enforce` (`auth_subject NOT NULL`), *is* breaking by design. It is kept separate and tested as an expected break (D.08).

### 0.2 Numbering note

The brief groups "CR4" with the operator `disabled_at` flag. In `00 §8`, **CR4** is App 1's *authorized redaction procedure*. The `disabled_at` flag is Sub-A's finding **F4** (`01 §5.6`). This report implements the flag the brief asked for (§1.2) and records the redaction procedure as still open (§6), rather than blur the two.

---

## 1. App 1 bridges

### 1.1 CR5 — pin `search_path` on every App 1 and App 2 function

**Problem [L/B].** App 1 and App 2 functions are security-invoker with **no pinned `search_path`** (`01:L245`, `02:L265`). Sub-B hit this in practice (`02` H4): App 1's outbox trigger `allocate_event()` resolves `conversations` through whoever calls it.

**Bridge.** `ALTER FUNCTION … SET search_path = pg_catalog, contact_center, pg_temp` for all 16 App 1 functions, and the `guest_crm` equivalent for all 13 App 2 functions, trigger functions included. The bodies are untouched.

| # | Result [O] |
|---|---|
| A.01 | **Negative control, hijack on locked App 1.** A caller with an attacker schema first on its path (`evil.conversations` holding `next_event_seq = 990`) caused a real App 1 outbox row to receive **`event_seq = 990` from the attacker's table.** The FK still pointed at the real conversation, so the forgery committed. This is a sequence-forgery vector against the gap-free ordering Sub-B relies on |
| A.02 | Bridged: the same attempt allocates `event_seq = 1` from `contact_center.conversations` |
| A.03 | A producer whose path is only `pg_catalog` fails on locked App 1 (`relation "conversations" does not exist`, Sub-B H4) and succeeds once pinned |
| A.04 | `contact_center` 16/16 and `guest_crm` 13/13 functions carry a pinned `search_path` |

**Severity note [I].** Exploiting A.01 needs a role that can create objects in *some* schema and insert App 1 events. PostgreSQL 15+ removes `CREATE` on `public` by default, and the schema-per-app design grants `CREATE` narrowly. Even so, a bridge owner, migration role or plugin schema would suffice. CR5 closes the vector at essentially zero cost.

### 1.2 CR4 as briefed (Sub-A F4) — disabled operators

**Bridge.** `participants.disabled_at` and `disabled_reason` (both-or-neither; operators only) plus one `BEFORE INSERT` trigger function attached to `hitl_sessions` (claims), `control_history` (every control change) and non-inbound `messages` (sends and internal notes). The locked `change_control` and `allocate_message` are unchanged; the trigger aborts their transaction.

| # | Result [O] |
|---|---|
| A.05 | Only operators can be disabled, and every disable carries a reason |
| A.06 | A disabled operator's claim is rejected (`operator … is disabled`); an enabled colleague's claim through the unchanged `change_control` succeeds |
| A.07 | An operator disabled *while owning* a conversation can no longer send; guest inbound messages keep recording |

**A defect caught by the regression gate [O].** The first version used one `CASE` over `NEW.operator_id` / `NEW.actor_id` / `NEW.direction`. PL/pgSQL resolves every `NEW.field` in an expression, so on a `control_history` row it failed with `record "new" has no field "operator_id"`. That broke App 1's own `change_control`.

The locked App 3/4/5 suites could not see this, because App 1 publishes no behavioral suite. **The Sub-B suite, which drives real App 1 functions, caught it** (§5). The fix branches per table.

### 1.3 CR2 — the resolved-snapshot manifest

**Contract [L].** App 2 needs `GET /v1/internal/conversations/{id}/resolved-snapshots?control_version={v}`. It must return an exact `guest-crm/resolved-snapshot-manifest/1`, or 409/410, and must *never* substitute the latest transcript (`02:L150`, `L769`, schema `02:L2242`). The source must capture the manifest in the resolution transaction or reconstruct it exactly.

**Bridge (App 1-owned):**

- **Capture.** An `AFTER INSERT` trigger on `contact_center.outbox_events` fires only on the `ConversationControlChangedEvent` row that `change_control()` appends with `state = RESOLVED`. The capture therefore runs **in the resolution transaction** and knows the **exact event ID and control version**.
- **What is frozen.** A header row (guest participant, reservation, binding status and version) and one row per chapter:
  - `through_seq`;
  - `source_revision` = 1;
  - a SHA-256 digest over guest-visible messages (inbound and outbound) up to `through_seq`;
  - `first_ingested_at`;
  - `source_expires_at` = first ingestion + 180 days, App 1's proposed transcript retention (`01:L755`).
- **Endpoint.** `contact_center.resolved_snapshot_manifest(conversation, control_version)` serves the frozen manifest after re-verifying each digest against the immutable messages. Errors use dedicated SQLSTATEs: **`SNP09` maps to HTTP 409, `SNP10` to 410.**

| # | Result [O] |
|---|---|
| A.08 | The captured manifest validates against App 2's locked `resolved-snapshot-manifest/1` |
| A.09 | It carries the exact RESOLVED event ID and control version; the `messages` rows hash identically before and after capture |
| A.10 | `through_seq` covers guest-visible traffic only: 2 inbound + 1 outbound. The internal staff note (seq 4) is excluded from the digest and from what App 2 may extract |
| A.11 | **The digest is TimeZone-independent.** Timestamps are canonicalized to UTC inside the digest; the same chapter hashes identically under `UTC` and `Asia/Tbilisi` and equals the captured digest. A naive `jsonb` timestamp would render in the session's time zone and silently change the digest |
| A.12 | Reopen → new guest message ("a bottle of Saperavi") → resolve again: the **v1 manifest is byte-identical** (`through_seq` 3), and v3 is a separate, longer snapshot (`through_seq` 5) |
| A.13 | 409 cases: no snapshot at a non-resolution version, an unverified reservation binding (the schema requires `binding_status = verified`), and another tenant under RLS. None falls back to anything |
| A.14 | The error carries SQLSTATE `SNP09` for the HTTP mapping |
| A.15 | Captured snapshots reject update and delete |
| A.16 | After the source passes its retention deadline, the manifest answers `SNP10` / 410 (simulated clock). The same path answers once a redaction procedure alters a digested message |

### 1.4 CR1 — App 1 consumer for App 4 policy events

**Contract [L].** App 4 publishes `PolicyApprovedEvent`, `PolicySupersededEvent` and `PolicyArchivedEvent` (identifiers and digests only; content comes from its read API, `04:L230`). App 1 has a local `knowledge_items` table with no consumer, no policy state and no tombstones (`04:L228`). Supersession emits two events at one epoch, which the consumer must stage atomically (`04:L1407`). A gap requires a snapshot reconcile before AI dispatch resumes (`04:L230`).

**Constraint discovered in the DDL [O].** App 1's `knowledge_items` has an **unconditional** GiST exclusion on `(space, policy_key, locale, valid_during)`. App 4's equivalent applies only to `APPROVED_ACTIVE` rows. App 1 therefore cannot keep a superseded or archived row's original window. The consumer must **shorten** the predecessor *before* inserting the successor, and cut an archived item's window at the archive instant.

**Bridge (App 1-owned, plus a read-only App 4 extension):**

| Object | Role |
|---|---|
| `kb.approved_item_content(item)` | SQL form of App 4's `GET /approved/{item}` (`04:L627`); definer, owned by `kb_owner`, tenant-scoped |
| `kb.approved_items_snapshot()` | App 4 truth for reconciliation |
| `contact_center.knowledge_item_state` | per-item state, `state_version`, epoch and tombstone |
| `contact_center.knowledge_projection` | per-property epoch watermark and **AI dispatch fence** |
| `contact_center.policy_event_inbox` | dedupe with payload hash |
| `contact_center.policy_event_stage` | durable staging for out-of-order and gapped events |
| `contact_center.apply_policy_events(jsonb)` | consumer entry point |
| `contact_center.reconcile_knowledge()` | the only way to lift a fence |
| `contact_center.evidence_servable(item, version, at)` | dispatch-time gate for App 1's three-field evidence |
| `contact_center.invalidate_ai_evidence(...)` | cancels queued AI replies citing withdrawn items |

All tests use **the 12 real events emitted by App 4's own locked suite**:

- 10 `PolicyApprovedEvent`, 1 `PolicySupersededEvent`, 1 `PolicyArchivedEvent`, across epochs 2–12;
- the supersession pair at epoch 7 is `menu.cellar` v1 → v3;
- v3 is archived at epoch 8.

| # | Result [O] |
|---|---|
| A.17 | An approval whose reviewer has no App 1 participant is refused (`APPROVER_NOT_PROJECTED`), and nothing is applied: "map the reviewer to a real participant; do not invent a placeholder actor" (`04:L228`). With the kernel's member-UUID model (`01 §5.3`), the reviewer's participant is the kernel projection |
| A.18 | All 12 events apply in epoch order, with the pair delivered as one group. App 1's projection equals App 4's truth exactly: same IDs and identical `valid_during` for active and superseded items |
| A.19 | The **approved-then-archived** `menu.cellar` v3 keeps its history row, its range cut **exactly** at the archive instant, plus a tombstone; it is never servable afterwards |
| A.20 | Right after the supersession, the gate serves the successor and refuses the predecessor. After the later archive, it refuses the successor too |
| A.21 | Exact redelivery is `DUPLICATE`; a reused event ID with altered content is rejected; an older `state_version` is `STALE` |
| A.22 | **Successor delivered before predecessor:** the insert hits the exclusion constraint, so it is `STAGED`, then applied atomically right after the predecessor shortens (`APPLIED_FROM_STAGE`). The final state is identical |
| A.23 | **Epoch gap** (7 and 8 skipped, 9 delivered): the event is staged durably, so the relay may safely acknowledge it; the property's AI dispatch is **fenced**; and even previously valid evidence stops being servable |
| A.24 | While items are missing, reconcile refuses to lift the fence (`STILL_FENCED`: 4 missing or stale, 1 staged). After the gap fills, the staged epoch 9 drains automatically, and reconcile verifies App 1 against App 4's snapshot and lifts the fence |
| A.25 | Applying the supersession **cancels the queued AI reply that cited the predecessor** ("Our 2022 Saperavi is 85 GEL per bottle") with `EVIDENCE_WITHDRAWN`, an App 4 error code (`04:L631`). An unrelated queued reply is untouched |
| A.26 | **End-to-end through the Sub-B R1 relay:** a mesh route delivers all 12 real App 4 events to this consumer. 12/12 are acknowledged, 12 inbox rows exist, and the projection equals App 4 truth |

**Two requirements this surfaced [O]:**

1. **App 4's read API must serve every *once-approved* version, not just currently active ones.** Replaying the epoch-7 approval of `menu.cellar` v3 after its epoch-8 archive failed (`APPROVED_CONTENT_UNAVAILABLE`) while the read function filtered on the current state. App 4's revisions are sealed and immutable (`04:L374`), so serving them is safe. The fix keys on `approved_at IS NOT NULL`. **This is a requirement on App 4's `GET /approved/{item}`.**
2. **Epoch bootstrap.** App 4 creates every property at `knowledge_epoch = 1`. App 1's projection must start at 1, not 0, provisioned together through the kernel (`01 §3.1`). Otherwise the first real event looks like a gap.

---

## 2. App 2 privacy bridges

### 2.1 CR6 — dynamic recipient registry and the receipt-return contract

**Problem [L/O].** `erase_profile()` hardcodes five recipients: `contact_center, operations, cache_search, object_store, backup_ledger` (`02:L638`). It has **no `workforce` and no `kb`**, and no contract by which recipients report back (`00` F6 / F7).

**Bridge, with `erase_profile()` unmodified:**

- `guest_crm.erasure_recipient_registry`, kernel-managed: the five `LEGACY` codes plus `workforce` and `kb` as `KERNEL` codes. `erasure_receipts.system_code` has no CHECK constraint, so this is pure data.
- A **statement-level `AFTER INSERT` trigger with a transition table** on `erasure_receipts`. After `erase_profile` inserts its five rows, it adds every other enabled registry recipient for the same request, **in the same transaction**. `pg_trigger_depth()` stops the trigger re-firing on its own insert.
- `guest_crm.record_erasure_receipt(request, system, outcome, detail_code)`:
  - accepts terminal outcomes only;
  - requires a reason code for `lawful_restriction`;
  - is idempotent;
  - never lets a terminal receipt flip;
  - drives `erasure_requests.state`: `propagating` → `complete`, or `exception_review` on any failure;
  - writes an append-only receipt log.

| # | Result [O] |
|---|---|
| B.01 | Every erasure created by the **unmodified** `erase_profile()` now carries **7** recipients, including `workforce` and `kb` (4 of 4 requests in the test bed) |
| B.02 | **Negative control:** the same function on locked App 2 creates only the five hardcoded recipients |
| B.03 | The receipt contract rejects non-terminal outcomes, unregistered recipients, and a lawful restriction without a reason code |
| B.04 | The state stays `propagating` until all 7 recipients are terminal, then becomes `complete` (with `backup_ledger` → `lawful_restriction`, `BACKUP_ROTATION_WINDOW`). Replays return `DUPLICATE`; a terminal receipt cannot flip |
| B.05 | One `failed` recipient moves the request to `exception_review`, never to `complete` |
| B.06 | A recipient registered later (`analytics`) applies to new erasures only (8 receipts); existing requests keep their 7 |

### 2.2 CR7 — `$id` schemas for App 2's privacy events

Appendix C holds two Draft 2020-12 contracts:

- `https://schemas.smartstay.example/guest-crm/profile-changed-event/1`
- `https://schemas.smartstay.example/guest-crm/profile-erasure-requested-event/1`

Both follow App 2's documented envelope mapping (`crm_outbox.id → event_id`, `event_type → type`, `space_id`, `created_at → occurred_at`, `causation_id`, `schema_version`, `payload → data`). Their closed payloads are exactly those in `02:L738`.

- `ProfileChangedEvent` requires a non-null `causation_id`, because the outbox CHECK demands it for every non-erasure event (`02:L470`).
- Erasure allows a null `causation_id`: it is a root command.

| # | Result [O] |
|---|---|
| B.07 | All 5 real `ProfileErasureRequestedEvent`s written by `erase_profile()` validate, including one with a linked App 1 subject in `source_subjects` |
| B.08 | A `ProfileChangedEvent` row built exactly per `02:L738` validates. The closed payloads reject: an extra field (`loyalty_band`), an unknown reason (`emotion_detected`), a zero epoch, a missing causation, and a malformed `subject_id` |

---

## 3. App 3 bridges

### 3.1 CR8 — `app.actor_id` accepted alongside `app.staff_id`

`ops.actor()` is replaced with the same signature, owner and grants. It returns `coalesce(app.staff_id, app.actor_id)` and **raises `42501` when both are set and disagree**.

| # | Result [O] |
|---|---|
| C.01 | `app.actor_id` alone works; equal alias values work; disagreement fails closed; with neither set, the result is `NULL` |
| Z1 | The locked App 3 suite, which sets only `app.staff_id`, passes 47/47 unchanged |

This **supersedes** Sub-A 2.14 (actor ID alone → App 3 actor NULL) and 2.16 (silent divergence). Both inverted in the regression run (§5), as intended.

### 3.2 CR9 — consumer for App 1's `GuestRequestChangedEvent` (amend / cancel)

**Contract [L].**

- App 1's event shape is `request_id`, `request_version`, `change_kind ∈ {amend, cancel}`, `source_message_ids`, `reason`, and `replacement` (the full request for amend, `null` for cancel) (`01:L2044–2120`).
- App 3's own specification (`03:L699–701`) requires:
  - the same advisory lock as ingestion;
  - dedupe by event ID and hash;
  - exactly the next revision (never infer a gap);
  - archiving the old scope;
  - incrementing `state_version`;
  - invalidating all outstanding tokens;
  - unstarted cancel → `CANCELLED` plus a `cancelled` callback carrying the new revision;
  - in-progress cancel → a stop-confirmation workflow, never asserting the work ceased;
  - a completed task is never rewritten;
  - completion under the previous revision must fail.

**Bridge.** `ops.apply_request_change(event, sha256)`, granted to `ops_integration`, and `ops.confirm_stop(task, expected_version)`, granted to `ops_human`. Both are owned by `ops_owner`. The locked `guard_task` trigger and `staff_action` are unchanged.

Token revocation needs no new mechanism. `staff_action` already rejects any token whose `expected_version` differs from the task's `state_version` (`'expired or stale action'`), so bumping `state_version` revokes every outstanding token. The consumer also expires tokens explicitly.

| # | Result [O] |
|---|---|
| C.02 | The constructed amend and cancel events validate against App 1's locked `outbox-event/1`, including the `GuestRequestChangedEvent` `$defs` |
| C.03 | **Amend a queued task** (quantity 4 towels, new summary): `request_version` 1→2, `state_version` bumped, new scope applied, previous scope archived in `revision_history`. A token issued before the amendment is rejected |
| C.04 | Replay returns the recorded disposition; a reused ID with other content is rejected; an equal or older revision is `STALE`; a skipped revision (2→4) is refused for reconciliation |
| C.05 | **Cancel before work starts** (claimed, not started): `CANCELLED`, assignment released, and a flat `cancelled` callback with `request_version = 2` that validates against `task-status/1` |
| C.06 | **Cancel during work:** the status stays `IN_PROGRESS` with a pending cancellation, and no `cancelled` callback is emitted. Completion attempted under the old revision fails |
| C.07 | Only the assignee or a supervisor can confirm the physical stop. Confirmation cancels, releases the assignment and emits the callback with `actor_ref = staff:<uuid>` |
| C.08 | Amending the room of a task already in progress is held as a pending change; the live location is not silently rewritten |
| C.09 | A cancel for an already `COMPLETED` task is recorded as `TERMINAL_RECONCILE`; the completion is not rewritten |

---

## 4. App 5 authorization hardening (CR12 / F1, F2, F3)

The schema changes live in `bridges.sql` `@@cr12_app5`. The kernel revision, which maps capabilities onto them, is in `kernel_v2.sql`: the Sub-A experimental kernel with a signature-preserving replacement of `platform.local_roles` and `platform.project_member`.

| Finding (`01 §5.6`) | Mitigation |
|---|---|
| **F1** — resume requires `APPROVER`, so resume implies publish | New `workforce.ai_member_grants` (`SESSION_RESUME`, RLS forced). `resume_session` replaced to accept `APPROVER` **or** that grant; the body is otherwise identical. The kernel maps `ai.session.resume` → `CONFIGURATOR` + `SESSION_RESUME`; only `ai.graph.approve` → `APPROVER` |
| **F2** — `created_by` not bound to `actor()` | `BEFORE INSERT` trigger `graph_author_is_actor`: `created_by` must equal `workforce.actor()` |
| **F3** — no `auth_subject`, so one person can hold two approver identities | Nullable `ai_members.auth_subject` with a unique partial index `(space_id, auth_subject)`. The kernel projection writes it. A separate `NOT NULL` switch applies after backfill |

| # | Result [O] |
|---|---|
| D.01 | Kernel revision: Front Desk Lead → `CONFIGURATOR` + `SESSION_RESUME`; GM → `APPROVER`; Sommelier → `CONFIGURATOR`. Every row carries its `auth_subject` |
| D.02 | **F1 fixed:** the Front Desk Lead can no longer publish an agent graph (**Sub-A 3.11 inverted**); the GM can |
| D.03 | The Front Desk Lead and GM pass resume authorization (reaching the state check, `stale resume`); the Sommelier is refused (`human resume required`) |
| D.04 | **F2 fixed:** an approver cannot record a colleague as author (**Sub-A 3.12 inverted**). An honest self-authored draft still cannot be self-published |
| D.05 | **F3:** a second identity for the same `auth_subject` is refused (alias attack closed). Anonymous rows are still accepted in transition mode, a residual kept so legacy fixtures keep working |
| D.06 | The enforce switch cannot apply while 3 legacy rows lack a subject. After backfill (`legacy:<actor_id>`) it applies, and anonymous members are refused |
| D.07 | Revocation: removing the template disables the row and deletes the `SESSION_RESUME` grant; resume is then refused |
| D.08 | **Expected break in enforce mode:** the locked App 5 suite fails at its own anonymous `ai_members` fixture insert (`null value in column "auth_subject"`). This is the same pattern as Sub-A 4.02: the fixture, not the contract, must change before enforcement |

---

## 5. Zero-regression gate

`run_all.sh` (Appendix E) rebuilds `kernel_clean` = pristine locked DDL + `bridges.sql` (without the enforce switch). It then runs every prior suite against it. All results are from one clean run [O].

| Gate | Suite | Result on the bridged schemas | Baseline |
|---|---|---|---|
| Z1 | App 3 `verify.py` | **47** | 47 (`03:L1382`) |
| Z1 | App 4 `verify.py` / `extra.py` | **43 / 17** | 43 / 17 (`04:L1456`) |
| Z1 | App 5 `verify.py` / `verify_extra.py` | **59 / 11** | 59 / 11 (`05:L1867`) |
| Z3 | Sub-B `build_base.py` (runs the locked App 3/4/5 suites again) + `test_mesh.py` | suites 47/43/17/59; **43 / 43** | 43 (`02 §0`) |
| Z2 | Sub-A `test_kernel.py`, parts run separately | **54 pass; 3 intended inversions** | 61 (`01 §0`) |

**Sub-A detail:**

| Part | Result |
|---|---|
| 1 | 17/17 |
| 2 | 23 pass; **2.14 and 2.16 inverted by CR8.** Setting only `actor_id` now works, and divergence now raises. The unmodified harness crashes on the raised divergence (`KeyError: 'divergent'`), so a derived copy was used whose *only* change reads that row with `.get()` |
| 3 | 3.01–3.11 pass; **3.12 inverted by F2.** Its fixture inserts a graph as the GM naming the Sommelier as author, which the bridge now rejects, aborting part 3. Checks 3.13–3.16 therefore did not execute in this configuration; their subjects (alias, uniqueness, revocation, the App 1 gap) are re-tested here as D.05–D.07 and A.05–A.07 |
| 4 | 4.01, 4.02 pass |
| 5 | 4.03 passes |

Sub-A 3.11 (the Front Desk Lead can publish) still passes under Sub-A's *original* kernel mapping. F1 needs both the App 5 bridge and `kernel_v2` (D.02).

**Why Z3 matters [O].** App 1 and App 2 publish no behavioral suites. The Sub-B suite is the only regression net that drives App 1's `change_control`, App 1's outbox triggers and App 2's `erase_profile`. It caught the CR4 trigger defect (§1.2) that the locked App 3/4/5 suites could not see.

---

## 6. CR1–CR14 status matrix

| CR (`00 §8`) | Scope | Status after this phase | Evidence |
|---|---|---|---|
| CR1 | App 1 policy-event consumer | **Implemented and tested**, including the real-event E2E through the Sub-B relay | A.17–A.26 |
| CR2 | App 1 resolved-snapshot endpoint | **Implemented and tested** | A.08–A.16 |
| CR3 | App 1 ↔ App 5 invocation / response adapters | Open. Not in this brief; depends on App 5's runtime service | — |
| CR4 | App 1 authorized redaction procedure | **Open.** The manifest's `SNP10` path is the hook it must trigger. The brief's "CR4" (F4, `disabled_at`) is implemented | A.05–A.07, A.16 |
| CR5 | Pin `search_path` (App 1, App 2) | **Implemented**, with a hijack demonstration | A.01–A.04 |
| CR6 | App 2 recipient list + receipt API | **Implemented and tested** | B.01–B.06 |
| CR7 | App 2 `$id` schemas | **Authored and validated** (Appendix C) | B.07–B.08 |
| CR8 | App 3 `app.actor_id` | **Implemented** | C.01, Z1 |
| CR9 | App 3 amendment adapter; erasure function; publisher | **Amendment implemented** (C.02–C.09). Publisher = the Sub-B transport adapter (`02 §2`). **Erasure function open**; its receipt contract now exists (B.03) | C.*, `02` |
| CR10 | Multi-role vs single-role | **Decided:** single-role (`01 §6`), plus the additive grant table for resume (F1) | D.01–D.03 |
| CR11 | App 4 inbox / dead-letter | Covered by the Sub-B mesh (delivery inbox and dead-letter store, `02 §5`). New App 4 requirement: serve historical approved versions (§1.4) | `02` 3.08, 4.09–4.11; A.18 |
| CR12 | App 5: `auth_subject`, resume vs publish, author binding, erasure consumer, event consumers, erratum | **F1, F2 and F3 implemented.** Still open: the App 5 erasure consumer (the receipt path and recipient now exist); consumers for `AgentSessionChangedEvent`/`AgentHandoffEvent`; the interrupter ≠ resumer decision (F5); the dossier "twelve → fourteen" erratum (a locked-file edit, not made here) | D.01–D.08 |
| CR13 | Namespaced advisory locks | Not applied: the apps' lock keys are unchanged. The kernel uses classid 101 (`02` 1.12). The amendment consumer deliberately reuses App 3's ingest key, so amendments serialize with ingestion | — |
| CR14 | Tenant rows only from the kernel | Established by Sub-A (hard FK, `01 §3`) | `01` 1.02–1.04 |

---

## 7. Findings from this phase

1. **Search-path hijack in locked App 1 is real and exploitable in principle** (A.01), and CR5 closes it at no behavioral cost (Z1, Z3).
2. **A trigger shared across tables must branch per table in PL/pgSQL.** The regression gate caught this (§1.2). Only the Sub-B suite exercises App 1 behavior, so App 1 needs its own behavioral suite before production.
3. **App 1's unconditional knowledge exclusion constraint forces range surgery.** Supersession shortens the predecessor, archival cuts at the archive instant, and a successor that arrives first is staged (A.18–A.22).
4. **App 4's read API must serve once-approved historical versions,** or event replay after an archive fails (A.18).
5. **Digests over transcripts must canonicalize time zones** (A.11).
6. **Out-of-order and gapped knowledge events can be accepted durably and made safe by a dispatch fence.** The fence lifts only after verified reconciliation against App 4's snapshot, and it cancels AI replies that cite withdrawn evidence (A.23–A.25).
7. **F1 needs two changes, schema and kernel mapping; neither alone suffices.** Sub-A 3.11 still passes under the original kernel (§5); D.02 passes with both.
8. **Identity enforcement (F3) is a staged migration:** unique-when-present now, `NOT NULL` after backfill. Enforcement breaks fixtures that create anonymous members (D.08), exactly like the tenant FK in Sub-A 4.02.

---

## 8. Reproduction

Prerequisites: the Sub-A environment (`01 §7`) — PostgreSQL 16 with pgvector ≥ 0.6.0 available to the server, and Python 3.12 with `jsonschema` and `referencing`. Run from the repository root.

```bash
export BW="$(mktemp -d /tmp/bridges.XXXXXX)"
mkdir -p "$BW/kernel" "$BW/mesh" "$BW/bridges/contracts" -m 700 "$BW/socket"
python3 - <<'PY'   # artifacts from reports 01 (kernel), 02 (mesh) and 03 (bridges)
import os, re
from pathlib import Path
W = Path(os.environ['BW'])
for rep, sub in [('01_kernel_iam_research.md', 'kernel'), ('02_event_mesh_research.md', 'mesh'), ('03_cross_app_bridges_research.md', 'bridges')]:
    md = Path('research/platform/subcomponents', rep).read_text()
    for name, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```\w+\n(.*?)\n```', md, re.S):
        p = W / sub / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(body + '\n')
PY
KERNEL_WORKDIR="$BW" python3 "$BW/kernel/prepare.py"
export PGBIN="$(pg_config --bindir)"          # or the relocated pgvector-enabled copy from 01 §0
"$PGBIN/initdb" -D "$BW/pgdata" -A trust --no-locale --encoding=UTF8
"$PGBIN/pg_ctl" -D "$BW/pgdata" -l "$BW/postgres.log" -o "-k $BW/socket -p 55466 -h ''" -w start
P="psql -X -q -h $BW/socket -p 55466 -v ON_ERROR_STOP=1"
$P -d postgres -c 'CREATE DATABASE kernel_locked'
for n in 1 2 3 4 5; do $P -d kernel_locked -f "$BW/ddl/app$n.sql"; done
BW="$BW" bash "$BW/bridges/run_all.sh"     # rebuild bridged base, Z1/Z2/Z3 gate, bridge suite (Sub-B part 4 restarts the server)
"$PGBIN/pg_ctl" -D "$BW/pgdata" -m fast stop
```

**Independent reproduction [O]:** the recipe above was replayed from reports 01, 02 and 03 alone into a new work directory and cluster, reusing only the relocated pgvector-enabled binaries. Results were identical: Z1 47 / 43 / 17 / 59 / 11; Z2 17 + 23 + 11 + 2 + 1 passing, with the same three intended inversions (2.14, 2.16, 3.12); Z3 43 / 43; bridge suite **51 / 51**.

**Artifact fingerprints (as executed):**

| Artifact | SHA-256 |
|---|---|
| `bridges.sql` (Appendix A) | `a49d57be43f29bd0e6c05e6e4753a8c43f3a0de6520eb32acd5717484b62f438` |
| `kernel_v2.sql` (Appendix B) | `dd346acf535d4a9bba0f722ef2a6a67253dd3cbd2ddc269edc3862500446e9d4` |
| `contracts/profile-changed-event.schema.json` (Appendix C) | `49db0f3ddf461c6140bafd5902fd54e447183227ae6798ce4a22ce8d10bd2e4a` |
| `contracts/profile-erasure-requested-event.schema.json` (Appendix C) | `e65bd5ac1b3a22f910c4f1ea4f7270f1dd0a09d5458dc40c5ea7da2b1c6564c2` |
| `test_bridges.py` (Appendix D) | `5dc3e16af334b781e7be93bfbb649c005ae88100c9c5f22fe8dbd53aee4d1b93` |
| `run_all.sh` (Appendix E) | `a9d24c3ef0e8c3f29592e5baf06b72a6abf77b1f688616f6ba5a9f4555d9b85f` |

## 9. Limits of what this proves

- **Proven [O]:**
  - Each bridge's behavior against the real locked schemas and real App 1–5 traffic.
  - Zero regression for every published suite.
  - Intended inversions of the Sub-A checks that documented the fixed defects.
  - End-to-end delivery of real App 4 events to the App 1 consumer through the Sub-B relay.
- **Not proven:**
  - The HTTP layer of the bridges. The SQL functions are the contract cores, and the SQLSTATE → HTTP mapping is by convention.
  - App 1's redaction procedure (CR4 proper), App 3's erasure function and App 5's erasure consumer.
  - The App 1 ↔ App 5 invocation adapters (CR3).
  - Performance.
  - Behavior with App 1 or App 2 behavioral suites, because none exist; Sub-B's suite is the proxy.
- **Not done (by constraint):** no master DDL, and no edit to any locked file.

---

## Appendix A — experimental bridge extensions

Experimental bridge extensions applied on top of the five unmodified locked DDLs (sections selectable by `-- @@name`; `@@cr12_f3_enforce` is the separate breaking switch). **Not master DDL.**

<!-- artifact: bridges.sql -->
```sql
-- EXPERIMENTAL CROSS-APP BRIDGES (Sub-Component C micro-research). Disposable test fixture, NOT master DDL.
-- Applied on top of the five locked app DDLs. Every change is additive or a signature-preserving replacement:
--   * new tables / functions / triggers in the owning app's schema, owned by a NOBYPASSRLS bridge owner
--   * ALTER FUNCTION ... SET search_path (CR5)
--   * one nullable column on contact_center.participants (CR4) and one on workforce.ai_members (CR12/F3)
--   * CREATE OR REPLACE of exactly two locked functions with identical signatures: ops.actor() (CR8)
--     and workforce.resume_session(uuid,bigint) (CR12/F1)
-- Section markers (-- @@name) let the harness apply parts independently.

-- @@roles
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['cc_bridge_owner','crm_bridge_owner'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS', r);
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN RAISE EXCEPTION 'role % has unsafe attributes', r; END IF;
 END LOOP; END $$;
GRANT USAGE, CREATE ON SCHEMA contact_center TO cc_bridge_owner;
GRANT USAGE, CREATE ON SCHEMA guest_crm TO crm_bridge_owner;

-- @@cr5_search_path  (pin every App 1 / App 2 function, including trigger functions; bodies unchanged)
DO $$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'contact_center'::regnamespace AND p.prokind = 'f' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, contact_center, pg_temp', f); END LOOP;
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace = 'guest_crm'::regnamespace AND p.prokind = 'f' LOOP
  EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, guest_crm, pg_temp', f); END LOOP;
END $$;

-- @@cr4_disabled_operator
ALTER TABLE contact_center.participants ADD COLUMN disabled_at timestamptz, ADD COLUMN disabled_reason text,
 ADD CONSTRAINT participant_disable_reason CHECK ((disabled_at IS NULL) = (disabled_reason IS NULL)),
 ADD CONSTRAINT participant_disable_operator_only CHECK (disabled_at IS NULL OR kind = 'operator');
CREATE FUNCTION contact_center.reject_disabled_actor() RETURNS trigger LANGUAGE plpgsql
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE who uuid; BEGIN
 -- One branch per table: PL/pgSQL resolves every NEW.field in an expression, so a single CASE over
 -- columns of different tables fails with 'record "new" has no field ...' (caught by the Sub-B regression run).
 IF TG_TABLE_NAME = 'hitl_sessions' THEN who := NEW.operator_id;
 ELSIF TG_TABLE_NAME = 'control_history' THEN who := NEW.actor_id;
 ELSIF TG_TABLE_NAME = 'messages' AND NEW.direction <> 'inbound' THEN who := NEW.sender_id; END IF;
 IF who IS NOT NULL AND EXISTS (SELECT 1 FROM participants WHERE space_id = NEW.space_id AND id = who AND disabled_at IS NOT NULL) THEN
  RAISE EXCEPTION 'operator % is disabled', who USING ERRCODE = '42501';
 END IF;
 RETURN NEW; END $$;
CREATE TRIGGER hitl_operator_enabled BEFORE INSERT ON contact_center.hitl_sessions FOR EACH ROW EXECUTE FUNCTION contact_center.reject_disabled_actor();
CREATE TRIGGER control_actor_enabled BEFORE INSERT ON contact_center.control_history FOR EACH ROW EXECUTE FUNCTION contact_center.reject_disabled_actor();
CREATE TRIGGER message_sender_enabled BEFORE INSERT ON contact_center.messages FOR EACH ROW EXECUTE FUNCTION contact_center.reject_disabled_actor();

-- @@cr2_resolved_snapshots
GRANT SELECT ON contact_center.conversations, contact_center.conversation_chapters, contact_center.messages, contact_center.participants TO cc_bridge_owner;
SET ROLE cc_bridge_owner;
CREATE TABLE contact_center.resolved_snapshot_headers (
 space_id uuid NOT NULL, conversation_id uuid NOT NULL, control_version bigint NOT NULL CHECK (control_version > 0),
 source_event_id uuid NOT NULL, guest_participant_id uuid NOT NULL, reservation_id uuid, binding_status text NOT NULL,
 binding_version bigint NOT NULL, eligible_chapters integer NOT NULL, captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (space_id, conversation_id, control_version), UNIQUE (space_id, source_event_id));
CREATE TABLE contact_center.resolved_snapshot_chapters (
 space_id uuid NOT NULL, conversation_id uuid NOT NULL, control_version bigint NOT NULL, chapter_id uuid NOT NULL,
 through_seq bigint NOT NULL CHECK (through_seq > 0), source_revision bigint NOT NULL DEFAULT 1 CHECK (source_revision > 0),
 source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'), message_count integer NOT NULL,
 first_ingested_at timestamptz NOT NULL, source_expires_at timestamptz NOT NULL,
 PRIMARY KEY (space_id, conversation_id, control_version, chapter_id),
 FOREIGN KEY (space_id, conversation_id, control_version) REFERENCES contact_center.resolved_snapshot_headers);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['resolved_snapshot_headers','resolved_snapshot_chapters'] LOOP
 EXECUTE format('ALTER TABLE contact_center.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('ALTER TABLE contact_center.%I FORCE ROW LEVEL SECURITY', t);
 EXECUTE format('CREATE POLICY tenant_scope ON contact_center.%I USING (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid) WITH CHECK (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid)', t);
END LOOP; END $$;
-- Deterministic digest: canonical JSON per message in seq order; timestamps rendered in UTC so TimeZone cannot change it.
-- Only guest-visible traffic (inbound/outbound) is snapshotted; internal staff notes and AI drafts are excluded.
CREATE FUNCTION contact_center.chapter_digest(p_space uuid, p_conversation uuid, p_chapter uuid, p_through bigint)
 RETURNS TABLE (digest text, n integer, first_at timestamptz) LANGUAGE sql STABLE SET search_path = pg_catalog, contact_center, pg_temp AS $$
 SELECT encode(sha256(convert_to(coalesce(string_agg(jsonb_build_object('seq', m.seq, 'id', m.id, 'direction', m.direction, 'sender_id', m.sender_id,
   'body', m.body, 'attachments', m.attachments, 'occurred_at', to_char(m.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text, E'\n' ORDER BY m.seq), ''), 'UTF8')), 'hex'),
   count(*)::integer, min(m.recorded_at)
 FROM messages m WHERE m.space_id = p_space AND m.conversation_id = p_conversation AND m.chapter_id = p_chapter
   AND m.direction IN ('inbound', 'outbound') AND m.seq <= p_through $$;
-- Capture in the resolution transaction itself: fires on the RESOLVED ConversationControlChangedEvent row that
-- change_control() appends, so source_event_id is exact and nothing later can substitute a newer transcript.
CREATE FUNCTION contact_center.capture_resolved_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE c conversations; v bigint := (NEW.payload->>'control_version')::bigint; ch record; d record; n integer := 0; BEGIN
 SELECT * INTO STRICT c FROM conversations WHERE space_id = NEW.space_id AND id = NEW.conversation_id;
 INSERT INTO resolved_snapshot_headers (space_id, conversation_id, control_version, source_event_id, guest_participant_id, reservation_id, binding_status, binding_version, eligible_chapters)
 VALUES (NEW.space_id, NEW.conversation_id, v, NEW.id, c.guest_id, c.reservation_id, c.binding_status, c.binding_version, 0);
 FOR ch IN SELECT x.id, (SELECT max(m.seq) FROM messages m WHERE m.space_id = x.space_id AND m.conversation_id = x.conversation_id AND m.chapter_id = x.id
             AND m.direction IN ('inbound','outbound')) AS through_seq
           FROM conversation_chapters x WHERE x.space_id = NEW.space_id AND x.conversation_id = NEW.conversation_id ORDER BY x.start_seq LOOP
  CONTINUE WHEN ch.through_seq IS NULL;
  SELECT * INTO d FROM chapter_digest(NEW.space_id, NEW.conversation_id, ch.id, ch.through_seq);
  INSERT INTO resolved_snapshot_chapters (space_id, conversation_id, control_version, chapter_id, through_seq, source_digest, message_count, first_ingested_at, source_expires_at)
  VALUES (NEW.space_id, NEW.conversation_id, v, ch.id, ch.through_seq, d.digest, d.n, d.first_at, d.first_at + interval '180 days');  -- 01:L755 transcript proposal
  n := n + 1;
 END LOOP;
 UPDATE resolved_snapshot_headers SET eligible_chapters = n WHERE space_id = NEW.space_id AND conversation_id = NEW.conversation_id AND control_version = v;
 RETURN NULL; END $$;
-- The proposed GET /v1/internal/conversations/{id}/resolved-snapshots?control_version={v} (02:L150, L769).
-- SQLSTATE SNP09 maps to HTTP 409, SNP10 to HTTP 410. Never falls back to the latest transcript.
CREATE FUNCTION contact_center.resolved_snapshot_manifest(p_conversation uuid, p_control_version bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE h resolved_snapshot_headers; chapters jsonb; bad integer; BEGIN
 SELECT * INTO h FROM resolved_snapshot_headers WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid
  AND conversation_id = p_conversation AND control_version = p_control_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'NO_SNAPSHOT_AT_VERSION' USING ERRCODE = 'SNP09'; END IF;
 IF h.binding_status <> 'verified' THEN RAISE EXCEPTION 'BINDING_NOT_VERIFIED' USING ERRCODE = 'SNP09'; END IF;
 IF h.eligible_chapters = 0 THEN RAISE EXCEPTION 'NO_ELIGIBLE_CHAPTERS' USING ERRCODE = 'SNP09'; END IF;
 SELECT count(*) INTO bad FROM resolved_snapshot_chapters r WHERE r.space_id = h.space_id AND r.conversation_id = h.conversation_id AND r.control_version = h.control_version
  AND (r.source_expires_at <= clock_timestamp() OR r.source_digest <> (SELECT digest FROM chapter_digest(r.space_id, r.conversation_id, r.chapter_id, r.through_seq)));
 IF bad > 0 THEN RAISE EXCEPTION 'SNAPSHOT_SOURCE_GONE' USING ERRCODE = 'SNP10'; END IF;
 SELECT jsonb_agg(jsonb_build_object('chapter_id', chapter_id, 'through_seq', through_seq::text, 'source_revision', source_revision::text,
   'source_digest', source_digest, 'first_ingested_at', to_jsonb(first_ingested_at), 'source_expires_at', to_jsonb(source_expires_at),
   'snapshot_ref', 'snapshot:' || space_id || ':' || conversation_id || ':' || chapter_id || ':' || through_seq) ORDER BY through_seq) INTO chapters
  FROM resolved_snapshot_chapters WHERE space_id = h.space_id AND conversation_id = h.conversation_id AND control_version = h.control_version;
 RETURN jsonb_build_object('schema_version', 1, 'space_id', h.space_id, 'conversation_id', h.conversation_id, 'source_event_id', h.source_event_id,
   'source_control_version', h.control_version::text, 'guest_participant_id', h.guest_participant_id, 'binding_status', h.binding_status, 'chapters', chapters);
END $$;
CREATE FUNCTION contact_center.snapshot_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN RAISE EXCEPTION 'resolved snapshots are immutable'; END $$;
CREATE TRIGGER header_immutable BEFORE UPDATE OF source_event_id, guest_participant_id, reservation_id, binding_status, binding_version OR DELETE
 ON contact_center.resolved_snapshot_headers FOR EACH ROW EXECUTE FUNCTION contact_center.snapshot_immutable();
CREATE TRIGGER chapter_immutable BEFORE UPDATE OR DELETE ON contact_center.resolved_snapshot_chapters FOR EACH ROW EXECUTE FUNCTION contact_center.snapshot_immutable();
RESET ROLE;
CREATE TRIGGER resolved_snapshot_capture AFTER INSERT ON contact_center.outbox_events FOR EACH ROW
 WHEN (NEW.event_type = 'ConversationControlChangedEvent' AND NEW.payload->>'state' = 'RESOLVED')
 EXECUTE FUNCTION contact_center.capture_resolved_snapshot();

-- @@cr1_policy_consumer
-- App 4 read-API extension (04:L627 GET /approved/{item}) in SQL form: approved content for an exact item/version.
CREATE FUNCTION kb.approved_item_content(p_item uuid) RETURNS TABLE (policy_key text, locale text, version integer, content text, source_uri text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, kb, pg_temp AS $$
 SELECT p.policy_key, p.locale, p.version, string_agg(c.content, E'\n' ORDER BY c.ordinal),
        'kb://' || p.space_id || '/' || p.knowledge_item_id || '/v' || p.version
 FROM kb.knowledge_policies p JOIN kb.document_chunks c ON c.space_id = p.space_id AND c.revision_id = p.revision_id
 WHERE p.space_id = kb.tenant() AND p.knowledge_item_id = p_item AND p.approved_at IS NOT NULL   -- any once-approved (sealed, immutable) version: replay must work after archive
 GROUP BY p.space_id, p.knowledge_item_id, p.policy_key, p.locale, p.version $$;
CREATE FUNCTION kb.approved_items_snapshot() RETURNS TABLE (knowledge_item_id uuid, state text, state_version bigint, valid_during tstzrange, knowledge_epoch bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, kb, pg_temp AS $$
 SELECT p.knowledge_item_id, p.state, p.state_version, p.valid_during, s.knowledge_epoch FROM kb.knowledge_policies p JOIN kb.spaces s ON s.space_id = p.space_id
 WHERE p.space_id = kb.tenant() AND p.state IN ('APPROVED_ACTIVE', 'SUPERSEDED', 'ARCHIVED') $$;
ALTER FUNCTION kb.approved_item_content(uuid) OWNER TO kb_owner;
ALTER FUNCTION kb.approved_items_snapshot() OWNER TO kb_owner;
REVOKE ALL ON FUNCTION kb.approved_item_content(uuid), kb.approved_items_snapshot() FROM PUBLIC;
GRANT USAGE ON SCHEMA kb TO cc_bridge_owner;
GRANT EXECUTE ON FUNCTION kb.approved_item_content(uuid), kb.approved_items_snapshot(), kb.tenant() TO cc_bridge_owner;
GRANT SELECT, INSERT, UPDATE, DELETE ON contact_center.knowledge_items TO cc_bridge_owner;
GRANT SELECT ON contact_center.message_deliveries TO cc_bridge_owner;
GRANT UPDATE (status, updated_at, last_error_code) ON contact_center.message_deliveries TO cc_bridge_owner;
SET ROLE cc_bridge_owner;
CREATE TABLE contact_center.knowledge_item_state (            -- per-item projection state and tombstones
 space_id uuid NOT NULL, knowledge_item_id uuid NOT NULL, policy_key text NOT NULL, locale text NOT NULL, version integer NOT NULL,
 state text NOT NULL CHECK (state IN ('APPROVED_ACTIVE','SUPERSEDED','ARCHIVED')), state_version bigint NOT NULL, knowledge_epoch bigint NOT NULL,
 source_sha256 text NOT NULL, manifest_sha256 text, original_valid_during tstzrange NOT NULL, projected boolean NOT NULL,
 tombstoned_at timestamptz, last_event_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (space_id, knowledge_item_id));
CREATE TABLE contact_center.knowledge_projection (             -- per-property epoch watermark and AI dispatch fence
 space_id uuid PRIMARY KEY, knowledge_epoch bigint NOT NULL DEFAULT 0, dispatch_fenced boolean NOT NULL DEFAULT false,
 fence_reason text, updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE contact_center.policy_event_inbox (
 space_id uuid NOT NULL, event_id uuid NOT NULL, payload_sha256 text NOT NULL, outcome text NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, event_id));
CREATE TABLE contact_center.policy_event_stage (
 space_id uuid NOT NULL, event_id uuid NOT NULL, knowledge_epoch bigint NOT NULL, payload jsonb NOT NULL, reason text NOT NULL,
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, event_id));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['knowledge_item_state','knowledge_projection','policy_event_inbox','policy_event_stage'] LOOP
 EXECUTE format('ALTER TABLE contact_center.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('ALTER TABLE contact_center.%I FORCE ROW LEVEL SECURITY', t);
 EXECUTE format('CREATE POLICY tenant_scope ON contact_center.%I USING (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid) WITH CHECK (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid)', t);
END LOOP; END $$;

-- Queued AI replies whose evidence cites an item that is no longer servable are cancelled (the "local AI dispatch cache").
CREATE FUNCTION contact_center.invalidate_ai_evidence(p_space uuid, p_item uuid) RETURNS integer LANGUAGE plpgsql
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE n integer; BEGIN
 UPDATE message_deliveries d SET status = 'cancelled', updated_at = clock_timestamp(), last_error_code = 'EVIDENCE_WITHDRAWN'
 FROM messages m WHERE d.space_id = p_space AND m.space_id = d.space_id AND m.id = d.message_id AND d.status = 'queued'
  AND m.payload->'policy_evidence' @> jsonb_build_array(jsonb_build_object('knowledge_item_id', p_item::text));
 GET DIAGNOSTICS n = ROW_COUNT; RETURN n; END $$;

CREATE FUNCTION contact_center.apply_one_policy_event(e jsonb) RETURNS text LANGUAGE plpgsql
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; item uuid := (e->>'knowledge_item_id')::uuid;
 ep bigint := (e->>'knowledge_epoch')::bigint; sv bigint := (e->>'state_version')::bigint; st knowledge_item_state; proj knowledge_projection;
 rng tstzrange := tstzrange((e->'valid_during'->>'from')::timestamptz, (e->'valid_during'->>'until')::timestamptz, '[)');
 c record; newrng tstzrange; stopped timestamptz := (e->>'occurred_at')::timestamptz; BEGIN
 SELECT * INTO st FROM knowledge_item_state WHERE space_id = sid AND knowledge_item_id = item FOR UPDATE;
 IF FOUND AND st.state_version >= sv THEN RETURN 'STALE'; END IF;
 IF e->>'type' = 'PolicyApprovedEvent' THEN
  SELECT * INTO c FROM kb.approved_item_content(item);
  IF c.content IS NULL THEN RAISE EXCEPTION 'APPROVED_CONTENT_UNAVAILABLE %', item; END IF;
  IF NOT EXISTS (SELECT 1 FROM participants WHERE space_id = sid AND id = (e->>'actor_id')::uuid) THEN
   RAISE EXCEPTION 'APPROVER_NOT_PROJECTED %', e->>'actor_id';   -- 04:L228: map to a real participant, never invent one
  END IF;
  BEGIN
   INSERT INTO knowledge_items (space_id, id, policy_key, version, locale, content, valid_during, approved_by, approved_at, source_uri)
   VALUES (sid, item, e->>'policy_key', (e->>'version')::integer, e->>'locale', c.content, rng, (e->>'actor_id')::uuid, stopped, c.source_uri);
  EXCEPTION WHEN exclusion_violation THEN RETURN 'AWAITING_PREDECESSOR';   -- successor before its supersede partner: stage
  END;
  INSERT INTO knowledge_item_state VALUES (sid, item, e->>'policy_key', e->>'locale', (e->>'version')::integer, 'APPROVED_ACTIVE', sv, ep,
   e->>'source_sha256', e->>'manifest_sha256', rng, true, NULL, (e->>'event_id')::uuid, clock_timestamp())
  ON CONFLICT (space_id, knowledge_item_id) DO UPDATE SET state = 'APPROVED_ACTIVE', state_version = sv, knowledge_epoch = ep, last_event_id = EXCLUDED.last_event_id, updated_at = clock_timestamp();
  RETURN 'APPLIED';
 ELSIF e->>'type' = 'PolicySupersededEvent' THEN
  UPDATE knowledge_items SET valid_during = rng WHERE space_id = sid AND id = item;       -- shorten predecessor in place
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPERSEDED_ITEM_NOT_PROJECTED %', item; END IF;
  UPDATE knowledge_item_state SET state = 'SUPERSEDED', state_version = sv, knowledge_epoch = ep, last_event_id = (e->>'event_id')::uuid, updated_at = clock_timestamp()
   WHERE space_id = sid AND knowledge_item_id = item;
  PERFORM invalidate_ai_evidence(sid, item);
  RETURN 'APPLIED';
 ELSE  -- PolicyArchivedEvent: tombstone; history kept; may reference a candidate that was never approved
  IF EXISTS (SELECT 1 FROM knowledge_items WHERE space_id = sid AND id = item) THEN
   SELECT tstzrange(lower(valid_during), least(upper(valid_during), stopped), '[)') INTO newrng FROM knowledge_items WHERE space_id = sid AND id = item;
   IF isempty(newrng) THEN DELETE FROM knowledge_items WHERE space_id = sid AND id = item;   -- never-served future item: tombstone keeps the record
   ELSE UPDATE knowledge_items SET valid_during = newrng WHERE space_id = sid AND id = item; END IF;
   PERFORM invalidate_ai_evidence(sid, item);
  END IF;
  INSERT INTO knowledge_item_state VALUES (sid, item, e->>'policy_key', e->>'locale', (e->>'version')::integer, 'ARCHIVED', sv, ep,
   e->>'source_sha256', e->>'manifest_sha256', rng, EXISTS (SELECT 1 FROM knowledge_items WHERE space_id = sid AND id = item), stopped, (e->>'event_id')::uuid, clock_timestamp())
  ON CONFLICT (space_id, knowledge_item_id) DO UPDATE SET state = 'ARCHIVED', state_version = sv, knowledge_epoch = ep, tombstoned_at = stopped,
   last_event_id = EXCLUDED.last_event_id, updated_at = clock_timestamp();
  RETURN 'APPLIED';
 END IF;
END $$;

-- Consumer entry point: accepts one event or a delivery group (the mesh claims supersession pairs together, 02 1.12).
-- Ordering inside a group and across deliveries: epoch ascending, Superseded/Archived before Approved; a successor that
-- arrives before its predecessor is staged and applied atomically when the partner arrives (04:L230, L1407).
CREATE FUNCTION contact_center.apply_policy_events(p_events jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; e jsonb; h text; prior policy_event_inbox; out jsonb := '{}';
 proj knowledge_projection; r text; ep bigint; staged record; progressed boolean; BEGIN
 IF sid IS NULL THEN RAISE EXCEPTION 'tenant context required'; END IF;
 INSERT INTO knowledge_projection (space_id, knowledge_epoch) VALUES (sid, 1) ON CONFLICT DO NOTHING;  -- App 4 spaces start at epoch 1 (kernel-provisioned together)
 SELECT * INTO proj FROM knowledge_projection WHERE space_id = sid FOR UPDATE;          -- serializes per property
 FOR e IN SELECT x FROM jsonb_array_elements(CASE jsonb_typeof(p_events) WHEN 'array' THEN p_events ELSE jsonb_build_array(p_events) END) x
   ORDER BY (x->>'knowledge_epoch')::bigint, CASE x->>'type' WHEN 'PolicyApprovedEvent' THEN 2 ELSE 1 END LOOP
  IF (e->>'space_id')::uuid IS DISTINCT FROM sid THEN RAISE EXCEPTION 'event tenant mismatch'; END IF;
  h := encode(sha256(convert_to(e::text, 'UTF8')), 'hex');
  SELECT * INTO prior FROM policy_event_inbox WHERE space_id = sid AND event_id = (e->>'event_id')::uuid;
  IF FOUND THEN
   IF prior.payload_sha256 <> h THEN RAISE EXCEPTION 'event id reused with different content'; END IF;
   out := out || jsonb_build_object(e->>'event_id', 'DUPLICATE'); CONTINUE;
  END IF;
  ep := (e->>'knowledge_epoch')::bigint;
  IF ep > proj.knowledge_epoch + 1 THEN                       -- gap: stage durably (safe to ack), fence AI dispatch
   UPDATE knowledge_projection SET dispatch_fenced = true, fence_reason = format('KNOWLEDGE_GAP expected<=%s got %s', proj.knowledge_epoch + 1, ep), updated_at = clock_timestamp()
    WHERE space_id = sid;
   INSERT INTO policy_event_stage VALUES (sid, (e->>'event_id')::uuid, ep, e, 'GAP') ON CONFLICT DO NOTHING;
   out := out || jsonb_build_object(e->>'event_id', 'GAP_FENCED'); CONTINUE;
  END IF;
  r := apply_one_policy_event(e);
  IF r = 'AWAITING_PREDECESSOR' THEN
   INSERT INTO policy_event_stage VALUES (sid, (e->>'event_id')::uuid, ep, e, 'AWAITING_PREDECESSOR') ON CONFLICT DO NOTHING;
   out := out || jsonb_build_object(e->>'event_id', 'STAGED'); CONTINUE;
  END IF;
  INSERT INTO policy_event_inbox VALUES (sid, (e->>'event_id')::uuid, h, r);
  UPDATE knowledge_projection SET knowledge_epoch = greatest(knowledge_epoch, ep), updated_at = clock_timestamp() WHERE space_id = sid RETURNING * INTO proj;
  out := out || jsonb_build_object(e->>'event_id', r);
  -- drain staged events that are now in order: successors awaiting a predecessor, and gap-staged events whose epoch is next
  LOOP
   progressed := false;
   FOR staged IN SELECT * FROM policy_event_stage WHERE space_id = sid
     ORDER BY knowledge_epoch, CASE payload->>'type' WHEN 'PolicyApprovedEvent' THEN 2 ELSE 1 END, staged_at LOOP
    CONTINUE WHEN staged.knowledge_epoch > proj.knowledge_epoch + 1;
    r := apply_one_policy_event(staged.payload);
    IF r <> 'AWAITING_PREDECESSOR' THEN
     DELETE FROM policy_event_stage WHERE space_id = sid AND event_id = staged.event_id;
     INSERT INTO policy_event_inbox VALUES (sid, staged.event_id, encode(sha256(convert_to(staged.payload::text, 'UTF8')), 'hex'), r)
      ON CONFLICT DO NOTHING;
     UPDATE knowledge_projection SET knowledge_epoch = greatest(knowledge_epoch, staged.knowledge_epoch), updated_at = clock_timestamp()
      WHERE space_id = sid RETURNING * INTO proj;
     out := out || jsonb_build_object(staged.event_id::text, r || '_FROM_STAGE'); progressed := true;
    END IF;
   END LOOP;
   EXIT WHEN NOT progressed;
  END LOOP;
 END LOOP;
 RETURN out; END $$;

-- Gap recovery: authoritative snapshot from App 4, then unfence (04:L230 "gap -> tenant snapshot, reconcile before resuming AI dispatch").
CREATE FUNCTION contact_center.reconcile_knowledge() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; s record; truth_epoch bigint := 0; missing integer := 0; staged integer; BEGIN
 FOR s IN SELECT * FROM kb.approved_items_snapshot() LOOP
  truth_epoch := greatest(truth_epoch, s.knowledge_epoch);
  IF s.state = 'APPROVED_ACTIVE' AND NOT EXISTS (SELECT 1 FROM knowledge_items k WHERE k.space_id = sid AND k.id = s.knowledge_item_id AND k.valid_during = s.valid_during)
  THEN missing := missing + 1; END IF;
 END LOOP;
 SELECT count(*) INTO staged FROM policy_event_stage WHERE space_id = sid;
 IF missing > 0 OR staged > 0 THEN                     -- fence stays until the projection provably equals App 4's approved set
  RETURN jsonb_build_object('status', 'STILL_FENCED', 'missing_or_stale_items', missing, 'staged_events', staged);
 END IF;
 UPDATE knowledge_projection SET knowledge_epoch = truth_epoch, dispatch_fenced = false, fence_reason = NULL, updated_at = clock_timestamp() WHERE space_id = sid;
 RETURN jsonb_build_object('status', 'RECONCILED', 'knowledge_epoch', truth_epoch); END $$;

-- Dispatch-time gate for a single evidence item (App 1 three-field evidence: item, version, valid_at).
CREATE FUNCTION contact_center.evidence_servable(p_item uuid, p_version integer, p_at timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM knowledge_items k JOIN knowledge_item_state s ON s.space_id = k.space_id AND s.knowledge_item_id = k.id
   WHERE k.space_id = nullif(current_setting('app.space_id', true), '')::uuid AND k.id = p_item AND k.version = p_version
     AND k.valid_during @> p_at AND s.tombstoned_at IS NULL)
  AND NOT coalesce((SELECT dispatch_fenced FROM knowledge_projection WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid), false) $$;
RESET ROLE;

-- @@cr6_erasure_recipients
GRANT SELECT, INSERT ON guest_crm.erasure_receipts TO crm_bridge_owner;
GRANT UPDATE (outcome, completed_at) ON guest_crm.erasure_receipts TO crm_bridge_owner;
GRANT SELECT ON guest_crm.erasure_requests TO crm_bridge_owner;
GRANT UPDATE (state) ON guest_crm.erasure_requests TO crm_bridge_owner;
SET ROLE crm_bridge_owner;
CREATE TABLE guest_crm.erasure_recipient_registry (         -- kernel-managed; erase_profile's five codes are the LEGACY rows
 system_code text PRIMARY KEY CHECK (system_code ~ '^[a-z][a-z_]{1,39}$'), owner_app text NOT NULL, origin text NOT NULL CHECK (origin IN ('LEGACY','KERNEL')),
 enabled boolean NOT NULL DEFAULT true, added_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO guest_crm.erasure_recipient_registry (system_code, owner_app, origin) VALUES
 ('contact_center','contact_center','LEGACY'), ('operations','ops','LEGACY'), ('cache_search','platform','LEGACY'),
 ('object_store','platform','LEGACY'), ('backup_ledger','platform','LEGACY'), ('workforce','workforce','KERNEL'), ('kb','kb','KERNEL');
CREATE TABLE guest_crm.erasure_receipt_log (
 space_id uuid NOT NULL, request_id uuid NOT NULL, system_code text NOT NULL, outcome text NOT NULL, detail_code text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, request_id, system_code, recorded_at));
ALTER TABLE guest_crm.erasure_receipt_log ENABLE ROW LEVEL SECURITY; ALTER TABLE guest_crm.erasure_receipt_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON guest_crm.erasure_receipt_log USING (space_id = nullif(current_setting('app.space_id', true), '')::uuid)
 WITH CHECK (space_id = nullif(current_setting('app.space_id', true), '')::uuid);
-- erase_profile() is untouched: it still inserts its five hardcoded receipts; this statement trigger adds every other
-- enabled registry recipient for the same request in the same transaction. pg_trigger_depth() stops self-recursion.
CREATE FUNCTION guest_crm.expand_erasure_recipients() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, guest_crm, pg_temp AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
 INSERT INTO erasure_receipts (space_id, request_id, system_code, outcome)
 SELECT DISTINCT n.space_id, n.request_id, r.system_code, 'pending' FROM new_rows n CROSS JOIN erasure_recipient_registry r WHERE r.enabled
 ON CONFLICT DO NOTHING;
 RETURN NULL; END $$;
-- Receipt-return contract (the missing F7 of 00 section 4.1): idempotent, terminal outcomes only, drives the saga state.
CREATE FUNCTION guest_crm.record_erasure_receipt(p_request uuid, p_system text, p_outcome text, p_detail_code text DEFAULT NULL) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, guest_crm, pg_temp AS $$
DECLARE sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; cur erasure_receipts; pending integer; failed integer; new_state text; BEGIN
 IF p_outcome NOT IN ('erased', 'lawful_restriction', 'failed') THEN RAISE EXCEPTION 'receipt outcome must be terminal'; END IF;
 IF p_outcome = 'lawful_restriction' AND p_detail_code IS NULL THEN RAISE EXCEPTION 'lawful restriction requires a reason code'; END IF;
 PERFORM 1 FROM erasure_requests WHERE space_id = sid AND id = p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown erasure request'; END IF;
 SELECT * INTO cur FROM erasure_receipts WHERE space_id = sid AND request_id = p_request AND system_code = p_system FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'recipient % not registered for this request', p_system; END IF;
 IF cur.outcome = p_outcome THEN RETURN 'DUPLICATE'; END IF;
 IF cur.outcome IN ('erased', 'lawful_restriction') THEN RAISE EXCEPTION 'receipt already terminal (%)', cur.outcome; END IF;
 UPDATE erasure_receipts SET outcome = p_outcome, completed_at = clock_timestamp() WHERE space_id = sid AND request_id = p_request AND system_code = p_system;
 INSERT INTO erasure_receipt_log (space_id, request_id, system_code, outcome, detail_code) VALUES (sid, p_request, p_system, p_outcome, p_detail_code);
 SELECT count(*) FILTER (WHERE outcome = 'pending'), count(*) FILTER (WHERE outcome = 'failed') INTO pending, failed
  FROM erasure_receipts WHERE space_id = sid AND request_id = p_request;
 new_state := CASE WHEN pending > 0 THEN 'propagating' WHEN failed > 0 THEN 'exception_review' ELSE 'complete' END;
 UPDATE erasure_requests SET state = new_state WHERE space_id = sid AND id = p_request;
 RETURN new_state; END $$;
RESET ROLE;
CREATE TRIGGER erasure_recipients_expand AFTER INSERT ON guest_crm.erasure_receipts REFERENCING NEW TABLE AS new_rows
 FOR EACH STATEMENT EXECUTE FUNCTION guest_crm.expand_erasure_recipients();

-- @@cr8_actor_alias  (signature-preserving replacement; owner ops_owner retained)
CREATE OR REPLACE FUNCTION ops.actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE s uuid := nullif(current_setting('app.staff_id', true), '')::uuid; a uuid := nullif(current_setting('app.actor_id', true), '')::uuid; BEGIN
 IF s IS NOT NULL AND a IS NOT NULL AND s <> a THEN RAISE EXCEPTION 'app.staff_id and app.actor_id disagree' USING ERRCODE = '42501'; END IF;
 RETURN coalesce(s, a); END $$;

-- @@cr9_amendment
SET ROLE ops_owner;
-- 03:L699-701. Same advisory key as ingest_request so amendments serialize with first ingestion of the request.
CREATE FUNCTION ops.apply_request_change(p_event jsonb, p_sha256 text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = ops, pg_temp AS $$
DECLARE d jsonb := p_event->'data'; sid uuid := tenant(); eid uuid := (p_event->>'id')::uuid; rid uuid := (d->>'request_id')::uuid;
 rev bigint := (d->>'request_version')::bigint; kind text := d->>'change_kind'; existing task_inbox; t operational_tasks;
 repl jsonb := d->'replacement'; started boolean; r hotel_rooms; history jsonb; src text := p_event->>'source';
 pol task_sla_policies; deadline timestamptz; BEGIN
 IF sid IS NULL OR sid <> (p_event->>'space_id')::uuid OR p_event->>'type' <> 'GuestRequestChangedEvent'
  OR src <> 'urn:smartstay:space:' || sid::text || ':contact-center' OR p_event->>'subject' <> 'conversations/' || (p_event->>'conversation_id')
  OR rev < 2 OR kind NOT IN ('amend', 'cancel') OR coalesce(d->>'reason', '') = '' THEN RAISE EXCEPTION 'invalid change event'; END IF;
 IF kind = 'amend' AND (repl IS NULL OR jsonb_typeof(repl) <> 'object' OR repl->>'request_id' <> rid::text OR (repl->>'request_version')::bigint <> rev)
  THEN RAISE EXCEPTION 'amendment replacement must carry the same request and the new version'; END IF;
 IF kind = 'cancel' AND repl IS NOT NULL AND jsonb_typeof(repl) <> 'null' THEN RAISE EXCEPTION 'cancel carries no replacement'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(sid::text || rid::text, 0));
 SELECT * INTO existing FROM task_inbox WHERE space_id = sid AND source = src AND event_id = eid;
 IF FOUND THEN
  IF existing.payload_hash <> p_sha256 THEN RAISE EXCEPTION 'event ID reused with different content'; END IF;
  RETURN jsonb_build_object('disposition', 'REPLAY', 'recorded', existing.disposition);
 END IF;
 SELECT * INTO t FROM operational_tasks WHERE space_id = sid AND request_id = rid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'change for unknown request: reconcile from source'; END IF;
 IF rev <= t.request_version THEN
  INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'STALE');
  RETURN jsonb_build_object('disposition', 'STALE', 'task_id', t.task_id);
 END IF;
 IF rev > t.request_version + 1 THEN RAISE EXCEPTION 'request revision gap (have %, got %): reconcile from source', t.request_version, rev; END IF;
 IF t.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN     -- terminal facts are never rewritten (03:L701)
  INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'QUARANTINED');
  RETURN jsonb_build_object('disposition', 'TERMINAL_RECONCILE', 'status', t.status, 'task_id', t.task_id);
 END IF;
 started := t.started_at IS NOT NULL;
 history := coalesce(t.details->'revision_history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('request_version', t.request_version::text,
   'title', t.title, 'due_at', t.due_at, 'entry_permission', t.entry_permission, 'location_label', t.location_label,
   'requested_quantity', t.details->'requested_quantity', 'superseded_by_event', eid, 'superseded_at', clock_timestamp()));
 -- every outstanding action token dies: they are bound to state_version (staff_action checks expected_version)
 UPDATE staff_action_tokens SET expires_at = least(expires_at, clock_timestamp()) WHERE space_id = sid AND task_id = t.task_id AND consumed_at IS NULL;
 IF kind = 'cancel' AND NOT started THEN
  UPDATE task_assignments SET released_at = clock_timestamp(), release_reason = 'REQUEST_CANCELLED'
   WHERE space_id = sid AND task_id = t.task_id AND released_at IS NULL;
  UPDATE operational_tasks SET status = 'CANCELLED', state_version = state_version + 1, request_version = rev, reason = d->>'reason',
   details = details || jsonb_build_object('revision_history', history) WHERE space_id = sid AND task_id = t.task_id;
  INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'APPLIED');
  PERFORM emit_callback(t.task_id, 'system:request-change', d->>'reason');
  RETURN jsonb_build_object('disposition', 'CANCELLED', 'task_id', t.task_id);
 END IF;
 IF kind = 'cancel' THEN                                        -- physical work may be under way: stop-confirmation workflow
  UPDATE operational_tasks SET state_version = state_version + 1, request_version = rev,
   details = details || jsonb_build_object('revision_history', history, 'pending_change', jsonb_build_object('kind', 'cancel', 'request_version', rev::text,
     'reason', d->>'reason', 'requested_at', clock_timestamp())) WHERE space_id = sid AND task_id = t.task_id;
  INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'APPLIED');
  RETURN jsonb_build_object('disposition', 'STOP_CONFIRMATION_REQUIRED', 'task_id', t.task_id);
 END IF;
 -- amend: revalidate location from the approved replacement only
 SELECT * INTO r FROM hotel_rooms WHERE space_id = sid AND room_number = repl->>'room_number';
 IF started AND (repl->>'room_number' IS DISTINCT FROM t.location_label OR repl->>'entry_permission' IS DISTINCT FROM t.entry_permission) THEN
  UPDATE operational_tasks SET state_version = state_version + 1, request_version = rev,
   details = details || jsonb_build_object('revision_history', history, 'pending_change', jsonb_build_object('kind', 'amend', 'request_version', rev::text,
     'reason', d->>'reason', 'replacement', repl, 'requested_at', clock_timestamp())) WHERE space_id = sid AND task_id = t.task_id;
  INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'APPLIED');
  RETURN jsonb_build_object('disposition', 'STOP_CONFIRMATION_REQUIRED', 'task_id', t.task_id);
 END IF;
 SELECT * INTO pol FROM task_sla_policies WHERE space_id = sid AND policy_id = t.sla_policy_id;
 deadline := least((repl->>'due_at')::timestamptz, clock_timestamp() + make_interval(secs => pol.target_seconds));   -- ingest_request's own rule
 UPDATE operational_tasks SET state_version = state_version + 1, request_version = rev, title = repl->>'summary',
  due_at = deadline, warning_at = deadline - make_interval(secs => pol.warning_seconds),
  entry_permission = repl->>'entry_permission', location_label = repl->>'room_number',
  location_kind = CASE WHEN r.room_id IS NULL THEN 'UNRESOLVED' ELSE 'ROOM' END, room_id = r.room_id,
  requested_service_at = (repl->>'requested_service_at')::timestamptz,
  source_message_ids = ARRAY(SELECT jsonb_array_elements_text(d->'source_message_ids')::uuid),
  details = details || jsonb_build_object('revision_history', history, 'authority', repl->'authority', 'requested_quantity', repl->'requested_quantity',
    'guest_locale', repl->'guest_locale')
  WHERE space_id = sid AND task_id = t.task_id;
 INSERT INTO task_inbox VALUES (sid, src, eid, rid, rev, p_sha256, clock_timestamp(), t.task_id, 'APPLIED');
 RETURN jsonb_build_object('disposition', 'AMENDED', 'task_id', t.task_id);
END $$;
-- The in-progress cancellation completes only when the assignee or a supervisor confirms the physical stop.
CREATE FUNCTION ops.confirm_stop(p_task uuid, p_expected bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $$
DECLARE t operational_tasks; me staff_members; BEGIN
 SELECT * INTO STRICT me FROM staff_members WHERE space_id = tenant() AND staff_id = actor() AND enabled;
 SELECT * INTO STRICT t FROM operational_tasks WHERE space_id = tenant() AND task_id = p_task FOR UPDATE;
 IF t.state_version <> p_expected THEN RAISE EXCEPTION 'stale stop confirmation'; END IF;
 IF t.details->'pending_change'->>'kind' IS DISTINCT FROM 'cancel' THEN RAISE EXCEPTION 'no pending cancellation'; END IF;
 IF me.staff_role <> 'SUPERVISOR' AND NOT EXISTS (SELECT 1 FROM task_assignments WHERE space_id = t.space_id AND task_id = t.task_id AND staff_id = me.staff_id AND released_at IS NULL)
  THEN RAISE EXCEPTION 'only the assignee or a supervisor can confirm the stop'; END IF;
 UPDATE task_assignments SET released_at = clock_timestamp(), release_reason = 'REQUEST_CANCELLED' WHERE space_id = t.space_id AND task_id = t.task_id AND released_at IS NULL;
 UPDATE operational_tasks SET status = 'CANCELLED', state_version = state_version + 1, reason = t.details->'pending_change'->>'reason',
  details = (details - 'pending_change') || jsonb_build_object('stop_confirmed_by', me.staff_id, 'stop_confirmed_at', clock_timestamp())
  WHERE space_id = t.space_id AND task_id = t.task_id;
 PERFORM emit_callback(t.task_id, 'staff:' || me.staff_id, t.details->'pending_change'->>'reason');
 RETURN jsonb_build_object('disposition', 'CANCELLED', 'task_id', t.task_id); END $$;
RESET ROLE;
REVOKE ALL ON FUNCTION ops.apply_request_change(jsonb, text), ops.confirm_stop(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.apply_request_change(jsonb, text) TO ops_integration;
GRANT EXECUTE ON FUNCTION ops.confirm_stop(uuid, bigint) TO ops_human;

-- @@cr12_app5
-- F3: identity link. Nullable so legacy fixtures keep working; unique when present (see @@cr12_f3_enforce).
ALTER TABLE workforce.ai_members ADD COLUMN auth_subject text CHECK (auth_subject IS NULL OR auth_subject ~ '^[^[:space:]]{3,255}$');
CREATE UNIQUE INDEX ai_members_subject_unique ON workforce.ai_members (space_id, auth_subject) WHERE auth_subject IS NOT NULL;
SET ROLE ai_owner;
-- F1: resume is a distinct grant, so it no longer requires (and no longer implies) graph-publish authority.
CREATE TABLE workforce.ai_member_grants (
 space_id uuid NOT NULL, actor_id uuid NOT NULL, grant_name text NOT NULL CHECK (grant_name IN ('SESSION_RESUME')),
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, actor_id, grant_name),
 FOREIGN KEY (space_id, actor_id) REFERENCES workforce.ai_members);
ALTER TABLE workforce.ai_member_grants ENABLE ROW LEVEL SECURITY; ALTER TABLE workforce.ai_member_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON workforce.ai_member_grants USING (space_id = workforce.tenant()) WITH CHECK (space_id = workforce.tenant());
CREATE OR REPLACE FUNCTION workforce.resume_session(s uuid,expected bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,workforce,public,pg_temp AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM ai_members m WHERE m.space_id=tenant() AND m.actor_id=actor() AND m.enabled AND (m.role_name='APPROVER'
   OR EXISTS(SELECT 1 FROM ai_member_grants g WHERE g.space_id=m.space_id AND g.actor_id=m.actor_id AND g.grant_name='SESSION_RESUME'))) THEN RAISE EXCEPTION 'human resume required';END IF;
 UPDATE agent_execution_sessions SET state='QUEUED',state_version=state_version+1,lease_until=NULL WHERE space_id=tenant() AND session_id=s AND state='INTERRUPTED' AND state_version=expected AND deadline>clock_timestamp() AND context_valid_until>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'stale resume';END IF;PERFORM audit(s,'RESUMED');PERFORM emit_state(s); END $$;
-- F2: a draft's author is whoever is acting, never a caller-chosen colleague.
CREATE FUNCTION workforce.require_graph_author() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, workforce, pg_temp AS $$
BEGIN
 IF workforce.actor() IS NULL OR NEW.created_by IS DISTINCT FROM workforce.actor() THEN
  RAISE EXCEPTION 'graph author must be the acting member' USING ERRCODE = '42501'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER graph_author_is_actor BEFORE INSERT ON workforce.agent_graph_definitions FOR EACH ROW EXECUTE FUNCTION workforce.require_graph_author();
RESET ROLE;

-- @@cr12_f3_enforce  (deployment switch after backfill; breaks fixtures that insert anonymous members)
ALTER TABLE workforce.ai_members ALTER COLUMN auth_subject SET NOT NULL;
```

## Appendix B — kernel revision

Revision of the Sub-Component A experimental kernel for F1/F3 (signature-preserving replacements of two kernel functions).

<!-- artifact: kernel_v2.sql -->
```sql
-- EXPERIMENTAL Sub-Component A kernel revision for CR12 (F1/F3). Applied after kernel_experiment.sql and bridges.sql.
-- Signature-preserving CREATE OR REPLACE of two experimental kernel functions; nothing locked is touched here.

-- @@kernel_v2
GRANT SELECT (auth_subject), INSERT (auth_subject), UPDATE (auth_subject) ON workforce.ai_members TO platform_provisioner;
GRANT SELECT, INSERT, DELETE ON workforce.ai_member_grants TO platform_provisioner;

-- F1: approval authority comes ONLY from ai.graph.approve. ai.session.resume maps to a SESSION_RESUME grant.
CREATE OR REPLACE FUNCTION platform.local_roles(caps text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
 SELECT jsonb_build_object(
  'app1_operator', caps && ARRAY['cc.conversation.claim','cc.message.send'],
  'app3_staff_role', CASE WHEN caps && ARRAY['ops.room.inspect','ops.task.supervise'] THEN 'SUPERVISOR'
                          WHEN 'ops.request.triage' = ANY(caps) THEN 'FRONT_DESK'
                          WHEN 'ops.maintenance.work' = ANY(caps) THEN 'TECHNICIAN'
                          WHEN 'ops.task.work' = ANY(caps) THEN 'ATTENDANT' END,
  'app4_role_name', CASE WHEN caps && ARRAY['kb.policy.approve','kb.policy.archive'] THEN 'APPROVER'
                         WHEN 'kb.document.upload' = ANY(caps) THEN 'EDITOR' END,
  'app5_role_name', CASE WHEN 'ai.graph.approve' = ANY(caps) THEN 'APPROVER'
                         WHEN caps && ARRAY['ai.graph.configure','ai.session.resume'] THEN 'CONFIGURATOR' END,
  'app5_grants', CASE WHEN 'ai.session.resume' = ANY(caps) AND NOT 'ai.graph.approve' = ANY(caps)
                      THEN jsonb_build_array('SESSION_RESUME') ELSE '[]'::jsonb END) $$;

CREATE OR REPLACE FUNCTION platform.project_member(p_space uuid, p_member uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp SET app.space_id = '' AS $$
DECLARE m platform.members; p platform.principals; caps text[]; r jsonb; sk text[]; live boolean;
BEGIN
 SELECT * INTO STRICT m FROM platform.members WHERE space_id = p_space AND member_id = p_member;
 SELECT * INTO STRICT p FROM platform.principals WHERE principal_id = m.principal_id;
 caps := platform.effective_capabilities(p_space, p_member);
 r := platform.local_roles(caps);
 SELECT coalesce(array_agg(skill ORDER BY skill), '{}') INTO sk FROM platform.member_skills WHERE space_id = p_space AND member_id = p_member;
 PERFORM pg_catalog.set_config('app.space_id', p_space::text, true);
 IF (r->>'app1_operator')::boolean THEN
  INSERT INTO contact_center.participants (space_id, id, kind, display_name, auth_subject)
  VALUES (p_space, p_member, 'operator', p.display_name, p.auth_subject)
  ON CONFLICT (space_id, id) DO UPDATE SET display_name = EXCLUDED.display_name;
 END IF;
 live := r->>'app3_staff_role' IS NOT NULL;
 INSERT INTO ops.staff_members (space_id, staff_id, auth_subject, display_name, enabled, staff_role, skills)
 SELECT p_space, p_member, p.auth_subject, p.display_name, live, coalesce(r->>'app3_staff_role','ATTENDANT'), sk
 WHERE live OR EXISTS (SELECT 1 FROM ops.staff_members WHERE space_id = p_space AND staff_id = p_member)
 ON CONFLICT (space_id, staff_id) DO UPDATE SET display_name = EXCLUDED.display_name, enabled = EXCLUDED.enabled,
   staff_role = CASE WHEN EXCLUDED.enabled THEN EXCLUDED.staff_role ELSE ops.staff_members.staff_role END, skills = EXCLUDED.skills;
 live := r->>'app4_role_name' IS NOT NULL;
 INSERT INTO kb.knowledge_members (space_id, actor_id, auth_subject, role_name, enabled)
 SELECT p_space, p_member, p.auth_subject, coalesce(r->>'app4_role_name','EDITOR'), live
 WHERE live OR EXISTS (SELECT 1 FROM kb.knowledge_members WHERE space_id = p_space AND actor_id = p_member)
 ON CONFLICT (space_id, actor_id) DO UPDATE SET enabled = EXCLUDED.enabled,
   role_name = CASE WHEN EXCLUDED.enabled THEN EXCLUDED.role_name ELSE kb.knowledge_members.role_name END;
 live := r->>'app5_role_name' IS NOT NULL;
 INSERT INTO workforce.ai_members (space_id, actor_id, role_name, enabled, auth_subject)          -- F3: identity link written
 SELECT p_space, p_member, coalesce(r->>'app5_role_name','CONFIGURATOR'), live, p.auth_subject
 WHERE live OR EXISTS (SELECT 1 FROM workforce.ai_members WHERE space_id = p_space AND actor_id = p_member)
 ON CONFLICT (space_id, actor_id) DO UPDATE SET enabled = EXCLUDED.enabled, auth_subject = EXCLUDED.auth_subject,
   role_name = CASE WHEN EXCLUDED.enabled THEN EXCLUDED.role_name ELSE workforce.ai_members.role_name END;
 DELETE FROM workforce.ai_member_grants WHERE space_id = p_space AND actor_id = p_member
  AND NOT (grant_name = ANY (ARRAY(SELECT jsonb_array_elements_text(r->'app5_grants'))) AND live);
 IF live THEN
  INSERT INTO workforce.ai_member_grants (space_id, actor_id, grant_name)
  SELECT p_space, p_member, g FROM jsonb_array_elements_text(r->'app5_grants') g ON CONFLICT DO NOTHING;
 END IF;
 RETURN r || jsonb_build_object('capabilities', to_jsonb(caps), 'skills', to_jsonb(sk));
END $$;
GRANT EXECUTE ON FUNCTION platform.local_roles(text[]) TO platform_provisioner;
```

## Appendix C — CR7 JSON Schemas

CR7 contract 1 of 2.

<!-- artifact: contracts/profile-changed-event.schema.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.smartstay.example/guest-crm/profile-changed-event/1",
  "title": "ProfileChangedEvent (App 2 crm_outbox envelope, 02:L738 mapping)",
  "type": "object",
  "additionalProperties": false,
  "required": ["event_id", "type", "space_id", "occurred_at", "causation_id", "schema_version", "data"],
  "properties": {
    "event_id": {"type": "string", "format": "uuid"},
    "type": {"const": "ProfileChangedEvent"},
    "space_id": {"type": "string", "format": "uuid"},
    "occurred_at": {"type": "string", "format": "date-time"},
    "causation_id": {"type": "string", "format": "uuid", "description": "Required: crm_outbox CHECK demands causation for every non-erasure event (02:L470)."},
    "schema_version": {"const": 1},
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": ["profile_id", "profile_version", "privacy_epoch", "reason_code"],
      "properties": {
        "profile_id": {"type": "string", "format": "uuid"},
        "profile_version": {"type": "string", "pattern": "^[1-9][0-9]{0,18}$", "description": "Consistency token, not a gap-free counter (02:L740)."},
        "privacy_epoch": {"type": "string", "pattern": "^[1-9][0-9]{0,18}$"},
        "reason_code": {"enum": ["permission_revoked", "guest_corrected", "merge_applied", "merge_undone", "expired_contribution"]}
      }
    }
  }
}
```

CR7 contract 2 of 2.

<!-- artifact: contracts/profile-erasure-requested-event.schema.json -->
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.smartstay.example/guest-crm/profile-erasure-requested-event/1",
  "title": "ProfileErasureRequestedEvent (App 2 crm_outbox envelope, 02:L738 mapping); restricted privacy-control message",
  "type": "object",
  "additionalProperties": false,
  "required": ["event_id", "type", "space_id", "occurred_at", "causation_id", "schema_version", "data"],
  "properties": {
    "event_id": {"type": "string", "format": "uuid"},
    "type": {"const": "ProfileErasureRequestedEvent"},
    "space_id": {"type": "string", "format": "uuid"},
    "occurred_at": {"type": "string", "format": "date-time"},
    "causation_id": {"anyOf": [{"type": "string", "format": "uuid"}, {"type": "null"}], "description": "Erasure is a root command; erase_profile() emits it without causation."},
    "schema_version": {"const": 1},
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": ["request_id", "profile_id", "privacy_epoch", "source_subjects"],
      "properties": {
        "request_id": {"type": "string", "format": "uuid"},
        "profile_id": {"type": "string", "format": "uuid"},
        "privacy_epoch": {"type": "string", "pattern": "^[1-9][0-9]{0,18}$"},
        "source_subjects": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["source", "subject_id"],
            "properties": {
              "source": {"type": "string", "minLength": 1},
              "subject_id": {"type": "string", "format": "uuid"}
            }
          }
        }
      }
    }
  }
}
```

## Appendix D — bridge verification harness

Bridge verification harness. Parts: A = App 1 (CR5, F4, CR2, CR1), B = App 2 (CR6, CR7), C = App 3 (CR8, CR9), D = App 5 (F1-F3).

<!-- artifact: test_bridges.py -->
```python
"""Sub-Component C micro-research harness. Parts run on clones of `mesh_base` (built by the Sub-Component B builder on a
kernel_clean that already carries bridges.sql) and, for negative controls, on `kernel_locked` (pristine locked DDL).
Run from the repository root after the regression gate has built mesh_base."""
import subprocess, json, re, uuid, hashlib, sys, time, os, copy
from pathlib import Path

W = Path(__file__).resolve().parent.parent
SOCK, PORT = str(W / 'socket'), '55466'
BR = W / 'bridges'
SQL = (BR / 'bridges.sql').read_text(); KV2 = (BR / 'kernel_v2.sql').read_text()
SP = json.loads((W / 'mesh' / 'spaces.json').read_text())
S1 = SP['S1']
RESULTS, EVIDENCE = [], {}
def uid(n): return str(uuid.UUID(int=n))
STAFF, OTHER, SUPERVISOR, POLICY = uid(20), uid(21), uid(22), uid(40)

def psql(sql, db, user=None, check=True):
    cmd = ['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-F', '|'] + (['-U', user] if user else [])
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if check and r.returncode: raise RuntimeError(f'{db}: {r.stderr}\n--- SQL ---\n{sql[:1500]}')
    return r
def val(sql, db): return psql(sql, db).stdout.strip()
def lit(x): return "'" + str(x).replace("'", "''") + "'"
def q(sql, db, role=None, space=None, actor=None, staff=None, fail=False, tz=None):
    pre = ['BEGIN;']
    if space: pre.append(f"SET LOCAL app.space_id = '{space}';")
    if actor: pre.append(f"SET LOCAL app.actor_id = '{actor}';")
    if staff: pre.append(f"SET LOCAL app.staff_id = '{staff}';")
    if tz: pre.append(f"SET LOCAL TimeZone = '{tz}';")
    if role: pre.append(f'SET LOCAL ROLE {role};')
    r = psql('\n'.join(pre) + '\n' + sql + '\nCOMMIT;', db, check=False)
    if fail:
        assert r.returncode != 0, f'expected failure: {sql[:300]}'
        return next((l for l in r.stderr.splitlines() if 'ERROR' in l), r.stderr.strip())
    if r.returncode: raise RuntimeError(r.stderr + '\n' + sql[:1500])
    return r.stdout.strip()
def ok(name, cond, evidence=None):
    RESULTS.append({'check': name, 'passed': bool(cond), 'evidence': evidence})
    print(('PASS ' if cond else 'FAIL ') + name + (f'  :: {str(evidence)[:300]}' if evidence is not None else ''), flush=True)
def fresh(db, template='mesh_base', kernel_v2=False):
    psql(f'DROP DATABASE IF EXISTS {db};', 'postgres'); psql(f'CREATE DATABASE {db} TEMPLATE {template};', 'postgres')
    if kernel_v2: psql(KV2, db)
def section(name, text=SQL):
    m = re.search(r'^-- @@' + re.escape(name) + r'\b.*?\n(.*?)(?=^-- @@|\Z)', text, re.S | re.M); assert m, name; return m.group(1)
def validator(path_or_id):
    from referencing import Registry, Resource
    from jsonschema import Draft202012Validator, FormatChecker
    reg = Registry(); ids = {}
    for p in list((W / 'app5' / 'contracts').glob('*.json')) + list((BR / 'contracts').glob('*.json')):
        o = json.loads(p.read_text())
        if isinstance(o, dict) and '$id' in o and '$schema' in o: reg = reg.with_resource(o['$id'], Resource.from_contents(o)); ids[o['$id']] = o
    return Draft202012Validator(ids[path_or_id], registry=reg, format_checker=FormatChecker())
def errs(v, obj): return [e.message for e in v.iter_errors(obj)]

# ---------- App 1 conversation fixture (real triggers; context set; pinned functions) ----------
def conversation(db, space, verified=True, n_in=2, internal_note=True):
    g, ai, op, op2, ch, conv, chap, res = (str(uuid.uuid4()) for _ in range(8))
    sql = [f"BEGIN; SET LOCAL app.space_id='{space}'; SET LOCAL search_path = contact_center, pg_catalog;",   # locked App 1 triggers are unpinned
      f"INSERT INTO contact_center.channels(space_id,id,kind,provider_account_id,credential_ref) VALUES('{space}','{ch}','whatsapp','acct-{ch[:8]}','secret://whatsapp/{ch[:8]}');",
      f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{space}','{g}','guest','Guest (synthetic)'),('{space}','{ai}','ai','Mia (AI)');",
      f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{space}','{op}','operator','Reception A','oidc|op|{op[:8]}'),('{space}','{op2}','operator','Reception B','oidc|op|{op2[:8]}');"]
    if verified:
        sql.append(f"INSERT INTO contact_center.reservations(space_id,id,pms_system,pms_reservation_id,primary_guest_id,arrival_at,departure_at,status,room_type,room_number,source_version,source_updated_at) VALUES('{space}','{res}','fixture-pms','R-{res[:6]}','{g}',now()-interval '1 day',now()+interval '2 days','in_house','deluxe','304','v7',now());")
        sql.append(f"INSERT INTO contact_center.conversations(space_id,id,guest_id,reservation_id,binding_status) VALUES('{space}','{conv}','{g}','{res}','verified');")
    else:
        sql.append(f"INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{space}','{conv}','{g}');")
    for p in (g, ai, op, op2): sql.append(f"INSERT INTO contact_center.conversation_participants VALUES('{space}','{conv}','{p}');")
    sql.append(f"INSERT INTO contact_center.conversation_channels(space_id,conversation_id,channel_id,external_thread_id,recipient_subject) VALUES('{space}','{conv}','{ch}','thr-{conv[:8]}','whatsapp:+995555000{conv[:3]}');")
    sql.append(f"INSERT INTO contact_center.conversation_chapters(space_id,id,conversation_id,title,journey_stage,topic,start_seq) VALUES('{space}','{chap}','{conv}','Stay','in_stay','service',1);")
    for i in range(n_in):
        sql.append(f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,provider_message_id,provider_event_key,control_version,occurred_at) VALUES('{space}','{conv}','{chap}','{ch}','{g}',0,'inbound','Could we get extra towels in room 304? ({i})','wamid-{conv[:6]}-{i}','evt-{conv[:6]}-{i}',0,now());")
    sql.append(f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,client_command_key,control_version,occurred_at) VALUES('{space}','{conv}','{chap}','{ch}','{ai}',0,'outbound','Of course - towels are on their way.','cmd-{conv[:6]}-ai',0,now());")
    if internal_note:
        sql.append(f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,client_command_key,control_version,occurred_at) VALUES('{space}','{conv}','{chap}','{ch}','{op}',0,'internal','Staff note: VIP, do not mention price.','cmd-{conv[:6]}-note',0,now());")
    sql.append('COMMIT;'); psql('\n'.join(sql), db)
    return dict(guest=g, ai=ai, op=op, op2=op2, channel=ch, conv=conv, chapter=chap, res=res)

def cc(db, space, stmt, fail=False, tz=None):
    return q(stmt, db, space=space, fail=fail, tz=tz)

# =====================================================================================
# PART A - App 1 bridges: CR5 search_path, CR4 disabled operators, CR2 resolved snapshots, CR1 policy consumer
# =====================================================================================
def partA():
    # ---- CR5 ------------------------------------------------------------------------
    for db, tpl in [('a_locked', 'kernel_locked'), ('a_bridged', 'kernel_clean')]:
        fresh(db, tpl)
        sp = str(uuid.uuid4())
        psql(f"""INSERT INTO contact_center.spaces(id,property_code,name) VALUES('{sp}','HIJACK-{db[-6:].upper()}','Hijack probe');
          CREATE SCHEMA evil; CREATE TABLE evil.conversations(space_id uuid, id uuid, next_event_seq bigint);""", db)
        f = conversation(db, sp, verified=False, n_in=1, internal_note=False)
        psql(f"INSERT INTO evil.conversations VALUES('{sp}','{f['conv']}',990);", db)
        r = psql(f"""BEGIN; SET LOCAL app.space_id='{sp}'; SET LOCAL search_path = evil, contact_center, pg_catalog;
          INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{sp}','{f['conv']}',0,'MessageRecordedEvent','probe-1',gen_random_uuid(),'{{}}') RETURNING event_seq; COMMIT;""", db, check=False)
        EVIDENCE[f'cr5_hijack_{db}'] = (r.returncode, r.stdout.strip(), r.stderr.strip()[:120])
        r2 = psql(f"""BEGIN; SET LOCAL app.space_id='{sp}'; SET LOCAL search_path = pg_catalog;
          INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{sp}','{f['conv']}',0,'MessageRecordedEvent','probe-2',gen_random_uuid(),'{{}}') RETURNING event_seq; COMMIT;""", db, check=False)
        EVIDENCE[f'cr5_catalog_only_{db}'] = (r2.returncode, r2.stdout.strip(), next((l for l in r2.stderr.splitlines() if 'ERROR' in l), ''))
    ok('A.01 NEGATIVE (locked): with an attacker schema first on search_path, App 1 allocate_event() takes event_seq from evil.conversations (990)',
       EVIDENCE['cr5_hijack_a_locked'][0] == 0 and EVIDENCE['cr5_hijack_a_locked'][1] == '990', EVIDENCE['cr5_hijack_a_locked'])
    ok('A.02 CR5 (bridged): the pinned trigger ignores the caller path and allocates from contact_center.conversations', EVIDENCE['cr5_hijack_a_bridged'][:2] == (0, '1'), EVIDENCE['cr5_hijack_a_bridged'])
    ok('A.03 NEGATIVE (locked) vs CR5: a producer whose path is only pg_catalog fails on locked App 1 (Sub-B hazard H4) and succeeds once pinned',
       'does not exist' in EVIDENCE['cr5_catalog_only_a_locked'][2] and EVIDENCE['cr5_catalog_only_a_bridged'][0] == 0,
       {'locked': EVIDENCE['cr5_catalog_only_a_locked'][2][:90], 'bridged_event_seq': EVIDENCE['cr5_catalog_only_a_bridged'][1]})
    pinned = val("""SELECT n.nspname||':'||count(*)||'/'||count(*) FILTER (WHERE EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('contact_center','guest_crm') AND p.prokind='f' GROUP BY n.nspname ORDER BY n.nspname;""", 'a_bridged').split()
    ok('A.04 CR5: every App 1 and App 2 function (including trigger functions and the new bridge functions) now pins search_path',
       all(x.split(':')[1].split('/')[0] == x.split('/')[1] for x in pinned), pinned)

    # ---- CR4 ------------------------------------------------------------------------
    db = 'a_cr4'; fresh(db)
    KV = SP['KV']; f = conversation(db, KV)
    e = cc(db, KV, f"UPDATE contact_center.participants SET disabled_at = now(), disabled_reason = 'left property' WHERE id = '{f['guest']}';", fail=True)
    e2 = cc(db, KV, f"UPDATE contact_center.participants SET disabled_at = now() WHERE id = '{f['op']}';", fail=True)
    ok('A.05 CR4: only operators can be disabled, and a disable always carries a reason', 'participant_disable_operator_only' in e and 'participant_disable_reason' in e2, [e, e2])
    cc(db, KV, f"UPDATE contact_center.participants SET disabled_at = now(), disabled_reason = 'contract ended' WHERE id = '{f['op']}';")
    e = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{f['conv']}',0,'OPERATOR_LOCKED','{f['op']}','{f['op']}','claim');", fail=True)
    v = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{f['conv']}',0,'OPERATOR_LOCKED','{f['op2']}','{f['op2']}','claim');")
    ok('A.06 CR4: a disabled operator cannot claim a conversation; an enabled colleague can (App 1 change_control unchanged)', 'is disabled' in e and v == '1', {'disabled': e, 'enabled_claim_version': v})
    cc(db, KV, f"UPDATE contact_center.participants SET disabled_at = now(), disabled_reason = 'shift ended abruptly' WHERE id = '{f['op2']}';")
    e = cc(db, KV, f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,client_command_key,control_version,occurred_at) VALUES('{KV}','{f['conv']}','{f['chapter']}','{f['channel']}','{f['op2']}',0,'outbound','hello','cmd-x',1,now());", fail=True)
    g = cc(db, KV, f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,provider_message_id,provider_event_key,control_version,occurred_at) VALUES('{KV}','{f['conv']}','{f['chapter']}','{f['channel']}','{f['guest']}',0,'inbound','still waiting','wamid-z','evt-z',0,now()) RETURNING seq;")
    ok('A.07 CR4: an operator disabled while owning a conversation can no longer send; guest traffic still records', 'is disabled' in e and g.isdigit(), {'send': e, 'guest_seq': g})

    # ---- CR2 ------------------------------------------------------------------------
    db = 'a_cr2'; fresh(db); f = conversation(db, KV, n_in=2)
    before = val(f"SELECT md5(string_agg(to_jsonb(m)::text, ',' ORDER BY seq)) FROM contact_center.messages m WHERE conversation_id='{f['conv']}';", db)
    v1 = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{f['conv']}',0,'RESOLVED','{f['ai']}',NULL,'Guest thanked us');")
    after = val(f"SELECT md5(string_agg(to_jsonb(m)::text, ',' ORDER BY seq)) FROM contact_center.messages m WHERE conversation_id='{f['conv']}';", db)
    ev = val(f"SELECT id FROM contact_center.outbox_events WHERE conversation_id='{f['conv']}' AND payload->>'state'='RESOLVED';", db)
    m1 = json.loads(cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v1});"))
    EVIDENCE['manifest_v1'] = m1
    V = validator('https://schemas.smartstay.example/guest-crm/resolved-snapshot-manifest/1')
    ok('A.08 CR2: resolution captures a manifest in the same transaction; it validates against App 2 resolved-snapshot-manifest/1', not errs(V, m1), errs(V, m1)[:3])
    ok('A.09 CR2: manifest binds the exact RESOLVED event id and control version; transcript rows untouched by capture',
       m1['source_event_id'] == ev and m1['source_control_version'] == v1 and before == after, {'event': ev[:8], 'version': v1})
    ok('A.10 CR2: through_seq covers guest-visible traffic only (2 inbound + 1 outbound); the internal staff note (seq 4) is excluded',
       m1['chapters'][0]['through_seq'] == '3' and val(f"SELECT message_count FROM contact_center.resolved_snapshot_chapters WHERE conversation_id='{f['conv']}';", db) == '3')
    d_utc = cc(db, KV, f"SELECT digest FROM contact_center.chapter_digest('{KV}','{f['conv']}','{f['chapter']}',3);", tz='UTC')
    d_tbs = cc(db, KV, f"SELECT digest FROM contact_center.chapter_digest('{KV}','{f['conv']}','{f['chapter']}',3);", tz='Asia/Tbilisi')
    ok('A.11 CR2: the source digest is independent of session TimeZone (timestamps canonicalized to UTC) and equals the captured one',
       d_utc == d_tbs == m1['chapters'][0]['source_digest'], d_utc[:16])
    # reopen, new guest message, resolve again: v1 manifest must not change
    v2 = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{f['conv']}',{v1},'AI_ACTIVE','{f['op']}',NULL,'Guest wrote again');")
    cc(db, KV, f"INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,provider_message_id,provider_event_key,control_version,occurred_at) VALUES('{KV}','{f['conv']}','{f['chapter']}','{f['channel']}','{f['guest']}',0,'inbound','And a bottle of Saperavi, please','wamid-r','evt-r',0,now());")
    v3 = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{f['conv']}',{v2},'RESOLVED','{f['ai']}',NULL,'Resolved again');")
    m1b = json.loads(cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v1});"))
    m3 = json.loads(cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v3});"))
    ok('A.12 CR2: after reopen + new message + second resolution, the v1 manifest is byte-identical and v3 is a separate, longer snapshot (never "latest transcript")',
       m1b == m1 and m3['chapters'][0]['through_seq'] == '5' and m3['source_control_version'] == v3 and not errs(V, m3), {'v1_through': m1b['chapters'][0]['through_seq'], 'v3_through': m3['chapters'][0]['through_seq']})
    e1 = cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v2});", fail=True)
    fu = conversation(db, KV, verified=False)
    vu = cc(db, KV, f"SELECT contact_center.change_control('{KV}','{fu['conv']}',0,'RESOLVED','{fu['ai']}',NULL,'done');")
    e2 = cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{fu['conv']}', {vu});", fail=True)
    e3 = q(f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v1});", db, space=SP['SG'], fail=True)
    ok('A.13 CR2: 409 cases - no snapshot at a non-resolution version, unverified binding, and another tenant (RLS) - never a fallback',
       'NO_SNAPSHOT_AT_VERSION' in e1 and 'BINDING_NOT_VERIFIED' in e2 and 'NO_SNAPSHOT_AT_VERSION' in e3, [e1, e2, e3])
    sqlstate = psql(f"\\set VERBOSITY verbose\nBEGIN; SET LOCAL app.space_id='{KV}'; SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v2}); COMMIT;", db, check=False).stderr
    ok('A.14 CR2: the endpoint signals with dedicated SQLSTATEs (SNP09 -> HTTP 409, SNP10 -> HTTP 410)', 'SNP09' in sqlstate, sqlstate.splitlines()[0][:80])
    e = cc(db, KV, f"UPDATE contact_center.resolved_snapshot_chapters SET through_seq = 1 WHERE conversation_id='{f['conv']}';", fail=True)
    e4 = cc(db, KV, f"DELETE FROM contact_center.resolved_snapshot_headers WHERE conversation_id='{f['conv']}';", fail=True)
    ok('A.15 CR2: captured snapshots are immutable (update and delete rejected)', 'immutable' in e and ('immutable' in e4 or 'foreign key' in e4), [e, e4])
    psql(f"""ALTER TABLE contact_center.resolved_snapshot_chapters DISABLE TRIGGER chapter_immutable;
      UPDATE contact_center.resolved_snapshot_chapters SET source_expires_at = now() - interval '1 second' WHERE conversation_id='{f['conv']}' AND control_version={v1};
      ALTER TABLE contact_center.resolved_snapshot_chapters ENABLE TRIGGER chapter_immutable;""", db)
    e5 = cc(db, KV, f"SELECT contact_center.resolved_snapshot_manifest('{f['conv']}', {v1});", fail=True)
    ok('A.16 CR2: once the source transcript passes its retention deadline the manifest answers 410 (SNP10), simulated clock', 'SNAPSHOT_SOURCE_GONE' in e5, e5)

    # ---- CR1 ------------------------------------------------------------------------
    def kb_events(db):
        return [json.loads(x) for x in val(f"SELECT payload FROM kb.storage_outbox WHERE space_id='{S1}' ORDER BY created_at, event_id;", db).splitlines()]
    def deliver(db, evs, fail=False):
        r = q(f"SELECT contact_center.apply_policy_events({lit(json.dumps(evs))}::jsonb);", db, space=S1, fail=fail)
        return r if fail else json.loads(r)
    def truth_diff(db):
        # active/superseded: same id and exact range as App 4; approved-then-archived: row kept, range ends at the archive instant
        a = set(val(f"""SELECT string_agg(x, ',') FROM (SELECT knowledge_item_id||'@'||valid_during::text x FROM kb.knowledge_policies WHERE space_id='{S1}' AND state IN ('APPROVED_ACTIVE','SUPERSEDED')
             UNION ALL SELECT p.knowledge_item_id||'@archived' FROM kb.knowledge_policies p WHERE p.space_id='{S1}' AND p.state='ARCHIVED' AND p.approved_at IS NOT NULL) s;""", db).split(','))
        b = set(val(f"""SELECT coalesce(string_agg(CASE WHEN s.state='ARCHIVED' THEN k.id||'@archived' ELSE k.id||'@'||k.valid_during::text END, ','), '')
             FROM contact_center.knowledge_items k LEFT JOIN contact_center.knowledge_item_state s ON s.space_id=k.space_id AND s.knowledge_item_id=k.id WHERE k.space_id='{S1}';""", db).split(','))
        return sorted(a ^ b)
    db = 'a_cr1'; fresh(db); evs = kb_events(db)
    EVIDENCE['kb_event_types'] = [f"{e['knowledge_epoch']}:{e['type'][6:-5]}" for e in evs]
    e = deliver(db, evs[0], fail=True)
    ok('A.17 CR1: an approval whose reviewer has no App 1 participant is refused (04:L228 - never invent an actor); nothing is applied',
       'APPROVER_NOT_PROJECTED' in e and val(f"SELECT count(*) FROM contact_center.knowledge_items WHERE space_id='{S1}';", db) == '0', e)
    reviewer = evs[0]['actor_id']
    q(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');", db, space=S1)
    outcomes = {}
    by_epoch = {}
    for e in evs: by_epoch.setdefault(e['knowledge_epoch'], []).append(e)
    for ep in sorted(by_epoch, key=int): outcomes.update(deliver(db, by_epoch[ep]))
    EVIDENCE['cr1_in_order'] = outcomes
    ok('A.18 CR1: all 12 real App 4 events applied in epoch order (the supersession pair as one group); App 1 projection equals App 4 approved/superseded truth exactly',
       all(v == 'APPLIED' for v in outcomes.values()) and len(outcomes) == 12 and truth_diff(db) == [], {'outcomes': sorted(set(outcomes.values())), 'diff': truth_diff(db)})
    st = val(f"SELECT string_agg(state, ',' ORDER BY state) FROM contact_center.knowledge_item_state WHERE space_id='{S1}';", db)
    arch = val(f"""SELECT s.knowledge_item_id||'|'||(upper(k.valid_during) = s.tombstoned_at)::text||'|'||(s.tombstoned_at IS NOT NULL)::text
       FROM contact_center.knowledge_item_state s JOIN contact_center.knowledge_items k ON k.space_id=s.space_id AND k.id=s.knowledge_item_id WHERE s.space_id='{S1}' AND s.state='ARCHIVED';""", db).split('|')
    arch_serv = q(f"SELECT contact_center.evidence_servable('{arch[0]}', 3, now());", db, space=S1)
    ok('A.19 CR1: the approved-then-archived item (menu.cellar v3) keeps its history row, range cut exactly at the archive instant, with a tombstone; never servable afterwards',
       arch[1:] == ['true', 'true'] and arch_serv == 'f' and st.count('ARCHIVED') == 1 and st.count('SUPERSEDED') == 1, {'states': st, 'archived': arch})
    pair = by_epoch[[k for k in by_epoch if len(by_epoch[k]) == 2][0]]
    succ = next(x for x in pair if x['type'] == 'PolicyApprovedEvent'); pred = next(x for x in pair if x['type'] == 'PolicySupersededEvent')
    dbs = 'a_cr1s'; fresh(dbs)          # observe the window between the supersession and the later archive of the successor
    q(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');", dbs, space=S1)
    for ep in sorted(by_epoch, key=int):
        deliver(dbs, by_epoch[ep])
        if by_epoch[ep] is pair: break
    s_now = q(f"SELECT contact_center.evidence_servable('{succ['knowledge_item_id']}', {succ['version']}, now());", dbs, space=S1)
    p_now = q(f"SELECT contact_center.evidence_servable('{pred['knowledge_item_id']}', {pred['version']}, now());", dbs, space=S1)
    s_end = q(f"SELECT contact_center.evidence_servable('{succ['knowledge_item_id']}', {succ['version']}, now());", db, space=S1)
    ok('A.20 CR1: right after the supersession the gate serves the successor and refuses the predecessor; after the later archive the successor is refused too',
       s_now == 't' and p_now == 'f' and s_end == 'f', {'successor_after_pair': s_now, 'predecessor': p_now, 'successor_after_archive': s_end})
    dup = deliver(db, evs[1]); forged = copy.deepcopy(evs[1]); forged['policy_key'] = 'forged'
    e = deliver(db, forged, fail=True)
    stale = copy.deepcopy(pred); stale['event_id'] = str(uuid.uuid4()); stale['type'] = 'PolicyApprovedEvent'; stale['state'] = 'APPROVED_ACTIVE'; stale['state_version'] = '4'
    st_o = deliver(db, stale)
    ok('A.21 CR1: exact redelivery is a no-op (DUPLICATE), a reused id with altered content is rejected, an older state_version is STALE',
       list(dup.values()) == ['DUPLICATE'] and 'different content' in e and list(st_o.values()) == ['STALE'], [dup, e, st_o])
    # reversed pair on a fresh clone: successor first, separately
    db2 = 'a_cr1r'; fresh(db2)
    q(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');", db2, space=S1)
    outs = {}
    for ep in sorted(by_epoch, key=int):
        grp = by_epoch[ep]
        if len(grp) == 2:
            outs.update(deliver(db2, succ)); outs.update(deliver(db2, pred))
        else: outs.update(deliver(db2, grp))
    ok('A.22 CR1: successor delivered before its predecessor is STAGED, then applied atomically right after the predecessor shortens; final state identical',
       outs[succ['event_id']] in ('STAGED', 'APPLIED_FROM_STAGE') and any(v == 'APPLIED_FROM_STAGE' for v in outs.values()) and truth_diff(db2) == [],
       {succ['event_id'][:8]: outs.get(succ['event_id']), 'staged_left': val(f"SELECT count(*) FROM contact_center.policy_event_stage;", db2)})
    # gap -> fence -> fill -> reconcile
    db3 = 'a_cr1g'; fresh(db3)
    q(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');", db3, space=S1)
    eps = sorted(by_epoch, key=int); gap_ep = pair[0]['knowledge_epoch']; later = eps[eps.index(gap_ep) + 2]
    for ep in eps[:eps.index(gap_ep)]: deliver(db3, by_epoch[ep])
    g_out = deliver(db3, by_epoch[later])
    fenced = q("SELECT dispatch_fenced||'|'||fence_reason FROM contact_center.knowledge_projection;", db3, space=S1)
    serv = q(f"SELECT contact_center.evidence_servable('{evs[0]['knowledge_item_id']}', {evs[0]['version']}, now());", db3, space=S1)
    ok('A.23 CR1: an epoch gap stages the event durably (safe to ack), fences AI dispatch, and even previously valid evidence stops being servable',
       set(g_out.values()) == {'GAP_FENCED'} and fenced.startswith('true') and serv == 'f', {'fence': fenced, 'servable': serv})
    early = q("SELECT contact_center.reconcile_knowledge();", db3, space=S1)
    for ep in eps[eps.index(gap_ep):eps.index(later)]: deliver(db3, by_epoch[ep])
    for ep in eps[eps.index(later) + 1:]: deliver(db3, by_epoch[ep])
    rec = json.loads(q("SELECT contact_center.reconcile_knowledge();", db3, space=S1))
    fenced2 = q("SELECT dispatch_fenced FROM contact_center.knowledge_projection;", db3, space=S1)
    ok('A.24 CR1: reconcile refuses to unfence while items are missing; after the gap fills (staged event drained) it verifies against App 4 and lifts the fence',
       json.loads(early)['status'] == 'STILL_FENCED' and rec['status'] == 'RECONCILED' and fenced2 == 'f' and truth_diff(db3) == [], {'early': json.loads(early), 'final': rec})
    # AI dispatch invalidation
    db4 = 'a_cr1c'; fresh(db4)
    q(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');", db4, space=S1)
    for ep in eps[:eps.index(gap_ep)]: deliver(db4, by_epoch[ep])
    fc = conversation(db4, S1, n_in=1, internal_note=False)
    ev_p = [{'knowledge_item_id': pred['knowledge_item_id'], 'policy_version': str(pred['version']), 'valid_at': '2026-09-24T00:00:00Z'}]
    ev_o = [{'knowledge_item_id': evs[1]['knowledge_item_id'], 'policy_version': str(evs[1]['version']), 'valid_at': '2026-09-24T00:00:00Z'}]
    ids = []
    for k, evd in [('a', ev_p), ('b', ev_o)]:
        mid = q(f"""INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,client_command_key,control_version,occurred_at,payload)
          VALUES('{S1}','{fc['conv']}','{fc['chapter']}','{fc['channel']}','{fc['ai']}',0,'outbound','Our 2022 Saperavi is 85 GEL per bottle.','cmd-{k}-{fc['conv'][:6]}',0,now(),{lit(json.dumps({'policy_evidence': evd}))}::jsonb) RETURNING id;""", db4, space=S1)
        q(f"INSERT INTO contact_center.message_deliveries(space_id,message_id,dispatch_epoch) VALUES('{S1}','{mid}',0);", db4, space=S1); ids.append(mid)
    deliver(db4, pair)
    st = val(f"SELECT string_agg(status||':'||coalesce(last_error_code,'-'), ',' ORDER BY message_id='{ids[0]}' DESC) FROM contact_center.message_deliveries WHERE message_id IN ('{ids[0]}','{ids[1]}');", db4)
    ok("A.25 CR1: applying the supersession cancels the queued AI reply citing the predecessor (EVIDENCE_WITHDRAWN) and leaves an unrelated queued reply alone",
       st == 'cancelled:EVIDENCE_WITHDRAWN,queued:-', st)
    # end-to-end through the Sub-Component B relay
    db5 = 'a_cr1e'; fresh(db5)
    psql((W / 'mesh' / 'mesh_experiment.sql').read_text(), db5)
    psql(f"""DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mesh_relay_login') THEN CREATE ROLE mesh_relay_login LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
      GRANT platform_relay TO mesh_relay_login;
      INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{reviewer}','operator','Knowledge reviewer (projected)','reviewer');
      CREATE FUNCTION contact_center.mesh_policy_consumer(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE sql SET search_path = pg_catalog, pg_temp
        AS $f$ SELECT contact_center.apply_policy_events(p_env) $f$;
      GRANT USAGE ON SCHEMA contact_center TO mesh_owner; GRANT EXECUTE ON FUNCTION contact_center.mesh_policy_consumer(jsonb,jsonb), contact_center.apply_policy_events(jsonb) TO mesh_owner;
      INSERT INTO mesh.routes SELECT 'kb', t, 'contact_center', 'contact_center.mesh_policy_consumer(jsonb,jsonb)'::regprocedure
        FROM unnest(ARRAY['PolicyApprovedEvent','PolicySupersededEvent','PolicyArchivedEvent']) t;""", db5)
    subprocess.run(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db5, '-U', 'mesh_relay_login', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', 'SET ROLE platform_relay',
                    '-c', "CALL mesh.r1_run('e2e', ARRAY['kb'], 10, '30 seconds', 4, 1);"], check=True, capture_output=True, text=True)
    pub = val(f"SELECT count(published_at)||'/'||count(*) FROM kb.storage_outbox WHERE space_id='{S1}';", db5)
    ok('A.26 CR1 end-to-end: the Sub-B R1 relay delivers all 12 real App 4 events to the App 1 consumer; every event acknowledged; projection equals App 4 truth',
       pub == '12/12' and truth_diff(db5) == [] and val("SELECT count(*) FROM contact_center.policy_event_inbox;", db5) == '12', {'published': pub})

# =====================================================================================
# PART B - App 2: CR6 recipient registry + receipt contract, CR7 schemas
# =====================================================================================
def partB():
    db = 'b_cr6'; fresh(db)
    rc = val("""SELECT string_agg(n::text, ',') FROM (SELECT count(*) n FROM guest_crm.erasure_receipts GROUP BY space_id, request_id) x;""", db)
    codes = val("SELECT string_agg(DISTINCT system_code, ',' ORDER BY system_code) FROM guest_crm.erasure_receipts;", db)
    ok('B.01 CR6: every erasure created by the unmodified erase_profile() now carries 7 recipients including workforce and kb',
       set(rc.split(',')) == {'7'} and 'workforce' in codes and 'kb' in codes, {'per_request': rc, 'codes': codes})
    dl = 'b_locked'; fresh(dl, 'kernel_locked'); sp = str(uuid.uuid4())
    psql(f"INSERT INTO guest_crm.spaces(id,property_code) VALUES('{sp}','LOCKED-CRM');", dl)
    q(f"INSERT INTO guest_crm.retention_policies(space_id,approved_by) VALUES('{sp}','{uuid.uuid4()}');", dl, space=sp)
    p = q(f"SET LOCAL search_path = guest_crm, pg_catalog; INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{sp}','visitor',now()+interval '7 days') RETURNING id;", dl, space=sp)
    q(f"SET LOCAL search_path = guest_crm, pg_catalog; SELECT guest_crm.erase_profile('{sp}','{p}','rtbf');", dl, space=sp)
    lc = val(f"SELECT string_agg(system_code, ',' ORDER BY system_code) FROM guest_crm.erasure_receipts WHERE space_id='{sp}';", dl)
    ok('B.02 NEGATIVE (locked): the same function on locked App 2 creates only the five hardcoded recipients - no workforce, no kb', 'workforce' not in lc and lc.count(',') == 4, lc)
    req = val(f"SELECT id FROM guest_crm.erasure_requests WHERE space_id='{S1}' ORDER BY requested_at LIMIT 1;", db)
    def rec(sys_, outc, code=None, fail=False):
        return q(f"SELECT guest_crm.record_erasure_receipt('{req}','{sys_}','{outc}',{lit(code) if code else 'NULL'});", db, space=S1, fail=fail)
    e1 = rec('workforce', 'pending', fail=True); e2 = rec('analytics', 'erased', fail=True); e3 = rec('backup_ledger', 'lawful_restriction', fail=True)
    ok('B.03 CR6 receipt contract rejects non-terminal outcomes, unregistered recipients and a lawful restriction without a reason code',
       'terminal' in e1 and 'not registered' in e2 and 'reason code' in e3, [e1, e2, e3])
    states = [rec(s, 'erased') for s in ['contact_center', 'operations', 'cache_search', 'object_store', 'workforce', 'kb']]
    last = rec('backup_ledger', 'lawful_restriction', 'BACKUP_ROTATION_WINDOW')
    dup = rec('kb', 'erased'); e4 = rec('kb', 'failed', fail=True)
    ok('B.04 CR6: the saga moves local_erased -> propagating -> complete only when all 7 recipients are terminal; replays are idempotent; terminal receipts cannot flip',
       states[:-1] == ['propagating'] * 5 and states[-1] == 'propagating' and last == 'complete' and dup == 'DUPLICATE' and 'already terminal' in e4, {'states': states + [last]})
    req2 = val(f"SELECT id FROM guest_crm.erasure_requests WHERE space_id='{S1}' ORDER BY requested_at DESC LIMIT 1;", db)
    for s in ['contact_center', 'operations', 'cache_search', 'object_store', 'backup_ledger', 'kb']:
        q(f"SELECT guest_crm.record_erasure_receipt('{req2}','{s}','erased');", db, space=S1)
    f = q(f"SELECT guest_crm.record_erasure_receipt('{req2}','workforce','failed');", db, space=S1)
    ok('B.05 CR6: one failed recipient sends the request to exception_review instead of complete', f == 'exception_review', f)
    psql("INSERT INTO guest_crm.erasure_recipient_registry(system_code, owner_app, origin) VALUES ('analytics','platform','KERNEL');", db)
    p = q(f"INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{S1}','visitor',now()+interval '7 days') RETURNING id;", db, space=S1)
    q(f"INSERT INTO guest_crm.profile_source_links(space_id,profile_id,source,source_subject) VALUES('{S1}','{p}','contact_center','{uuid.uuid4()}');", db, space=S1)
    r3 = q(f"SELECT guest_crm.erase_profile('{S1}','{p}','rtbf');", db, space=S1)
    n_new = val(f"SELECT count(*) FROM guest_crm.erasure_receipts WHERE request_id='{r3}';", db)
    n_old = val(f"SELECT count(*) FROM guest_crm.erasure_receipts WHERE request_id='{req}';", db)
    ok('B.06 CR6: a recipient registered later applies to new erasures only (8 receipts) and does not rewrite existing requests (7)', n_new == '8' and n_old == '7', {'new': n_new, 'old': n_old})
    # CR7
    def env(row):
        o = json.loads(row); return o
    rows = val(f"""SELECT jsonb_build_object('event_id',id,'type',event_type,'space_id',space_id,'occurred_at',to_jsonb(created_at),'causation_id',causation_id,
        'schema_version',schema_version,'data',payload) FROM guest_crm.crm_outbox WHERE event_type='ProfileErasureRequestedEvent';""", db).splitlines()
    VE = validator('https://schemas.smartstay.example/guest-crm/profile-erasure-requested-event/1')
    envs = [json.loads(x) for x in rows]; bad = [errs(VE, x) for x in envs if errs(VE, x)]
    nonempty = sum(1 for x in envs if x['data']['source_subjects'])
    ok('B.07 CR7: every real ProfileErasureRequestedEvent (including one with a linked App 1 subject) validates against the new $id schema',
       not bad and len(envs) >= 5 and nonempty >= 1, {'validated': len(envs), 'with_subjects': nonempty, 'errors': bad[:2]})
    p2 = q(f"INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{S1}','visitor',now()+interval '7 days') RETURNING id||'|'||version||'|'||privacy_epoch;", db, space=S1).split('|')
    cause = str(uuid.uuid4())
    q(f"""INSERT INTO guest_crm.crm_outbox(space_id,profile_id,profile_version,causation_id,event_type,dedupe_key,payload)
       VALUES('{S1}','{p2[0]}',{p2[1]},'{cause}','ProfileChangedEvent','changed:{p2[0]}:{p2[1]}',
       jsonb_build_object('profile_id','{p2[0]}','profile_version','{p2[1]}','privacy_epoch','{p2[2]}','reason_code','permission_revoked'));""", db, space=S1)
    pc = json.loads(val(f"""SELECT jsonb_build_object('event_id',id,'type',event_type,'space_id',space_id,'occurred_at',to_jsonb(created_at),'causation_id',causation_id,
        'schema_version',schema_version,'data',payload) FROM guest_crm.crm_outbox WHERE event_type='ProfileChangedEvent';""", db))
    VC = validator('https://schemas.smartstay.example/guest-crm/profile-changed-event/1')
    negs = {}
    for name, mut in [('extra_field', lambda o: o['data'].__setitem__('loyalty_band', 'gold')), ('bad_reason', lambda o: o['data'].__setitem__('reason_code', 'emotion_detected')),
                      ('zero_epoch', lambda o: o['data'].__setitem__('privacy_epoch', '0')), ('no_causation', lambda o: o.__setitem__('causation_id', None))]:
        x = copy.deepcopy(pc); mut(x); negs[name] = bool(errs(VC, x))
    x = copy.deepcopy(envs[0]); x['data']['source_subjects'] = [{'source': 'contact_center', 'subject_id': 'not-a-uuid'}]
    negs['erasure_bad_subject'] = bool(errs(VE, x))
    ok('B.08 CR7: a ProfileChangedEvent row built exactly as 02:L738 specifies validates; closed payloads reject extra fields, unknown reasons, zero epochs, missing causation and malformed subjects',
       not errs(VC, pc) and all(negs.values()), negs)

# =====================================================================================
# PART C - App 3: CR8 actor alias, CR9 amendment / cancellation consumer
# =====================================================================================
def partC():
    db = 'c_ops'; fresh(db)
    def run(sql, role=None, staff=None, actor=None, fail=False):
        return q(sql, db, role=role, space=S1, staff=staff, actor=actor, fail=fail)
    only_actor = run("SELECT ops.actor();", actor=STAFF); both = run("SELECT ops.actor();", actor=STAFF, staff=STAFF)
    e = run("SELECT ops.actor();", actor=STAFF, staff=OTHER, fail=True); none = run("SELECT coalesce(ops.actor()::text,'<NULL>');")
    ok('C.01 CR8: ops.actor() accepts app.actor_id alone, accepts equal alias values, fails closed when they disagree, stays NULL with neither',
       only_actor == STAFF and both == STAFF and 'disagree' in e and none == '<NULL>', [only_actor[:8], both[:8], e, none])
    ex = json.loads((W / 'app3' / 'ops-contracts' / 'inbound.example.json').read_text())
    def ingest(ev):
        body = json.dumps(ev, sort_keys=True, separators=(',', ':')); h = hashlib.sha256(body.encode()).hexdigest()
        return run(f"SELECT ops.ingest_request({lit(body)}::jsonb,{lit(h)},'{POLICY}',false,'housekeeping');", role='ops_integration', staff=STAFF)
    def new_request():
        ev = copy.deepcopy(ex); ev['id'] = str(uuid.uuid4()); ev['data']['request_id'] = str(uuid.uuid4()); ev['data']['request_version'] = '1'
        ev['space_id'] = S1; ev['source'] = f'urn:smartstay:space:{S1}:contact-center'
        return ev, ingest(ev)
    def change(base, kind, version, reason='Guest changed the request', **repl_changes):
        ev = copy.deepcopy(base); ev['id'] = str(uuid.uuid4()); ev['type'] = 'GuestRequestChangedEvent'
        ev['event_seq'] = str(int(base['event_seq']) + int(version))
        repl = None
        if kind == 'amend':
            repl = copy.deepcopy(base['data']); repl['request_version'] = str(version); repl.update(repl_changes)
        ev['data'] = {'request_id': base['data']['request_id'], 'request_version': str(version), 'change_kind': kind,
                      'source_message_ids': base['data']['source_message_ids'], 'reason': reason, 'replacement': repl}
        return ev
    def apply(ev, fail=False):
        body = json.dumps(ev, sort_keys=True, separators=(',', ':')); h = hashlib.sha256(body.encode()).hexdigest()
        r = run(f"SELECT ops.apply_request_change({lit(body)}::jsonb,{lit(h)});", role='ops_integration', staff=STAFF, fail=fail)
        return r if fail else json.loads(r)
    def token(tid, action, version, who=STAFF):
        return run(f"SELECT ops.issue_action_token('{tid}','{action}',{version});", role='ops_human', staff=who)
    def act(tid, action, version, who=STAFF, fail=False, **extra):
        body = {'action': action, 'expected_version': str(version), 'action_token': token(tid, action, version, who), **extra}
        r = run(f"SELECT ops.staff_action('{tid}','{uuid.uuid4()}',{lit(json.dumps(body))}::jsonb);", role='ops_human', staff=who, fail=fail)
        return r if fail else json.loads(r)
    V1 = validator('https://schemas.smartstay.example/contact-center/outbox-event/1')
    VT = validator('https://schemas.smartstay.example/contact-center/task-status/1')
    # amend a queued task; a token issued before the amendment must die
    base, tid = new_request()
    early = {'action': 'ClaimTask', 'expected_version': '1', 'action_token': token(tid, 'ClaimTask', 1)}
    am = change(base, 'amend', 2, summary='Four extra bath towels to room 12', requested_quantity=4)
    ok('C.02 the constructed GuestRequestChangedEvent validates against App 1 outbox-event/1 (amend and cancel variants)',
       not errs(V1, am) and not errs(V1, change(base, 'cancel', 2)), errs(V1, am)[:2])
    r = apply(am)
    row = run(f"SELECT request_version||'|'||state_version||'|'||title||'|'||(details->'requested_quantity')::text||'|'||jsonb_array_length(details->'revision_history') FROM ops.operational_tasks WHERE task_id='{tid}';").split('|')
    stale_tok = run(f"SELECT ops.staff_action('{tid}','{uuid.uuid4()}',{lit(json.dumps(early))}::jsonb);", role='ops_human', staff=STAFF, fail=True)
    ok('C.03 CR9 amend: request_version 1->2, state_version bumped, new scope applied, prior scope archived in revision_history; a token issued before the amendment is rejected',
       r['disposition'] == 'AMENDED' and row[0] == '2' and row[1] == '2' and row[2].startswith('Four') and row[3] == '4' and row[4] == '1' and 'stale' in stale_tok, {'row': row, 'old_token': stale_tok})
    rep = apply(am); body = json.dumps(am, sort_keys=True, separators=(',', ':'))
    e_col = run(f"SELECT ops.apply_request_change({lit(body)}::jsonb,{lit('0' * 64)});", role='ops_integration', staff=STAFF, fail=True)
    st2 = apply(change(base, 'amend', 2, summary='x')); e_gap = apply(change(base, 'cancel', 4), fail=True)
    ok('C.04 CR9: replay returns the recorded disposition, reused id with other content is rejected, an equal/older revision is STALE, a skipped revision is refused',
       rep['disposition'] == 'REPLAY' and 'different content' in e_col and st2['disposition'] == 'STALE' and 'revision gap' in e_gap, [rep, e_col[:60], st2['disposition'], e_gap[:70]])
    # unstarted (claimed) cancellation -> CANCELLED + callback with new revision
    base, tid = new_request()
    act(tid, 'ClaimTask', 1)
    r = apply(change(base, 'cancel', 2, reason='Guest found towels in the wardrobe'))
    cb = json.loads(run(f"SELECT payload FROM ops.task_outbox WHERE task_id='{tid}' AND event_type='TaskStatusChangedEvent' ORDER BY task_seq DESC LIMIT 1;"))
    released = run(f"SELECT count(*) FROM ops.task_assignments WHERE task_id='{tid}' AND released_at IS NULL;")
    ok('C.05 CR9 cancel before work started: CANCELLED, assignment released, flat "cancelled" callback carries request_version 2 and validates against task-status/1',
       r['disposition'] == 'CANCELLED' and cb['status'] == 'cancelled' and cb['request_version'] == '2' and released == '0' and not errs(VT, cb), {'callback_status': cb['status'], 'task_seq': cb['task_seq']})
    # in-progress cancellation -> stop confirmation workflow
    base, tid = new_request()
    act(tid, 'ClaimTask', 1); act(tid, 'StartTask', 2)
    attest_body = {'action': 'AttestCompleted', 'expected_version': '3', 'action_token': token(tid, 'AttestCompleted', 3),
                   'statement': 'I personally completed and checked this hotel service.', 'completion_evidence_ref': uid(99)}
    r = apply(change(base, 'cancel', 2, reason='Guest checked out early'))
    stt = run(f"SELECT status||'|'||state_version||'|'||(details->'pending_change'->>'kind') FROM ops.operational_tasks WHERE task_id='{tid}';")
    cbs = run(f"SELECT count(*) FROM ops.task_outbox WHERE task_id='{tid}' AND payload->>'status'='cancelled';")
    e_att = run(f"SELECT ops.staff_action('{tid}','{uuid.uuid4()}',{lit(json.dumps(attest_body))}::jsonb);", role='ops_human', staff=STAFF, fail=True)
    ok('C.06 CR9 cancel during work: status stays IN_PROGRESS with a pending cancellation, no "cancelled" callback yet, and completion under the old revision now fails',
       r['disposition'] == 'STOP_CONFIRMATION_REQUIRED' and stt == 'IN_PROGRESS|4|cancel' and cbs == '0' and 'stale' in e_att, {'task': stt, 'attest': e_att[:60]})
    e_other = run(f"SELECT ops.confirm_stop('{tid}', 4);", role='ops_human', staff=OTHER, fail=True)
    c = json.loads(run(f"SELECT ops.confirm_stop('{tid}', 4);", role='ops_human', staff=STAFF))
    cb = json.loads(run(f"SELECT payload FROM ops.task_outbox WHERE task_id='{tid}' AND payload->>'status'='cancelled';"))
    ok('C.07 CR9: only the assignee or a supervisor can confirm the physical stop; confirmation cancels, releases and emits the callback (actor = staff)',
       'assignee or a supervisor' in e_other and c['disposition'] == 'CANCELLED' and cb['actor_ref'] == f'staff:{STAFF}' and not errs(VT, cb), e_other[:70])
    # started task: an amendment that moves the room needs confirmation, not silent re-routing
    base, tid = new_request()
    act(tid, 'ClaimTask', 1); act(tid, 'StartTask', 2)
    r = apply(change(base, 'amend', 2, room_number='404'))
    loc = run(f"SELECT location_label||'|'||(details->'pending_change'->>'kind') FROM ops.operational_tasks WHERE task_id='{tid}';")
    ok('C.08 CR9: amending the room of a task already in progress is held as a pending change; the live location is not rewritten',
       r['disposition'] == 'STOP_CONFIRMATION_REQUIRED' and loc == f"{base['data']['room_number']}|amend", loc)
    done = run(f"SELECT request_id||'|'||task_id||'|'||request_version FROM ops.operational_tasks WHERE space_id='{S1}' AND status='COMPLETED' AND request_id IS NOT NULL LIMIT 1;").split('|')
    fake = copy.deepcopy(ex); fake['data']['request_id'] = done[0]; fake['space_id'] = S1; fake['source'] = f'urn:smartstay:space:{S1}:contact-center'
    r = apply(change(fake, 'cancel', int(done[2]) + 1, reason='Too late'))
    st = run(f"SELECT status FROM ops.operational_tasks WHERE task_id='{done[1]}';")
    ok('C.09 CR9: a cancellation for an already COMPLETED task is recorded for reconciliation; the terminal fact is not rewritten', r['disposition'] == 'TERMINAL_RECONCILE' and st == 'COMPLETED', r)

# =====================================================================================
# PART D - App 5 hardening F1/F2/F3 with the kernel revision
# =====================================================================================
def partD():
    db = 'd_ai'; fresh(db, kernel_v2=True)
    people = {'GENERAL_MANAGER': 'gm', 'FRONT_DESK_LEAD': 'fdl', 'CELLAR_SOMMELIER_LEAD': 'som'}; mem = {}
    psql('GRANT EXECUTE ON FUNCTION platform.project_member(uuid, uuid) TO platform_owner;', db)
    for i, (tpl, who) in enumerate(people.items()):
        pid = str(uuid.uuid4())
        psql(f"INSERT INTO platform.principals VALUES('{pid}','oidc|kakheti|{who}','{tpl} (synthetic)');", db)
        m = q(f"INSERT INTO platform.members(space_id,principal_id) VALUES('{S1}','{pid}') RETURNING member_id;", db, role='platform_owner')
        q(f"INSERT INTO platform.member_templates VALUES('{S1}','{m}','{tpl}'); SELECT platform.project_member('{S1}','{m}');", db, role='platform_owner'); mem[who] = m
    rows = {w: val(f"SELECT role_name||'|'||coalesce(auth_subject,'-')||'|'||coalesce((SELECT string_agg(grant_name, ',') FROM workforce.ai_member_grants g WHERE g.actor_id=a.actor_id),'-') FROM workforce.ai_members a WHERE actor_id='{m}';", db) for w, m in mem.items()}
    ok('D.01 kernel revision: Front Desk Lead -> CONFIGURATOR + SESSION_RESUME grant; GM -> APPROVER; Sommelier -> CONFIGURATOR; every row carries its auth_subject',
       rows == {'gm': 'APPROVER|oidc|kakheti|gm|-', 'fdl': 'CONFIGURATOR|oidc|kakheti|fdl|SESSION_RESUME', 'som': 'CONFIGURATOR|oidc|kakheti|som|-'}, rows)
    agent = str(uuid.uuid4())
    def draft(graph, creator, inserter, fail=False, ver=1):
        return q(f"""INSERT INTO workforce.ai_agents VALUES('{S1}','{agent}',{ver},'SOMMELIER','WARM_CONCISE','en','cellar.v1') ON CONFLICT DO NOTHING;
          INSERT INTO workforce.agent_graph_definitions(space_id,graph_id,version,created_by,compiler_version,entry_node,max_steps,max_handoffs) VALUES('{S1}','{graph}',1,'{mem[creator]}','hotel-graph-v1','done',8,0);
          INSERT INTO workforce.agent_graph_nodes(space_id,graph_id,graph_version,node_key,kind,agent_id,agent_version) VALUES('{S1}','{graph}',1,'done','END','{agent}',{ver});""",
          db, role='ai_config', space=S1, actor=mem[inserter], fail=fail)
    def publish(graph, who, fail=False):
        h = q(f"SELECT workforce.graph_digest('{graph}',1);", db, role='ai_config', space=S1, actor=mem[who])
        return q(f"SELECT workforce.publish_graph('{graph}',1,'{h}');", db, role='ai_config', space=S1, actor=mem[who], fail=fail)
    g1, g2 = str(uuid.uuid4()), str(uuid.uuid4())
    draft(g1, 'som', 'som')
    e = publish(g1, 'fdl', True); publish(g1, 'gm')
    ok('D.02 F1 fixed: the Front Desk Lead can no longer publish an agent graph (Sub-A 3.11 inverted); the GM can', 'independent graph approver required' in e and
       val(f"SELECT state FROM workforce.agent_graph_definitions WHERE graph_id='{g1}';", db) == 'ACTIVE', e)
    rs = {w: q(f"SELECT workforce.resume_session('{uuid.uuid4()}', 1);", db, role='ai_config', space=S1, actor=mem[w], fail=True) for w in ('fdl', 'gm', 'som')}
    ok('D.03 F1: resume authority is separate - Front Desk Lead and GM pass the resume authorization (reaching the state check), the Sommelier is refused',
       'stale resume' in rs['fdl'] and 'stale resume' in rs['gm'] and 'human resume required' in rs['som'], rs)
    e = draft(g2, 'som', 'gm', fail=True)
    draft(g2, 'gm', 'gm'); e2 = publish(g2, 'gm', True)
    ok('D.04 F2 fixed: an approver cannot record a colleague as author (Sub-A 3.12 inverted); an honest self-authored draft still cannot be self-published',
       'graph author must be the acting member' in e and 'independent graph approver required' in e2, [e, e2])
    e = q(f"INSERT INTO workforce.ai_members(space_id,actor_id,role_name,enabled,auth_subject) VALUES('{S1}','{uuid.uuid4()}','APPROVER',true,'oidc|kakheti|gm');", db, space=S1, fail=True)
    anon = q(f"INSERT INTO workforce.ai_members(space_id,actor_id,role_name,enabled) VALUES('{S1}','{uuid.uuid4()}','APPROVER',true) RETURNING 'accepted';", db, space=S1)
    ok('D.05 F3: a second identity for the same auth_subject is refused (alias attack closed); anonymous rows are still accepted in transition mode (residual, by design)',
       'ai_members_subject_unique' in e and anon == 'accepted', e)
    e = psql(section('cr12_f3_enforce'), db, check=False).stderr
    nulls = val(f"SELECT count(*) FROM workforce.ai_members WHERE auth_subject IS NULL;", db)
    psql("UPDATE workforce.ai_members SET auth_subject = 'legacy:' || actor_id WHERE auth_subject IS NULL;", db)
    psql(section('cr12_f3_enforce'), db)
    e2 = q(f"INSERT INTO workforce.ai_members(space_id,actor_id,role_name,enabled) VALUES('{S1}','{uuid.uuid4()}','APPROVER',true);", db, space=S1, fail=True)
    ok('D.06 F3 enforce switch: NOT NULL cannot be set while legacy rows lack a subject; after backfill it applies and anonymous members are refused',
       'contains null values' in e and int(nulls) > 0 and 'null value' in e2, {'legacy_rows_backfilled': nulls, 'after': e2[:70]})
    q(f"DELETE FROM platform.member_templates WHERE space_id='{S1}' AND member_id='{mem['fdl']}'; SELECT platform.project_member('{S1}','{mem['fdl']}');", db, role='platform_owner')
    fr = val(f"SELECT enabled||'|'||(SELECT count(*) FROM workforce.ai_member_grants g WHERE g.actor_id=a.actor_id) FROM workforce.ai_members a WHERE actor_id='{mem['fdl']}';", db)
    e = q(f"SELECT workforce.resume_session('{uuid.uuid4()}', 1);", db, role='ai_config', space=S1, actor=mem['fdl'], fail=True)
    ok('D.07 revocation: removing the template disables the row and deletes the SESSION_RESUME grant; resume is then refused', fr == 'false|0' and 'human resume required' in e, fr)
    # enforce-mode regression: the locked App 5 fixture inserts anonymous members
    psql('DROP DATABASE IF EXISTS kernel;', 'postgres')
    psql('CREATE DATABASE kernel TEMPLATE kernel_clean;', 'postgres'); psql(section('cr12_f3_enforce'), 'kernel')
    r = subprocess.run(['python3', str(W / 'app5' / 'verify.py')], text=True, capture_output=True)
    err = next((l for l in r.stderr.splitlines() if 'ERROR:' in l), r.stderr[-200:])
    ok('D.08 EXPECTED BREAK in enforce mode: the locked App 5 suite fails at its own anonymous ai_members fixture insert (fixture must supply auth_subject)',
       r.returncode != 0 and 'auth_subject' in err, err[:160])
    psql('DROP DATABASE kernel;', 'postgres'); psql('CREATE DATABASE kernel TEMPLATE kernel_clean;', 'postgres')

if __name__ == '__main__':
    only = sys.argv[1:] or ['A', 'B', 'C', 'D']
    for n in only: globals()['part' + n]()
    (BR / ('results_' + '_'.join(only) + '.json')).write_text(json.dumps({'server': val('SHOW server_version;', 'postgres'), 'checks': RESULTS, 'evidence': EVIDENCE}, indent=2, default=str))
    print(json.dumps({'passed': sum(r['passed'] for r in RESULTS), 'failed': sum(not r['passed'] for r in RESULTS), 'total': len(RESULTS)}))
```

## Appendix E — end-to-end driver

End-to-end driver: rebuild bridged base, zero-regression gate (Z1 locked suites, Z2 Sub-A, Z3 Sub-B), bridge suite.

<!-- artifact: run_all.sh -->
```bash
#!/usr/bin/env bash
# Sub-Component C end-to-end: rebuild the bridged base from the pristine locked DDL, run the zero-regression gate
# (locked app suites, Sub-A suite, Sub-B suite) and the bridge suite. Run from the repository root with
# BW=<workdir> (prepared by prepare.py, cluster running on 55466, database kernel_locked present) and PGBIN set.
set -u
cd "${REPO:-$PWD}"
P="psql -X -q -h $BW/socket -p 55466 -v ON_ERROR_STOP=1"
python3 -c "import os; s=open(os.environ['BW']+'/bridges/bridges.sql').read(); open(os.environ['BW']+'/bridges/bridges_noenforce.sql','w').write(s.split('-- @@cr12_f3_enforce')[0])"
for d in kernel_clean kernel mesh_base; do $P -d postgres -c "DROP DATABASE IF EXISTS $d" >/dev/null; done
$P -d postgres -c 'CREATE DATABASE kernel_clean TEMPLATE kernel_locked' >/dev/null
$P -d kernel_clean -f "$BW/bridges/bridges_noenforce.sql" >/dev/null 2>"$BW/bridges/install.err" && echo "bridges installed on kernel_clean" || { cat "$BW/bridges/install.err"; exit 1; }
$P -d postgres -c 'CREATE DATABASE kernel TEMPLATE kernel_clean' >/dev/null
cp "$BW/kernel/test_kernel.py" "$BW/kernel/test_kernel_bridgeaware.py"
python3 -c "import os; p=os.environ['BW']+'/kernel/test_kernel_bridgeaware.py'; s=open(p).read(); open(p,'w').write(s.replace(\"rows['divergent']\",\"rows.get('divergent','<ERROR: divergence rejected>')\"))"
echo "== Z1 locked app suites on bridged schemas"
for t in app3/verify.py app4/verify.py app4/extra.py app5/verify.py app5/verify_extra.py; do
  python3 "$BW/$t" > "$BW/bridges/z1.log" 2>&1; echo "Z1 $t exit=$? $(grep -o '"passed": [0-9]*' "$BW/bridges/z1.log" | head -1)"; done
echo "== Z2 Sub-A suite on bridged kernel_clean (parts run separately; derived copy tolerates the rejected divergence row)"
for part in 1 2 3 4 5; do
  REPO=$PWD python3 "$BW/kernel/test_kernel_bridgeaware.py" $part > "$BW/bridges/z2_part$part.log" 2>&1
  echo "Z2 part $part exit=$? pass=$(grep -c '^PASS' "$BW/bridges/z2_part$part.log") fail_lines:"; grep -E '^FAIL' "$BW/bridges/z2_part$part.log" | cut -c1-110
  grep -m1 -E 'RuntimeError: ERROR' "$BW/bridges/z2_part$part.log" | cut -c1-140
done
echo "== Z3 Sub-B build + suite on bridged kernel_clean"
python3 "$BW/mesh/build_base.py" > "$BW/bridges/z3_build.log" 2>&1; echo "Z3 build exit=$? $(grep suites "$BW/bridges/z3_build.log")"
python3 "$BW/mesh/test_mesh.py" 1 2 3 4 > "$BW/bridges/z3_subB.log" 2>&1; echo "Z3 exit=$? $(tail -1 "$BW/bridges/z3_subB.log")"; grep '^FAIL' "$BW/bridges/z3_subB.log" | cut -c1-120
echo "== Bridge suite"
python3 "$BW/bridges/test_bridges.py" A B C D > "$BW/bridges/bridges_run.log" 2>&1; echo "bridges exit=$? $(tail -1 "$BW/bridges/bridges_run.log")"; grep '^FAIL' "$BW/bridges/bridges_run.log" | cut -c1-160
echo DONE
```
