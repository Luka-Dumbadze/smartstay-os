# Sub-Component B — Inter-App Event Mesh and R1 Polling Relay

**Empirical micro-research and proof of concept · 24 September 2026 · PostgreSQL 16.15 · SmartStay Kakheti hospitality platform**

This report tests `00_master_kernel_research.md` §4 against the real, unmodified schemas of all five locked apps, on top of the Sub-Component A kernel (`01_kernel_iam_research.md`). The following were built and run in disposable PostgreSQL 16 clusters under `/tmp`:

- normalization adapters over the five heterogeneous outboxes;
- the R1 per-tenant polling relay with heartbeats;
- head-of-line ordering;
- a causal-depth limiter;
- a dead-letter store.

**Everything in the appendices is an experimental test fixture, not master DDL.** No locked table was altered (check 1.01).

## 0. Status, evidence and environment

**Result: 43 of 43 named checks passed** in one clean end-to-end run (`results_1_2_3_4.json`).

**Negative checks.** Five checks pass because they reproduce a hazard, not because a component is safe:

| Check | Hazard reproduced |
|---|---|
| 2.01 | Zero-row relay |
| 3.01 | Naive-claim reordering |
| 1.04 | Gapped sequences |
| 2.08 | Blind-scan monitor rule; its heartbeat input is synthetic |
| 4.01 | The storm itself |

**Labels:** **[O]** observed in this investigation's runs; **[L]** stated in a locked dossier (`NN:Lnnn`); **[A]** established by Sub-Component A (`01 §n`, check `n.nn`); **[D]** PostgreSQL 16 documented behavior; **[I]** this report's inference or recommendation.

**Environment [O]:**

- PostgreSQL `16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)` with pgvector 0.8.6, using the relocated, locally built binaries from Sub-Component A (`01 §0`). Nothing was installed system-wide.
- A fresh cluster at `/tmp/event-mesh.COvZvV`, reachable only through a private Unix socket on port 55466, with no TCP. `trust` authentication applies only inside that owner-only directory.
- The Sub-Component A artifacts were extracted from report 01 byte-for-byte (hashes match `01 §7`) and reused unmodified:
  - `kernel_experiment.sql`
  - `test_kernel.py` (imported as a helper library)
  - `prepare.py`

**Read-only inputs (verified unchanged after writing):**

| Input | SHA-256 |
|---|---|
| `research/platform/00_master_kernel_research.md` | `8f2a8c41a70cf9bb73716422abd1d4faf4f3390d2354c902628fd68f2e0f688c` |
| `research/platform/subcomponents/01_kernel_iam_research.md` | `08174bea0edaf1db815003c5c8530da37fdd30047cdd8f417a8c6bcff0fb2802` |
| `research/apps/01_contact_center_dossier.md` | `d60c9100092e275a9a4165e5a139f3f7e5c96273dbec53e6a18f234b485edd65` |
| `research/apps/02_guest_crm_dossier.md` | `e7481fcce7303cb55864ddfaac5c6f2bd8b4d2458eb427f6d3a286c815b7f2fb` |
| `research/apps/03_operations_task_dossier.md` | `e0de5d8b68a4ff106d164dfdf39790213d7b83b4e2b372d8ba875946419f5c1b` |
| `research/apps/04_storage_knowledge_dossier.md` | `fb7d4c8dee0e5ab423421a548716b83452560f99ebb5ff863bb1ea7acaaa870a` |
| `research/apps/05_ai_team_agent_core_dossier.md` | `d3bb193d0be03f0f78bd9b7b263a571cd04fd5e6d75f86045348f232e78dd97e` |

### 0.1 Test bed: real traffic, not synthetic rows

`mesh_base` (Appendix B) is built as follows:

1. **Schemas and kernel.** The five locked DDLs plus the Sub-Component A kernel in **hard-FK mode**, configured as in `01` check 4.03. Fixture tenants are registered in `platform.spaces` first, and the apps own their projection inserts.
2. **Locked-suite traffic.** The locked App 3, 4 and 5 verification suites are run into it. They pass at their recorded counts (47, 43+17, 59) and leave their real outbox traffic behind.
3. **App 1 and App 2 traffic,** produced by their own locked functions:
   - `contact_center.change_control(…)` emits real `ConversationControlChangedEvent`s with trigger-allocated `event_seq`.
   - `guest_crm.erase_profile(…)` emits real `ProfileErasureRequestedEvent`s.
4. **Properties.**
   - Fixture tenant 1 gets its App 1 and App 2 projections through the kernel's own `platform.reconcile_space` (`01` 1.17).
   - Two further properties, Kvareli Lake and Sighnaghi Inn, are created through normal kernel provisioning.

**The result: 46 real, unpublished outbox events across all five apps and three properties, plus 1,026 registered properties in total.**

| Source | Events | Types |
|---|---|---|
| App 1 `contact_center.outbox_events` | 9 | `ConversationControlChangedEvent` |
| App 2 `guest_crm.crm_outbox` | 4 | `ProfileErasureRequestedEvent` |
| App 3 `ops.task_outbox` | 10 | 6 `TaskStatusChangedEvent`, 2 `TaskQueuedEvent`, 2 `SlaEscalatedEvent` |
| App 4 `kb.storage_outbox` | 12 | 10 `PolicyApprovedEvent`, 1 `PolicySupersededEvent`, 1 `PolicyArchivedEvent` |
| App 5 `workforce.agent_outbox` | 11 | 9 `AgentSessionChangedEvent`, 2 `AgentHandoffEvent` |

Synthetic rows appear only where volume was needed: 480 App 1 and 60 App 3 ordering probes (Part 3), and the write-back loop (Part 4). Both are inserted through the apps' own triggers and constraints.

---

## 1. Summary of findings

1. **All five outboxes can be driven through one relay interface without altering any locked table [O, 1.01–1.03].**
   - The locked tables' structure (columns, defaults, constraints, indexes, triggers, RLS) is byte-identical before and after installation.
   - Only privileges are added (1.02). App 4 and App 5 need **no new privilege at all** on their outboxes: their locked `kb_transport`/`ai_transport` grants suffice.
   - The normalized view returned exactly the 46 real events with byte-identical payloads.
2. **Three lease strategies are needed:**
   - native token (Apps 3–5);
   - an **attempt-counter fence** for App 1, which has `claimed_until` but no token;
   - a **tenant-scoped sidecar** for App 2, which has no lease columns at all.

   The App 2 sidecar is only correct because the *sidecar row* is what gets locked and updated. Locking the locked outbox row instead would let a concurrent claimer re-claim after commit (§2.3, 1.09).
3. **Adapter envelopes validate against the locked contracts [O, 1.05]:** App 1 `outbox-event/1` (9), App 3→App 1 `task-status/1` (6), App 4 `policy-event/1` (12), App 5 `handoff-event/1` (2).
4. **The zero-row relay hazard is real and detectable at once [O, 2.01–2.02].**
   - A relay iterating all properties without tenant context wrote 5,130 heartbeats, saw 0 rows and published nothing while 46 events waited.
   - The monitor flagged **`CONTEXTLESS_RELAY`** for the worker on all five sources.
   - It also flagged **`UNSCANNED_BACKLOG`** for exactly the 9 property×source pairs holding work.
   - A statically configured relay (2.07), a blind scan (2.08) and an offboarded property's stranded events (2.10) are each flagged too.
5. **Head-of-line claiming gives strict per-aggregate order under concurrency [O, 3.01–3.03].** Six parallel workers ran over 24 conversations and 3 tasks:

   | Claiming | Deliveries | Sequence inversions | Overlapping in-flight deliveries |
   |---|---|---|---|
   | Naive `SKIP LOCKED` (negative control) | 546 | **32** | **43** |
   | Head-of-line | 530 | **0** | **0** |

6. **Failures stay confined to their own aggregate [O, 3.04–3.08].**
   - A poison event blocks only its conversation, is dead-lettered after 3 attempts, and on reviewed replay completes the conversation strictly in order 1..20 with the original event ID.
   - A 2.5 s slow delivery held only its own conversation; 401 other deliveries completed during it.
   - Crashes after claim and after delivery-before-ack both end in exactly one application.
7. **The anti-storm limiter halts a real App 1 ⇄ App 3 write-back loop at depth 9 [O, 4.01–4.05].**
   - Depths 0–8 were delivered (9 deliveries).
   - The depth-9 event was parked and dead-lettered as `CAUSAL_DEPTH_EXCEEDED`, with a 10-hop causal chain back to the root and the root correlation ID.
   - Lineage works for sources that have **no** correlation or causation columns (Apps 3–5), by *capturing* what a consumer writes during delivery. Where App 1 has a `causation_id` column, the captured parent agreed in 4 of 4 hops.
8. **The dead-letter store is durable, idempotent and minimal [O, 4.07–4.11].**
   - It survived an immediate, crash-style server restart byte-for-byte.
   - Replay of a causal-depth dead letter is refused; discard requires a reviewed reason.
   - It stores a payload SHA-256, never the payload.
9. **Four implementation hazards surfaced that the design documents did not anticipate** (§6):
   - Strict head-of-line with one claim per property per cycle throttles each aggregate to one event per cycle. Fixed with bounded drain rounds.
   - PL/pgSQL cannot `SET TRANSACTION ISOLATION` after a `COMMIT` if the loop header has already evaluated. Fixed via `default_transaction_isolation`.
   - App 1's outbox trigger resolves `conversations` through the caller's `search_path`, so every producer writing to App 1's outbox must set it.
   - Append-only heartbeats grow by about 5,000 rows per relay cycle at 1,026 properties.

---

## 2. Area 1 — normalization adapters over five heterogeneous outboxes

### 2.1 What the locked outboxes actually are [L/O]

The brief's column summary is directionally right. The exact shapes, read from the executed DDL, matter for leasing, ordering and lineage:

| App | Table | Identity | Aggregate / order key | Lease columns | Error column | Correlation / causation | Other |
|---|---|---|---|---|---|---|---|
| 1 | `contact_center.outbox_events` | `id` | `conversation_id` / `event_seq`, **gap-free, trigger-allocated** under the conversation row lock (`01:L667–674`) | `claimed_until`, `attempts` — **no token** | `last_error` | **both** (`correlation_id NOT NULL`, `causation_id`) | FK to `conversations`; `UNIQUE(space, dedupe_key)` |
| 2 | `guest_crm.crm_outbox` | `id` | `profile_id` (NULL for erasure) / **none**; `profile_version` is a consistency token, not an order (`02:L740`) | **none**, not even `attempts` | none | `causation_id` only (required except for erasure, `02:L470`) | profile FK `ON DELETE CASCADE` |
| 3 | `ops.task_outbox` | `event_id` | `task_id` / `task_seq`, **only for `TaskStatusChangedEvent`** (`CHECK`); queued and SLA events are unsequenced | `lease_token`, `leased_until`, `attempts` | `last_error` | **none** | `ordered_task_callback` unique `(space, task, seq)` |
| 4 | `kb.storage_outbox` | `event_id` | `knowledge_item_id` / `aggregate_version`; **a supersession writes two items' events at one `knowledge_epoch`** (`04:L1407`) | token, until, attempts (grants to locked `kb_transport`) | none | **none** | `UNIQUE(space, item, version)` |
| 5 | `workforce.agent_outbox` | `event_id` | `session_id` / `state_version`, **with gaps** (observed 1, 3, 4, 5, 6, 8, 9) **and ties** across event types (`05:L1823`) | token, until, attempts (grants to locked `ai_transport`) | none | **none** | `UNIQUE(space, session, version, type)` |

Two consequences [O]:

- **Head-of-line must mean "no earlier *unpublished* event in this aggregate", never "sequence = last acknowledged + 1".** App 5's gaps (1.04) would deadlock a gap-free rule. The chosen rule is also correct for App 1's gap-free sequence and App 3's partial one.
- **Causal-depth tracking cannot rely on columns.** Three of the five outboxes carry neither correlation nor causation, so lineage is captured by the mesh (§5).

### 2.2 The uniform relay interface

Every adapter returns the same composite `mesh.lease_row`:

`source, space_id, event_id, aggregate_kind, aggregate_id, seq, tiebreak, ordering, event_type, schema_version, correlation_id, causation_id, group_key, fence, attempts, payload, created_at`

Operations: `mesh.pending(source)`, `mesh.pending_count(source)`, `mesh.claim(source, batch, lease)`, `mesh.ack(source, event, fence)`, `mesh.nack(…)`, `mesh.envelope(row)`.

The per-source catalog is `mesh.sources`, observed as:

| Source | Aggregate | Ordering | Lease strategy | Lineage |
|---|---|---|---|---|
| `cc` | conversation | SEQUENCED | ATTEMPT_FENCE | COLUMN+CAPTURE |
| `crm` | profile | UNSEQUENCED | SIDECAR | COLUMN+CAPTURE |
| `ops` | task | PARTIAL | TOKEN | CAPTURE |
| `kb` | knowledge_item (+ epoch group) | SEQUENCED | TOKEN | CAPTURE |
| `ai` | session | SEQUENCED (gapped, ties) | TOKEN | CAPTURE |

**Security model of the adapters [O]:**

- **Adapters are `SECURITY INVOKER`.** They run as the per-app **transport role**, under the tenant context of the property being scanned, so each app's own RLS policy does the tenant filtering. None of them uses `BYPASSRLS` (1.08).
- **The relay role inherits nothing.** It is granted each transport role `WITH INHERIT FALSE, SET TRUE` (a PostgreSQL 16 feature), so on its own it gets `permission denied for schema kb` (1.07). It must `SET ROLE` to exactly one transport role per source per transaction.
- **Apps 1–3 publish no transport role** in their locked DDL. The fixture adds `cc_transport`, `crm_transport` and `ops_transport` with **column-level** `UPDATE` on exactly the lease and publish columns.
- **Apps 4 and 5 are driven through their locked roles unchanged.**
- **`mesh_owner` gets read and park access** on all five outboxes, for delivery and dead-lettering only.

This is the precise meaning of "only privileges are added" (1.02): no grant was removed, `kb_transport`/`ai_transport` privileges are identical, and the only new grantees are the three new transport roles plus `mesh_owner`.

### 2.3 Lease strategies and fencing [O]

| Strategy | Used by | Claim | Fence | Stale-holder test |
|---|---|---|---|---|
| **TOKEN** | Apps 3, 4, 5 | `FOR UPDATE SKIP LOCKED`, set random `lease_token`, `leased_until`, `attempts+1` | `lease_token` | 1.11: after expiry and re-claim, the old token's ack returns `f` and the new one `t` |
| **ATTEMPT_FENCE** | App 1 | same, setting `claimed_until`, `attempts+1` | the post-claim `attempts` value | 1.10: fence 1 → expiry → re-claim at fence 2; the old ack is rejected |
| **SIDECAR** | App 2 | materialize `mesh.crm_leases(space, event)` rows for pending events, then claim **the sidecar rows** `FOR UPDATE SKIP LOCKED`, setting a token | sidecar `lease_token` | 1.09: a concurrent claimer skips the locked event, and after commit nobody re-claims the live lease |

**Why the sidecar row must be the locked row [D/O].** Under `READ COMMITTED`, a `SELECT … FOR UPDATE` that waits on a locked row re-checks its `WHERE` clause against the *updated* version of that row once the lock is released. It does not re-check other rows. If the claim locked the App 2 outbox row but wrote the lease to a different table, the outbox row would be unchanged when released. A concurrent claimer would then pass its "lease expired" check using a stale view of the sidecar, and claim the same event.

Locking and updating the sidecar row puts the lease in the row that gets re-checked. The sidecar is tenant-scoped with its own `FORCE` RLS policy, so it cannot become a cross-tenant side channel.

**Supersession groups (App 4) [O, 1.12].** A supersession's `PolicySupersededEvent` and `PolicyApprovedEvent` share `knowledge_epoch`, and App 4 requires the consumer to apply them as a pair (`04:L1407`). `claim_kb` therefore claims **whole epoch groups**:

- A group is claimable only if every member is head-of-line eligible, unleased and not parked.
- Group exclusivity uses a transaction-scoped advisory lock in the **kernel classid 101** (the `01 §4.5` allocation), so two workers never split a pair.
- Observed: epoch 7 was claimed as one lease containing exactly `{PolicySupersededEvent, PolicyApprovedEvent}`. It became eligible only after its predecessor version, at epoch 2, had been acknowledged.

### 2.4 Contract envelopes [O, 1.05–1.06]

`mesh.envelope(row)` implements each locked mapping verbatim:

| Source | Mapping | Validated against | Result |
|---|---|---|---|
| App 1 | CloudEvents-shaped: `id`, `type`, `source = urn:smartstay:space:<id>:contact-center`, `subject = conversations/<id>`, `time`, `datacontenttype`, `schema_version`, `space_id`, `conversation_id`, `event_seq` as decimal string, `correlation_id`, `causation_id`, `data` (`01:L2394`) | `contact-center/outbox-event/1` | 9 of 9 valid |
| App 3 | payload is the flat callback body (`03:L1160`) | `contact-center/task-status/1` | 6 of 6 valid |
| App 4 | payload is the policy event (`04 §5`) | `knowledge/policy-event/1` | 12 of 12 valid |
| App 5 | payload + `event_id` + `occurred_at` (`05:L1821`) | `ai-team/handoff-event/1` | 2 of 2 valid |
| App 2 | `id→event_id`, `created_at→occurred_at`, `payload→data` (`02:L738`) | **no `$id` schema exists** (a gap already recorded in `00` CR7) | shape matches the documented mapping |

Validation used Draft 2020-12 with `FormatChecker` and a local `referencing` registry built from the locked contract files. **Zero regression on the wire contracts** is therefore demonstrated for every contract that exists.

---

## 3. Area 2 — the R1 per-tenant polling relay and heartbeat monitor

### 3.1 The relay loop

`mesh.r1_run(worker, sources, …)` is a `SECURITY INVOKER` procedure. It holds one backend and runs many short transactions, which is exactly the production shape `00 §4.3` R1 describes. Each cycle:

1. **List properties** from the kernel with `mesh.relay_spaces()`: every property not `OFFBOARDED`. `SUSPENDED` properties are relayed, because erasure must keep flowing. A static list can be passed instead, to reproduce a misconfigured relay.
2. **Claim transaction**, for each property × source:
   - set `app.space_id` transaction-locally (`01 §4.2` protocol) and `TimeZone=UTC`;
   - `SET ROLE` to that source's transport role;
   - count pending, claim a head-of-line batch, write a heartbeat;
   - `COMMIT`.
3. **Delivery transaction** for each claimed event, in `REPEATABLE READ` under the event's tenant context: `mesh.deliver(…)`. A handler exception is caught inside a sub-block, so it rolls back only the delivery. Then `COMMIT`.
4. **Acknowledge transaction** as the transport role: a fenced `ack`, or `nack` with exponential backoff (50 ms × 2ⁿ), then `COMMIT`.
5. **Repeat claims** for the same property×source for up to `p_drain_rounds` (default 50) rounds, then move on (fairness).

After the procedure ends, the session holds **no tenant context, no role switch and no isolation override** [O, 2.03]. The session reports `platform_relay||read committed`.

### 3.2 The zero-row hazard, reproduced and detected [O]

**Hazard (2.01, negative).** The same relay was run with `p_bind_context = false`. It iterated all 1,026 properties × 5 sources and wrote **5,130 heartbeats, all `context_bound = false`**. Every scan saw 0 rows and claimed 0; all 46 real events stayed unpublished. It reports no errors or warnings, and from its own point of view it is healthy.

**Detection (2.02).** `mesh.relay_health()` computes ground truth **per tenant with context bound**. A context-free monitor would be blind in exactly the same way (the `01` 1.16 illusion). Immediately after that one bad cycle, it reported:

- **`CONTEXTLESS_RELAY`** for the worker on each of the 5 sources, raised from any heartbeat with `context_bound = false`;
- **`UNSCANNED_BACKLOG`** for **exactly the 9** property×source pairs that hold events (46 events in total). No context-bound heartbeat exists for them inside the window.

**Monitor statuses and their tests:**

| Status | Condition | Tested |
|---|---|---|
| `OK` | a context-bound heartbeat exists in the window, and nothing is wrong | 2.06: after a correct run, every property × source is OK |
| `UNSCANNED_BACKLOG` / `UNSCANNED_IDLE` | no context-bound heartbeat for this property × source in the window | 2.02; 2.07 (a static relay configured for one property: Kvareli and Sighnaghi are named) |
| `BLIND_SCAN` | the latest heartbeat reported 0 pending while an older unpublished event existed | 2.08, using a **synthetic heartbeat as input** (an external relay reporting a property it could not see). The R1 procedure cannot produce this state itself, because it derives the heartbeat's property from its own context |
| `CONTEXTLESS_RELAY` | any heartbeat with `context_bound = false` | 2.02 |
| `DEAD_LETTER_OPEN` | open dead letters for this property × source | (exercised in Part 3 data) |
| `OFFBOARDED_BACKLOG` | an `OFFBOARDED` property still has unpublished events: the relay no longer visits it, so they would otherwise vanish silently | 2.10: 4 App 1 events and 1 App 2 erasure event are surfaced for Kvareli after offboarding. The suspended Sighnaghi's erasure event **was** relayed (2.09) |

**Correct relay [O, 2.04–2.05].** All 46 events were published with zero backlog. Heartbeats covered all 5,130 property×source pairs, all context-bound. Three concurrent R1 relays over the same backlog delivered every event **exactly once**: 46 deliveries of 46 distinct events (2.11).

### 3.3 Scale and cost observations [O/I]

| Measurement | Value |
|---|---|
| Properties × sources per cycle | 1,026 × 5 = 5,130 scans |
| Full cycle over mostly idle tenants | ≈ 3 s in one backend (≈ 0.6 ms per scan); the correct run took 5.9 s for 2 cycles (10,281 heartbeats) |
| Ordering run, 6 workers | 11.8 s in one run, 39.6 s in another. The dominant cost is re-scanning 1,020+ idle properties every cycle, per worker |
| Heartbeat growth | ≈ 5,130 rows per cycle. At a 3 s cycle, that is on the order of 10⁸ rows per day |

**Implications [I]:**

1. **A pending-work hint** (a small `dirty` set keyed by property × source, or `LISTEN/NOTIFY` as a wake-up only) should let R1 skip idle tenants between periodic full sweeps. The full sweep must stay, because it is the zero-row safety net. The hint must never be the only path.
2. **Heartbeats should be an upserted "latest per property × source" table plus sampled history,** not an append-only log. The monitor only needs the latest state.

Neither change was implemented here; both are required before production.

---

## 4. Area 3 — head-of-line ordering under concurrency

### 4.1 Setup [O]

The ordering load:

- **App 1:** 24 new conversations in Kvareli with 20 `MessageRecordedEvent`s each, sequences allocated by App 1's own trigger. They were inserted *interleaved* (event n of every conversation before event n+1), so naive claiming mixes aggregates.
- **App 3:** the 3 real tasks of fixture tenant 1, extended by 20 `TaskStatusChangedEvent`s each, continuing the tasks' real `task_seq`. The 6 real callbacks are included.
- **Consumer:** all events route to a test-double sink that sleeps a random 0–12 ms and records `started_at`/`finished_at`.

Six relay processes ran concurrently.

### 4.2 Results

| # | Check | Result |
|---|---|---|
| 3.01 | **Negative control**: naive `SKIP LOCKED` batch claims with 6 workers | **32 sequence inversions, 43 overlapping in-flight deliveries** in 546 deliveries. This confirms `01:L749`'s warning that unrestricted row-level `SKIP LOCKED` reorders |
| 3.02 | Head-of-line claims, 6 workers | **0 inversions, 0 overlaps** in 530 deliveries. At most one event per aggregate is ever in flight: an event is claimable only when no earlier event of its aggregate is unpublished, and an event becomes published only through its fenced ack |
| 3.03 | Completeness | every non-poisoned conversation and every task streamed completely; the poisoned conversation stopped at seq 4 |
| 3.04 | Poison: seq 5 of one conversation always fails | after 3 attempts with backoff it is dead-lettered as `RETRY_BUDGET_EXHAUSTED`, recording attempts, the consumer error, seq 5, the causal chain and the payload SHA-256 (matching the real row). The payload is **not** copied |
| 3.05 | Gap preserved | the 16 later events of that conversation wait; nothing else in App 1 or App 3 waits |
| 3.06 | A 2.5 s slow delivery | **401 deliveries of other aggregates completed during it**; 0 later events of its own conversation started before it finished |
| 3.07 | Reviewed replay | `mesh.replay_dead_letter` records the reviewer and resets the retry budget base (`REPLAYED\|3`). The **original event ID** is redelivered once, and the conversation completes strictly in order 1..20 |
| 3.08 | Crash windows | (a) worker died after claim; (b) worker delivered and committed, then died before ack. After lease expiry both events were re-claimed (attempts 2) and each was **applied exactly once**: `mesh.deliveries` acted as the consumer inbox and skipped the second application, and order stayed intact |

### 4.3 What the ordering guarantee is, and is not [I]

- **Guaranteed:** for each aggregate, *acknowledged publication* follows sequence order, and at most one event per aggregate is in flight at a time.
- **Not guaranteed, and inherent to at-least-once delivery:** a worker whose lease expired mid-delivery can still hand its stale copy to an external consumer *after* a newer worker has delivered and acknowledged it. The fence stops the stale ack (1.10, 1.11), but it cannot recall an HTTP request already sent.

Consumers must therefore keep the dedupe and stale-sequence rules the dossiers already require:

- App 1 ignores or quarantines stale `task_seq`, and a completed request never regresses (`01:L2660`);
- inboxes compare payload hashes (`03:L487–499`).

**The relay's lease duration must exceed the consumer's worst-case delivery time.** Lease expiry is a recovery path, not a normal event.

---

## 5. Area 4 — anti-storm causal-depth limiter and dead-letter store

### 5.1 Lineage without columns: capture during delivery [O]

Only App 1 has both correlation and causation columns; App 2 has causation only; Apps 3–5 have neither. `mesh.lineage` records, per event: correlation, parent, depth and *how* the parent was determined. There are three ways:

- **ROOT:** the event has no causation. Depth 0; correlation = the event's own `correlation_id` (App 1) or its event ID.
- **COLUMN:** the event's `causation_id` names an event the mesh has already seen. Depth = parent depth + 1. If the named parent was never seen by the mesh, it becomes **ORPHAN at depth 1**, so depth is never under-counted.
- **CAPTURE:** `mesh.deliver` runs in a **`REPEATABLE READ`** transaction and enforces it.
  - It snapshots the set of unpublished outbox keys across all five apps, calls the consumer, then snapshots again.
  - Under `REPEATABLE READ`, other transactions' commits are invisible, so the difference is exactly the set of rows **this consumer wrote in this transaction**, including rows written in committed sub-transactions.
  - Each such row gets lineage parent = the delivered event, depth + 1.

This works for any app, with no column and no trigger added to any locked table. It also enforces nothing on the consumer beyond being called by the relay.

**Why `REPEATABLE READ` [D/I].** Under `READ COMMITTED`, rows committed concurrently by other producers during the handler call would appear in the second snapshot and be mis-attributed as children. That inflates depth, which is safe but wrong. `REPEATABLE READ` removes that noise.

### 5.2 The storm experiment [O]

- **Routes:** App 1 `GuestRequestDetectedEvent` → consumer `ops`, and App 3 `TaskQueuedEvent` → consumer `cc`.
- **Test doubles:** an operations double that queues a task event, and a contact-center double that re-detects a request. The latter writes through App 1's real trigger and sets `causation_id` like a real App 1 producer would.
- **Trigger:** one root `GuestRequestDetectedEvent` ("Extra towels to room 304") was inserted and the relay was run until idle.

| # | Result |
|---|---|
| 4.01 | Lineage depths **0..9, strictly alternating** `cc, ops, cc, …, ops`, all under the root's correlation ID |
| 4.02 | **9 deliveries** (depths 0–8). The depth-9 event was never delivered, and **no depth-10 event exists**: propagation stopped |
| 4.03 | The depth-9 event (App 3) is dead-lettered as **`CAUSAL_DEPTH_EXCEEDED`**, recording depth 9, the correlation ID, a **10-entry causal chain** from the root (`chain[0]` = the root event ID) to itself, and `causal depth 9 exceeds limit 8 (correlation …)` |
| 4.04 | Lineage for the columnless source works: the root is `ROOT`, and all 9 descendants are `CAPTURE` |
| 4.05 | For App 1's 4 descendant events, the captured parent equals the `causation_id` column in **4 of 4** |
| 4.06 | The parked depth-9 event is an **unsequenced** App 3 `TaskQueuedEvent`. It is parked (`available_at = infinity`), blocks no aggregate, and other traffic in the property keeps flowing |
| 4.12 | **No false positive:** with the write-back route removed, a real request → task flow is recorded as `cc:0, ops:1` and completes |

**Depth semantics [I].** The limit is the maximum *delivered* depth: 8, meaning a chain of at most 9 events. The first event past it (depth 9) is dead-lettered. The legitimate flows in the locked dossiers are shallow:

- F1 → F2 → App 1 republish is depth ≤ 2;
- an agent handoff chain is bounded by App 5's ≤ 4 handoffs (`05:L196`).

A limit of 8 therefore leaves headroom without letting a storm run. Per-route limits can tighten this later.

### 5.3 Dead-letter store semantics [O]

| Property | Evidence |
|---|---|
| **Two reason codes:** `RETRY_BUDGET_EXHAUSTED` (after `max_attempts` since the last replay) and `CAUSAL_DEPTH_EXCEEDED` | 3.04, 4.03 |
| **Parking**, not deletion: the source row stays unpublished and `available_at = 'infinity'` (native) or `parked = true` (App 2 sidecar). A sequenced row therefore keeps blocking **its own aggregate only** | 3.05, 4.06 |
| **Replay** is a reviewed action that records the reviewer, sets `replay_base`, re-enables the original row and redelivers the same event ID | 3.07 |
| **Causal-depth dead letters cannot be replayed** (that would restart the storm); they can only be **discarded with a reviewed reason** after the loop is fixed | 4.07, 4.08 |
| **Discard** marks the source row published without delivering it. The locked outboxes have no other terminal state, and the dead-letter row is the audit record of the non-delivery | 4.08 |
| **Idempotent:** dead-lettering an event again neither duplicates it nor reopens a resolved entry | 4.09 |
| **Minimal:** columns are identifiers, aggregate, seq, type, reason, depth, correlation, causal chain, attempts, last error, worker, **`payload_sha256`**, state and resolution. **There is no payload column**; personal data stays in the owning app's outbox, under that app's retention and erasure rules (`00 §4.5` step 6) | 4.10 |
| **Durable:** after `pg_ctl restart -m immediate` (crash-style, no clean shutdown), the dead-letter table's content hash is identical | 4.11 |

---

## 6. Hazards discovered while building it

These go beyond the brief. Each was hit for real and then fixed or documented.

| # | Hazard | How it showed up | Resolution |
|---|---|---|---|
| H1 | **Head-of-line throttling:** with one claim per property per cycle, each aggregate advances only one event per cycle | smoke run: an App 5 session with 9 events had 2 still unpublished after 5 cycles | bounded **drain rounds** (claim → deliver → ack → claim again, up to 50 rounds per property × source per cycle): all 46 events published in the first cycle |
| H2 | **PL/pgSQL transaction control:** `SET TRANSACTION ISOLATION LEVEL` fails after `COMMIT` once the loop header has evaluated an expression, because that evaluation already started the next transaction | `ERROR: SET TRANSACTION ISOLATION LEVEL must be called before any query` | select the next transaction's isolation through the session's `default_transaction_isolation`, set just before the committing statement and reset after the last row. `deliver()` refuses to run outside `REPEATABLE READ`. 2.03 verifies nothing leaks |
| H3 | `psql -c "SET ROLE …; CALL …"` runs as one implicit transaction block, where a procedure cannot `COMMIT` | `ERROR: invalid transaction termination` | issue them as separate commands (as any real client would) |
| H4 | **App 1's outbox trigger `allocate_event()` resolves `conversations` through the caller's `search_path`.** Any producer writing App 1 events — an App 1 function called from a kernel definer with a pinned path, or a consumer in another app — fails unless `contact_center` is first on its path | `ERROR: relation "conversations" does not exist` when seeding, and in the write-back test double | producers set `search_path = contact_center, pg_catalog`. **Change request to App 1: pin `search_path` on its trigger and functions** (strengthens `00` CR5, confirms `01 §3.3`) |
| H5 | Append-only heartbeats grow at about 5,000 rows per cycle | measured | upsert latest-state plus sampled history (§3.3) |
| H6 | Scanning 1,000+ idle tenants dominates cycle time | 3 s cycles; ordering run 11.8–39.6 s | pending-work hint with periodic full sweep (§3.3) |
| H7 | App 2 sidecar leasing is only correct if the sidecar row is the one locked and updated | design analysis, confirmed by 1.09 | implemented as such |

---

## 7. Verified architecture (specification for the next phase)

Normative for the implementation phase; to be built as reviewed migrations, not by copying the fixture.

**Roles:**

| Role | Attributes and grants | Purpose |
|---|---|---|
| `platform_relay` | `NOLOGIN NOBYPASSRLS`; member of each transport role `WITH INHERIT FALSE, SET TRUE` | the relay; switches to one transport role per source per transaction |
| `cc_transport`, `crm_transport`, `ops_transport` | new, with column-level lease and publish `UPDATE` | App 1–3 transport |
| `kb_transport`, `ai_transport` | as locked, no change | App 4–5 transport |
| `mesh_owner` | owns the definer functions: `deliver`, `lineage`, `park`, `dead_letter`, `nack`, `heartbeat`, `relay_health`, `replay`, `discard`. Holds read and park access on all five outboxes, `EXECUTE` on the apps' `tenant()` functions, and a read policy on `platform.spaces` | kernel side of delivery and dead-lettering |

No role is superuser or `BYPASSRLS` (1.08). The production relay credential is a login role that is a member of `platform_relay`; the tests used exactly that (`mesh_relay_login`).

**Relay algorithm (R1):**

- one backend, many short transactions (§3.1);
- iterate non-offboarded properties from the kernel;
- transaction-local tenant context and role per property × source;
- head-of-line claims (§4) with the per-source lease strategy (§2.3);
- delivery in `REPEATABLE READ` with capture-based lineage (§5.1) and a delivery inbox;
- fenced ack / nack with exponential backoff and a retry budget;
- bounded drain rounds;
- one heartbeat per scan.

**Invariants, each tested:**

- **Locked tables:** never structurally altered (1.01).
- **Context:** the relay never reads an outbox without tenant context and a transport role (1.07, 2.01); the monitor never computes ground truth without tenant context (2.02).
- **Ordering:** at most one in-flight event per aggregate, with acknowledged order equal to sequence order (3.02); supersession pairs are never split (1.12).
- **Delivery:** every event is applied at most once per consumer (2.11, 3.08).
- **Loop control:** delivered causal depth ≤ 8 (4.02); a poison or storm event blocks only its own aggregate (3.05, 4.06).
- **Dead letters:** they contain no payload (4.10) and survive a crash restart (4.11).

**Operations surface:**

- `mesh.relay_health()` statuses (§3.2) as alerts;
- dead-letter replay and discard as reviewed actions recording the reviewer;
- outbox age per property × source as an SLO.

**Required before production (not built here):**

- **Hardening:**
  - the pending-work hint and latest-state heartbeats (H5, H6);
  - retention for `mesh.lineage`, `mesh.deliveries`, heartbeats and published outbox rows, at least as long as the replay window (`01:L755`);
  - signed envelopes for cross-service transport (`00 §7.4`).
- **Consumers:**
  - real consumer functions and inboxes: App 3 `ingest_request`/`task_inbox`, App 1's callback endpoint, App 2's resolution bridge;
  - the delivery path under each consumer's own least-privilege role (`00 §4.5`).
- **Gaps and change requests carried over from `00`/`01`:**
  - App 2 `$id` schemas for its privacy events (CR7);
  - the one-sided flows F3/F4/F5 (`00 §4.1`);
  - App 1 `search_path` pinning (H4);
  - App 3's own publisher function (`03:L705`), which this adapter can replace or wrap.

---

## 8. Reproduction

Prerequisites: the Sub-Component A environment (`01 §7`) — PostgreSQL 16 with pgvector ≥ 0.6.0 available to the server, and Python 3.12 with `jsonschema` and `referencing`. Run from the repository root.

```bash
export MESH_WORKDIR="$(mktemp -d /tmp/event-mesh.XXXXXX)"
mkdir -p "$MESH_WORKDIR/kernel" "$MESH_WORKDIR/mesh" -m 700 "$MESH_WORKDIR/socket"
python3 - <<'PY'   # Sub-Component A artifacts from report 01, this report's artifacts from report 02
import os, re
from pathlib import Path
W = Path(os.environ['MESH_WORKDIR'])
for rep, sub in [('01_kernel_iam_research.md', 'kernel'), ('02_event_mesh_research.md', 'mesh')]:
    md = Path('research/platform/subcomponents', rep).read_text()
    for name, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```\w+\n(.*?)\n```', md, re.S):
        (W / sub / name).write_text(body + '\n')
PY
KERNEL_WORKDIR="$MESH_WORKDIR" python3 "$MESH_WORKDIR/kernel/prepare.py"
export PGBIN="$(pg_config --bindir)"          # or the relocated pgvector-enabled copy from 01 §0
"$PGBIN/initdb" -D "$MESH_WORKDIR/pgdata" -A trust --no-locale --encoding=UTF8
"$PGBIN/pg_ctl" -D "$MESH_WORKDIR/pgdata" -l "$MESH_WORKDIR/postgres.log" -o "-k $MESH_WORKDIR/socket -p 55466 -h ''" -w start
P="psql -X -q -h $MESH_WORKDIR/socket -p 55466 -v ON_ERROR_STOP=1"
$P -d postgres -c 'CREATE DATABASE kernel'
for n in 1 2 3 4 5; do $P -d kernel -f "$MESH_WORKDIR/ddl/app$n.sql"; done
$P -d postgres -c 'CREATE DATABASE kernel_clean TEMPLATE kernel'
python3 "$MESH_WORKDIR/mesh/build_base.py"                    # mesh_base: kernel + real App 1-5 outbox traffic
python3 "$MESH_WORKDIR/mesh/test_mesh.py" 1 2 3 4             # 43 checks; part 4 restarts the server via $PGBIN
"$PGBIN/pg_ctl" -D "$MESH_WORKDIR/pgdata" -m fast stop
```

**Independent reproduction [O]:** the recipe above was replayed from reports 01 and 02 alone into a new work directory and a new cluster, reusing only the relocated pgvector-enabled binaries. The locked suites rebuilt the same test bed (47 / 43 / 17 / 59; outbox rows 9 / 4 / 10 / 12 / 11), and `test_mesh.py 1 2 3 4` reported **43 passed, 0 failed**.

The harness clones `mesh_base` per part and installs `mesh_experiment.sql` into the clone. Roles are cluster-global, and the fixture provisions them idempotently with attribute verification. Never point any of this at a hotel database.

**Artifact fingerprints (as executed):**

| Artifact | SHA-256 |
|---|---|
| `mesh_experiment.sql` (Appendix A) | `cede9faa99f302358334bbb226227c5b0307bb80ffa81ff5f0f6212793548831` |
| `build_base.py` (Appendix B) | `03879aba7f4b887fcaea4f4b4930346c8518db29ef2c69f5a2d1222c3c2ff522` |
| `test_mesh.py` (Appendix C) | `86109be23aed3f5da04a24df5f6c938dfa4291172ba64d71830715114f903da5` |
| Sub-Component A `kernel_experiment.sql` / `test_kernel.py` / `prepare.py` | as recorded in `01 §7` (`28debaee…`, `36ccd111…`, `9a6e6a08…`) |

## 9. Limits of what this proves

- **Proven [O]:**
  - Adapters over the five real outboxes, without altering them.
  - Contract-valid envelopes.
  - Three lease strategies with fencing.
  - The zero-row hazard and its detection at 1,026-property scale.
  - Strict per-aggregate order under 6-way concurrency (versus a reordering negative control).
  - Poison, slow-event and crash isolation.
  - Exactly-once application through a delivery inbox.
  - Capture-based lineage for columnless sources.
  - A storm halted at depth 9.
  - A durable, minimal, idempotent dead-letter store.
- **Not proven:**
  - Delivery over HTTP to separately deployed services. All delivery here is in-database, to test doubles.
  - The real consumer functions and inboxes of Apps 1–3.
  - The pending-work hint and latest-state heartbeat redesign.
  - Retention and cleanup of mesh tables.
  - Behavior under network partitions.
  - The relay as an external process with a real connection pool, as opposed to a PL/pgSQL procedure. The transaction boundaries are the same.
  - Performance beyond the observations in §3.3.
- **Not done (by constraint):** no master DDL, and no change to any locked dossier, contract or table.

---

## Appendix A — experimental mesh fixture (`mesh_experiment.sql`)

Disposable test fixture installed on top of the five unmodified locked DDLs and the Sub-Component A kernel. **Not master DDL.**

<!-- artifact: mesh_experiment.sql -->
```sql
-- EXPERIMENTAL EVENT MESH (Sub-Component B micro-research). Disposable test fixture, NOT master DDL.
-- Prerequisites: the five locked app DDLs + the Sub-Component A kernel fixture (platform schema).
-- The five locked outbox tables are NOT altered: adapters read them and write only lease/publish columns
-- through per-app transport roles (Apps 4/5 use their locked kb_transport/ai_transport grants unchanged).

-- @@roles
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['mesh_owner','platform_relay','cc_transport','crm_transport','ops_transport'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS', r);
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN RAISE EXCEPTION 'role % has unsafe attributes', r; END IF;
 END LOOP; END $$;
-- PG16: the relay may SET ROLE to each transport role but inherits none of their privileges by default.
GRANT cc_transport, crm_transport, ops_transport, kb_transport, ai_transport TO platform_relay WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA mesh AUTHORIZATION mesh_owner;

-- @@transport_grants  (Apps 1-3 publish no transport role in their locked DDL; Apps 4/5 grants are used as locked)
GRANT USAGE ON SCHEMA contact_center TO cc_transport;
GRANT SELECT ON contact_center.outbox_events TO cc_transport;
GRANT UPDATE (claimed_until, attempts, published_at, available_at, last_error) ON contact_center.outbox_events TO cc_transport;
GRANT USAGE ON SCHEMA guest_crm TO crm_transport;
GRANT SELECT ON guest_crm.crm_outbox TO crm_transport;
GRANT UPDATE (published_at) ON guest_crm.crm_outbox TO crm_transport;
GRANT USAGE ON SCHEMA ops TO ops_transport;
GRANT SELECT ON ops.task_outbox TO ops_transport;
GRANT UPDATE (lease_token, leased_until, attempts, published_at, available_at, last_error) ON ops.task_outbox TO ops_transport;
GRANT EXECUTE ON FUNCTION ops.tenant() TO ops_transport;
-- mesh_owner (definer of delivery/lineage/monitor/park functions)
GRANT USAGE ON SCHEMA contact_center, guest_crm, ops, kb, workforce, platform TO mesh_owner;
GRANT SELECT ON contact_center.outbox_events, guest_crm.crm_outbox, ops.task_outbox, kb.storage_outbox, workforce.agent_outbox TO mesh_owner;
GRANT UPDATE (available_at, claimed_until, last_error, published_at) ON contact_center.outbox_events TO mesh_owner;
GRANT UPDATE (published_at) ON guest_crm.crm_outbox TO mesh_owner;
GRANT UPDATE (available_at, lease_token, leased_until, last_error, published_at) ON ops.task_outbox TO mesh_owner;
GRANT UPDATE (available_at, lease_token, leased_until, published_at) ON kb.storage_outbox, workforce.agent_outbox TO mesh_owner;
GRANT EXECUTE ON FUNCTION ops.tenant(), kb.tenant(), workforce.tenant() TO mesh_owner;
GRANT SELECT ON platform.spaces TO mesh_owner;
CREATE POLICY mesh_registry_read ON platform.spaces FOR SELECT TO mesh_owner USING (true);

-- @@tables
SET ROLE mesh_owner;
CREATE TABLE mesh.sources (
 source text PRIMARY KEY CHECK (source IN ('cc','crm','ops','kb','ai')),
 outbox regclass NOT NULL, transport_role name NOT NULL, aggregate_kind text NOT NULL,
 ordering text NOT NULL CHECK (ordering IN ('SEQUENCED','PARTIAL','UNSEQUENCED')),
 lease_strategy text NOT NULL CHECK (lease_strategy IN ('TOKEN','ATTEMPT_FENCE','SIDECAR')),
 lineage_mode text NOT NULL CHECK (lineage_mode IN ('COLUMN+CAPTURE','CAPTURE')));
INSERT INTO mesh.sources VALUES
 ('cc','contact_center.outbox_events','cc_transport','conversation','SEQUENCED','ATTEMPT_FENCE','COLUMN+CAPTURE'),
 ('crm','guest_crm.crm_outbox','crm_transport','profile','UNSEQUENCED','SIDECAR','COLUMN+CAPTURE'),
 ('ops','ops.task_outbox','ops_transport','task','PARTIAL','TOKEN','CAPTURE'),
 ('kb','kb.storage_outbox','kb_transport','knowledge_item','SEQUENCED','TOKEN','CAPTURE'),
 ('ai','workforce.agent_outbox','ai_transport','session','SEQUENCED','TOKEN','CAPTURE');

CREATE TABLE mesh.crm_leases (                        -- sidecar lease state for App 2 (no lease columns)
 space_id uuid NOT NULL, event_id uuid NOT NULL, lease_token uuid, leased_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT '-infinity', parked boolean NOT NULL DEFAULT false,
 last_error text, PRIMARY KEY (space_id, event_id), CHECK ((lease_token IS NULL) = (leased_until IS NULL)));
ALTER TABLE mesh.crm_leases ENABLE ROW LEVEL SECURITY; ALTER TABLE mesh.crm_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON mesh.crm_leases USING (space_id = nullif(current_setting('app.space_id', true), '')::uuid)
 WITH CHECK (space_id = nullif(current_setting('app.space_id', true), '')::uuid);

CREATE TABLE mesh.lineage (
 space_id uuid NOT NULL, source text NOT NULL, event_id uuid NOT NULL,
 correlation_id uuid NOT NULL, parent_source text, parent_event_id uuid,
 depth integer NOT NULL CHECK (depth >= 0), how text NOT NULL CHECK (how IN ('ROOT','COLUMN','CAPTURE','ORPHAN')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, source, event_id));
CREATE INDEX lineage_event ON mesh.lineage (space_id, event_id);

CREATE TABLE mesh.routes (source text NOT NULL REFERENCES mesh.sources, event_type text NOT NULL, consumer text NOT NULL,
 handler regprocedure NOT NULL, PRIMARY KEY (source, event_type, consumer));

CREATE TABLE mesh.deliveries (                        -- relay-side consumer inbox for in-database delivery
 space_id uuid NOT NULL, source text NOT NULL, event_id uuid NOT NULL, consumer text NOT NULL,
 worker text, delivered_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, source, event_id, consumer));

CREATE TABLE mesh.heartbeats (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, run_id uuid NOT NULL, worker text NOT NULL, source text NOT NULL,
 space_id uuid, context_bound boolean NOT NULL, pending_visible integer NOT NULL, claimed integer NOT NULL,
 at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX heartbeats_latest ON mesh.heartbeats (space_id, source, at DESC);

CREATE TABLE mesh.dead_letters (
 space_id uuid NOT NULL, source text NOT NULL, event_id uuid NOT NULL,
 aggregate_kind text NOT NULL, aggregate_id uuid, seq bigint, event_type text NOT NULL,
 reason_code text NOT NULL CHECK (reason_code IN ('RETRY_BUDGET_EXHAUSTED','CAUSAL_DEPTH_EXCEEDED')),
 depth integer, correlation_id uuid, causal_chain jsonb NOT NULL DEFAULT '[]', attempts integer NOT NULL,
 last_error text, worker text, payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','REPLAYED','DISCARDED')), replay_base integer NOT NULL DEFAULT 0,
 dead_lettered_at timestamptz NOT NULL DEFAULT clock_timestamp(), resolved_at timestamptz, resolved_by text, resolution_note text,
 PRIMARY KEY (space_id, source, event_id));
RESET ROLE;

-- @@types
CREATE TYPE mesh.lease_row AS (
 source text, space_id uuid, event_id uuid, aggregate_kind text, aggregate_id uuid, seq bigint, tiebreak text,
 ordering text, event_type text, schema_version integer, correlation_id uuid, causation_id uuid, group_key text,
 fence text, attempts integer, payload jsonb, created_at timestamptz);
ALTER TYPE mesh.lease_row OWNER TO mesh_owner;

-- @@adapters  (SECURITY INVOKER: they run as the per-app transport role under tenant context; RLS applies)
CREATE FUNCTION mesh.norm_cc(o contact_center.outbox_events, fence text) RETURNS mesh.lease_row LANGUAGE sql IMMUTABLE AS $$
 SELECT ROW('cc', o.space_id, o.id, 'conversation', o.conversation_id, o.event_seq, NULL, 'SEQUENCED', o.event_type, o.schema_version,
  o.correlation_id, o.causation_id, NULL, fence, o.attempts, o.payload, o.created_at)::mesh.lease_row $$;
CREATE FUNCTION mesh.norm_crm(o guest_crm.crm_outbox, fence text, attempts integer) RETURNS mesh.lease_row LANGUAGE sql IMMUTABLE AS $$
 SELECT ROW('crm', o.space_id, o.id, 'profile', o.profile_id, NULL, NULL, 'UNSEQUENCED', o.event_type, o.schema_version,
  NULL, o.causation_id, NULL, fence, attempts, o.payload, o.created_at)::mesh.lease_row $$;
CREATE FUNCTION mesh.norm_ops(o ops.task_outbox) RETURNS mesh.lease_row LANGUAGE sql IMMUTABLE AS $$
 SELECT ROW('ops', o.space_id, o.event_id, 'task', o.task_id, o.task_seq, NULL,
  CASE WHEN o.task_seq IS NULL THEN 'UNSEQUENCED' ELSE 'SEQUENCED' END, o.event_type, 1,
  NULL, NULL, NULL, o.lease_token::text, o.attempts, o.payload, o.created_at)::mesh.lease_row $$;
CREATE FUNCTION mesh.norm_kb(o kb.storage_outbox) RETURNS mesh.lease_row LANGUAGE sql IMMUTABLE AS $$
 SELECT ROW('kb', o.space_id, o.event_id, 'knowledge_item', o.knowledge_item_id, o.aggregate_version, NULL, 'SEQUENCED', o.event_type,
  coalesce((o.payload->>'schema_version')::integer, 1), NULL, NULL, 'epoch:' || (o.payload->>'knowledge_epoch'),
  o.lease_token::text, o.attempts, o.payload, o.created_at)::mesh.lease_row $$;
CREATE FUNCTION mesh.norm_ai(o workforce.agent_outbox) RETURNS mesh.lease_row LANGUAGE sql IMMUTABLE AS $$
 SELECT ROW('ai', o.space_id, o.event_id, 'session', o.session_id, o.state_version, o.event_type, 'SEQUENCED', o.event_type, 1,
  NULL, NULL, NULL, o.lease_token::text, o.attempts, o.payload, o.created_at)::mesh.lease_row $$;

-- Read-only normalized view of everything unpublished (no claim). Parked (dead-lettered) rows are included and flagged by available_at.
CREATE FUNCTION mesh.pending(p_source text) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF p_source = 'cc' THEN RETURN QUERY SELECT (mesh.norm_cc(o, NULL)).* FROM contact_center.outbox_events o WHERE o.published_at IS NULL;
 ELSIF p_source = 'crm' THEN RETURN QUERY SELECT (mesh.norm_crm(o, NULL, 0)).* FROM guest_crm.crm_outbox o WHERE o.published_at IS NULL;
 ELSIF p_source = 'ops' THEN RETURN QUERY SELECT (mesh.norm_ops(o)).* FROM ops.task_outbox o WHERE o.published_at IS NULL;
 ELSIF p_source = 'kb' THEN RETURN QUERY SELECT (mesh.norm_kb(o)).* FROM kb.storage_outbox o WHERE o.published_at IS NULL;
 ELSIF p_source = 'ai' THEN RETURN QUERY SELECT (mesh.norm_ai(o)).* FROM workforce.agent_outbox o WHERE o.published_at IS NULL;
 ELSE RAISE EXCEPTION 'unknown source %', p_source; END IF;
END $$;

CREATE FUNCTION mesh.pending_count(p_source text) RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE n integer; BEGIN
 IF p_source = 'crm' THEN
  SELECT count(*) INTO n FROM guest_crm.crm_outbox o WHERE o.published_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM mesh.crm_leases l WHERE l.space_id = o.space_id AND l.event_id = o.id AND l.parked);
 ELSE
  EXECUTE format('SELECT count(*) FROM %s WHERE published_at IS NULL AND available_at < ''infinity''',
   (SELECT outbox FROM mesh.sources WHERE source = p_source)) INTO n;
 END IF;
 RETURN n; END $$;

-- Head-of-line claims: a sequenced row is eligible only if no earlier unpublished row exists in its aggregate
-- (parked dead letters stay unpublished, so they keep blocking their own aggregate and nothing else).
CREATE FUNCTION mesh.claim_cc(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
BEGIN
 RETURN QUERY
 WITH cand AS (
  SELECT o.space_id, o.id FROM contact_center.outbox_events o
  WHERE o.published_at IS NULL AND o.available_at <= clock_timestamp()
    AND (o.claimed_until IS NULL OR o.claimed_until < clock_timestamp())
    AND (p_naive OR NOT EXISTS (SELECT 1 FROM contact_center.outbox_events p WHERE p.space_id = o.space_id
         AND p.conversation_id = o.conversation_id AND p.published_at IS NULL AND p.event_seq < o.event_seq))
  ORDER BY o.created_at, o.id LIMIT p_batch FOR UPDATE OF o SKIP LOCKED),
 upd AS (
  UPDATE contact_center.outbox_events o SET claimed_until = clock_timestamp() + p_lease, attempts = o.attempts + 1
  FROM cand WHERE o.space_id = cand.space_id AND o.id = cand.id RETURNING o.*)
 SELECT (mesh.norm_cc(u::contact_center.outbox_events, u.attempts::text)).* FROM upd u;
END $$;

-- App 2 has no lease columns. Leases live in a tenant-scoped sidecar; the sidecar row (not the locked outbox row) is
-- what gets locked and updated, so a concurrent claimer's EvalPlanQual recheck sees the new lease and skips it.
CREATE FUNCTION mesh.claim_crm(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO mesh.crm_leases (space_id, event_id)
  SELECT o.space_id, o.id FROM guest_crm.crm_outbox o WHERE o.published_at IS NULL ON CONFLICT DO NOTHING;
 RETURN QUERY
 WITH cand AS (
  SELECT l.space_id, l.event_id FROM mesh.crm_leases l JOIN guest_crm.crm_outbox o ON o.space_id = l.space_id AND o.id = l.event_id
  WHERE o.published_at IS NULL AND NOT l.parked AND l.available_at <= clock_timestamp()
    AND (l.leased_until IS NULL OR l.leased_until < clock_timestamp())
  ORDER BY o.created_at, o.id LIMIT p_batch FOR UPDATE OF l SKIP LOCKED),
 upd AS (
  UPDATE mesh.crm_leases l SET lease_token = gen_random_uuid(), leased_until = clock_timestamp() + p_lease, attempts = l.attempts + 1
  FROM cand WHERE l.space_id = cand.space_id AND l.event_id = cand.event_id RETURNING l.*)
 SELECT (mesh.norm_crm(o, u.lease_token::text, u.attempts)).* FROM upd u JOIN guest_crm.crm_outbox o ON o.space_id = u.space_id AND o.id = u.event_id;
END $$;

CREATE FUNCTION mesh.claim_ops(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
BEGIN
 RETURN QUERY
 WITH cand AS (
  SELECT o.space_id, o.event_id FROM ops.task_outbox o
  WHERE o.published_at IS NULL AND o.available_at <= clock_timestamp() AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
    AND (p_naive OR o.task_seq IS NULL OR NOT EXISTS (SELECT 1 FROM ops.task_outbox p WHERE p.space_id = o.space_id
         AND p.task_id = o.task_id AND p.task_seq IS NOT NULL AND p.published_at IS NULL AND p.task_seq < o.task_seq))
  ORDER BY o.created_at, o.event_id LIMIT p_batch FOR UPDATE OF o SKIP LOCKED),
 upd AS (
  UPDATE ops.task_outbox o SET lease_token = gen_random_uuid(), leased_until = clock_timestamp() + p_lease, attempts = o.attempts + 1
  FROM cand WHERE o.space_id = cand.space_id AND o.event_id = cand.event_id RETURNING o.*)
 SELECT (mesh.norm_ops(u::ops.task_outbox)).* FROM upd u;
END $$;

-- App 4: a supersession writes two events (different items) at one knowledge_epoch; they are claimed as one group.
-- Group exclusivity uses a transaction advisory lock in the kernel classid (101) per 01 report section 4.5.
CREATE FUNCTION mesh.claim_kb(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
DECLARE g text; n integer := 0;
BEGIN
 FOR g IN
  SELECT e FROM (SELECT DISTINCT o.payload->>'knowledge_epoch' AS e FROM kb.storage_outbox o
   WHERE o.published_at IS NULL AND o.available_at <= clock_timestamp()) s ORDER BY e::bigint
 LOOP
  EXIT WHEN n >= p_batch;
  CONTINUE WHEN NOT pg_try_advisory_xact_lock(101, hashtext(current_setting('app.space_id', true) || ':kb-epoch:' || g));
  -- whole group must be head-of-line eligible, unleased and not parked
  CONTINUE WHEN EXISTS (SELECT 1 FROM kb.storage_outbox o WHERE o.published_at IS NULL AND o.payload->>'knowledge_epoch' = g
   AND (o.available_at > clock_timestamp() OR (o.leased_until IS NOT NULL AND o.leased_until >= clock_timestamp())
        OR (NOT p_naive AND EXISTS (SELECT 1 FROM kb.storage_outbox p WHERE p.space_id = o.space_id AND p.knowledge_item_id = o.knowledge_item_id
            AND p.published_at IS NULL AND p.aggregate_version < o.aggregate_version))));
  RETURN QUERY
  WITH upd AS (
   UPDATE kb.storage_outbox o SET lease_token = gen_random_uuid(), leased_until = clock_timestamp() + p_lease, attempts = o.attempts + 1
   WHERE o.published_at IS NULL AND o.payload->>'knowledge_epoch' = g RETURNING o.*)
  SELECT (mesh.norm_kb(u::kb.storage_outbox)).* FROM upd u ORDER BY u.created_at, u.event_id;
  n := n + 1;
 END LOOP;
END $$;

CREATE FUNCTION mesh.claim_ai(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
BEGIN
 RETURN QUERY
 WITH cand AS (
  SELECT o.space_id, o.event_id FROM workforce.agent_outbox o
  WHERE o.published_at IS NULL AND o.available_at <= clock_timestamp() AND (o.leased_until IS NULL OR o.leased_until < clock_timestamp())
    AND (p_naive OR NOT EXISTS (SELECT 1 FROM workforce.agent_outbox p WHERE p.space_id = o.space_id AND p.session_id = o.session_id
         AND p.published_at IS NULL AND p.state_version < o.state_version))
  ORDER BY o.created_at, o.event_id LIMIT p_batch FOR UPDATE OF o SKIP LOCKED),
 upd AS (
  UPDATE workforce.agent_outbox o SET lease_token = gen_random_uuid(), leased_until = clock_timestamp() + p_lease, attempts = o.attempts + 1
  FROM cand WHERE o.space_id = cand.space_id AND o.event_id = cand.event_id RETURNING o.*)
 SELECT (mesh.norm_ai(u::workforce.agent_outbox)).* FROM upd u;
END $$;

CREATE FUNCTION mesh.claim(p_source text, p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
BEGIN
 IF p_source = 'cc' THEN RETURN QUERY SELECT * FROM mesh.claim_cc(p_batch, p_lease, p_naive);
 ELSIF p_source = 'crm' THEN RETURN QUERY SELECT * FROM mesh.claim_crm(p_batch, p_lease, p_naive);
 ELSIF p_source = 'ops' THEN RETURN QUERY SELECT * FROM mesh.claim_ops(p_batch, p_lease, p_naive);
 ELSIF p_source = 'kb' THEN RETURN QUERY SELECT * FROM mesh.claim_kb(p_batch, p_lease, p_naive);
 ELSIF p_source = 'ai' THEN RETURN QUERY SELECT * FROM mesh.claim_ai(p_batch, p_lease, p_naive);
 ELSE RAISE EXCEPTION 'unknown source %', p_source; END IF;
END $$;

-- Fenced acknowledgment: only the holder of the current lease identity may publish.
CREATE FUNCTION mesh.ack(p_source text, p_event uuid, p_fence text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n integer; BEGIN
 IF p_source = 'cc' THEN
  UPDATE contact_center.outbox_events SET published_at = clock_timestamp(), claimed_until = NULL
   WHERE id = p_event AND published_at IS NULL AND claimed_until IS NOT NULL AND attempts = p_fence::integer;
 ELSIF p_source = 'crm' THEN
  UPDATE mesh.crm_leases SET lease_token = NULL, leased_until = NULL WHERE event_id = p_event AND lease_token = p_fence::uuid;
  GET DIAGNOSTICS n = ROW_COUNT; IF n = 0 THEN RETURN false; END IF;
  UPDATE guest_crm.crm_outbox SET published_at = clock_timestamp() WHERE id = p_event AND published_at IS NULL;
 ELSIF p_source = 'ops' THEN
  UPDATE ops.task_outbox SET published_at = clock_timestamp(), lease_token = NULL, leased_until = NULL WHERE event_id = p_event AND lease_token = p_fence::uuid AND published_at IS NULL;
 ELSIF p_source = 'kb' THEN
  UPDATE kb.storage_outbox SET published_at = clock_timestamp(), lease_token = NULL, leased_until = NULL WHERE event_id = p_event AND lease_token = p_fence::uuid AND published_at IS NULL;
 ELSIF p_source = 'ai' THEN
  UPDATE workforce.agent_outbox SET published_at = clock_timestamp(), lease_token = NULL, leased_until = NULL WHERE event_id = p_event AND lease_token = p_fence::uuid AND published_at IS NULL;
 END IF;
 GET DIAGNOSTICS n = ROW_COUNT; RETURN n = 1; END $$;

-- @@kernel_functions  (SECURITY DEFINER, owned by mesh_owner; never switch tenant context except where declared)
CREATE FUNCTION mesh.read_event(p_source text, p_event uuid) RETURNS mesh.lease_row LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
DECLARE r mesh.lease_row; BEGIN
 SELECT * INTO r FROM mesh.pending(p_source) p WHERE p.event_id = p_event;
 IF NOT FOUND THEN
  IF p_source = 'cc' THEN SELECT (mesh.norm_cc(o, NULL)).* INTO r FROM contact_center.outbox_events o WHERE o.id = p_event;
  ELSIF p_source = 'crm' THEN SELECT (mesh.norm_crm(o, NULL, 0)).* INTO r FROM guest_crm.crm_outbox o WHERE o.id = p_event;
  ELSIF p_source = 'ops' THEN SELECT (mesh.norm_ops(o)).* INTO r FROM ops.task_outbox o WHERE o.event_id = p_event;
  ELSIF p_source = 'kb' THEN SELECT (mesh.norm_kb(o)).* INTO r FROM kb.storage_outbox o WHERE o.event_id = p_event;
  ELSIF p_source = 'ai' THEN SELECT (mesh.norm_ai(o)).* INTO r FROM workforce.agent_outbox o WHERE o.event_id = p_event; END IF;
 END IF;
 RETURN r; END $$;

-- Contract envelopes exactly as each locked dossier specifies (01:L2394, 02:L738, 03:L1160, 04 policy-event/1, 05:L1821).
CREATE FUNCTION mesh.envelope(r mesh.lease_row) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE r.source
  WHEN 'cc' THEN jsonb_build_object('specversion','1.0','id',r.event_id,'type',r.event_type,
    'source','urn:smartstay:space:'||r.space_id||':contact-center','subject','conversations/'||r.aggregate_id,
    'time',to_jsonb(r.created_at),'datacontenttype','application/json','schema_version',r.schema_version,'space_id',r.space_id,
    'conversation_id',r.aggregate_id,'event_seq',r.seq::text,'correlation_id',r.correlation_id,'causation_id',r.causation_id,'data',r.payload)
  WHEN 'crm' THEN jsonb_build_object('event_id',r.event_id,'type',r.event_type,'space_id',r.space_id,'occurred_at',to_jsonb(r.created_at),
    'causation_id',r.causation_id,'schema_version',r.schema_version,'data',r.payload)
  WHEN 'ai' THEN r.payload || jsonb_build_object('event_id',r.event_id,'occurred_at',to_jsonb(r.created_at))
  ELSE r.payload END $$;

CREATE FUNCTION mesh.pending_keys() RETURNS TABLE (source text, event_id uuid) LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
 SELECT 'cc', id FROM contact_center.outbox_events WHERE published_at IS NULL
 UNION ALL SELECT 'crm', id FROM guest_crm.crm_outbox WHERE published_at IS NULL
 UNION ALL SELECT 'ops', event_id FROM ops.task_outbox WHERE published_at IS NULL
 UNION ALL SELECT 'kb', event_id FROM kb.storage_outbox WHERE published_at IS NULL
 UNION ALL SELECT 'ai', event_id FROM workforce.agent_outbox WHERE published_at IS NULL $$;

CREATE FUNCTION mesh.ensure_lineage(r mesh.lease_row) RETURNS mesh.lineage LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
DECLARE l mesh.lineage; p mesh.lineage; BEGIN
 SELECT * INTO l FROM mesh.lineage WHERE space_id = r.space_id AND source = r.source AND event_id = r.event_id;
 IF FOUND THEN RETURN l; END IF;
 IF r.causation_id IS NOT NULL THEN
  SELECT * INTO p FROM mesh.lineage WHERE space_id = r.space_id AND event_id = r.causation_id ORDER BY depth DESC LIMIT 1;
  IF FOUND THEN
   INSERT INTO mesh.lineage VALUES (r.space_id, r.source, r.event_id, coalesce(r.correlation_id, p.correlation_id), p.source, p.event_id, p.depth + 1, 'COLUMN')
   RETURNING * INTO l;
  ELSE  -- caused by something the mesh never saw: count it as one hop rather than a root (never under-count)
   INSERT INTO mesh.lineage VALUES (r.space_id, r.source, r.event_id, coalesce(r.correlation_id, r.causation_id), NULL, r.causation_id, 1, 'ORPHAN')
   RETURNING * INTO l;
  END IF;
 ELSE
  INSERT INTO mesh.lineage VALUES (r.space_id, r.source, r.event_id, coalesce(r.correlation_id, r.event_id), NULL, NULL, 0, 'ROOT') RETURNING * INTO l;
 END IF;
 RETURN l; END $$;

CREATE FUNCTION mesh.causal_chain(p_space uuid, p_source text, p_event uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
 WITH RECURSIVE up AS (
  SELECT l.*, 0 AS hop FROM mesh.lineage l WHERE l.space_id = p_space AND l.source = p_source AND l.event_id = p_event
  UNION ALL
  SELECT l.*, up.hop + 1 FROM up JOIN mesh.lineage l ON l.space_id = up.space_id AND l.source = up.parent_source AND l.event_id = up.parent_event_id
  WHERE up.hop < 64)
 SELECT coalesce(jsonb_agg(jsonb_build_object('source', source, 'event_id', event_id, 'depth', depth, 'how', how) ORDER BY depth), '[]') FROM up $$;

-- Park = keep unpublished (so the aggregate stays blocked) but never claimable.
CREATE FUNCTION mesh.park(p_source text, p_event uuid, p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF p_source = 'cc' THEN UPDATE contact_center.outbox_events SET available_at = 'infinity', claimed_until = NULL, last_error = p_error WHERE id = p_event;
 ELSIF p_source = 'crm' THEN UPDATE mesh.crm_leases SET parked = true, lease_token = NULL, leased_until = NULL, last_error = p_error WHERE event_id = p_event;
 ELSIF p_source = 'ops' THEN UPDATE ops.task_outbox SET available_at = 'infinity', lease_token = NULL, leased_until = NULL, last_error = p_error WHERE event_id = p_event;
 ELSIF p_source = 'kb' THEN UPDATE kb.storage_outbox SET available_at = 'infinity', lease_token = NULL, leased_until = NULL WHERE event_id = p_event;
 ELSIF p_source = 'ai' THEN UPDATE workforce.agent_outbox SET available_at = 'infinity', lease_token = NULL, leased_until = NULL WHERE event_id = p_event; END IF;
END $$;

CREATE FUNCTION mesh.dead_letter(p_source text, p_event uuid, p_reason text, p_error text, p_worker text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
DECLARE r mesh.lease_row; l mesh.lineage; att integer; BEGIN
 r := mesh.read_event(p_source, p_event);
 SELECT * INTO l FROM mesh.lineage WHERE space_id = r.space_id AND source = p_source AND event_id = p_event;
 IF NOT FOUND THEN l := mesh.ensure_lineage(r); END IF;
 att := CASE WHEN p_source = 'crm' THEN (SELECT attempts FROM mesh.crm_leases WHERE event_id = p_event) ELSE r.attempts END;
 PERFORM mesh.park(p_source, p_event, p_error);
 INSERT INTO mesh.dead_letters (space_id, source, event_id, aggregate_kind, aggregate_id, seq, event_type, reason_code, depth, correlation_id,
   causal_chain, attempts, last_error, worker, payload_sha256)
 VALUES (r.space_id, p_source, p_event, r.aggregate_kind, r.aggregate_id, r.seq, r.event_type, p_reason, l.depth, l.correlation_id,
   mesh.causal_chain(r.space_id, p_source, p_event), att, p_error, p_worker,
   encode(sha256(convert_to(r.payload::text, 'UTF8')), 'hex'))
 ON CONFLICT (space_id, source, event_id) DO UPDATE SET state = 'OPEN', attempts = EXCLUDED.attempts, last_error = EXCLUDED.last_error,
   worker = EXCLUDED.worker, dead_lettered_at = clock_timestamp(), resolved_at = NULL, resolved_by = NULL
   WHERE mesh.dead_letters.state = 'REPLAYED';
END $$;

-- Retry budget counts attempts since the last reviewed replay.
CREATE FUNCTION mesh.nack(p_source text, p_event uuid, p_fence text, p_error text, p_max_attempts integer, p_worker text,
 p_backoff interval DEFAULT '50 milliseconds') RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE att integer; base integer; ok boolean; delay interval; BEGIN
 IF p_source = 'crm' THEN SELECT attempts INTO att FROM mesh.crm_leases WHERE event_id = p_event AND lease_token = p_fence::uuid;
 ELSIF p_source = 'cc' THEN SELECT attempts INTO att FROM contact_center.outbox_events WHERE id = p_event AND attempts = p_fence::integer AND claimed_until IS NOT NULL;
 ELSIF p_source = 'ops' THEN SELECT attempts INTO att FROM ops.task_outbox WHERE event_id = p_event AND lease_token = p_fence::uuid;
 ELSIF p_source = 'kb' THEN SELECT attempts INTO att FROM kb.storage_outbox WHERE event_id = p_event AND lease_token = p_fence::uuid;
 ELSIF p_source = 'ai' THEN SELECT attempts INTO att FROM workforce.agent_outbox WHERE event_id = p_event AND lease_token = p_fence::uuid; END IF;
 IF att IS NULL THEN RETURN 'STALE_FENCE'; END IF;
 base := coalesce((SELECT replay_base FROM mesh.dead_letters WHERE event_id = p_event AND source = p_source AND state = 'REPLAYED'), 0);
 IF att - base >= p_max_attempts THEN
  PERFORM mesh.dead_letter(p_source, p_event, 'RETRY_BUDGET_EXHAUSTED', p_error, p_worker); RETURN 'DEAD_LETTERED';
 END IF;
 delay := p_backoff * power(2, att - base - 1);
 IF p_source = 'cc' THEN UPDATE contact_center.outbox_events SET claimed_until = NULL, available_at = clock_timestamp() + delay, last_error = p_error WHERE id = p_event;
 ELSIF p_source = 'crm' THEN UPDATE mesh.crm_leases SET lease_token = NULL, leased_until = NULL, available_at = clock_timestamp() + delay, last_error = p_error WHERE event_id = p_event;
 ELSIF p_source = 'ops' THEN UPDATE ops.task_outbox SET lease_token = NULL, leased_until = NULL, available_at = clock_timestamp() + delay, last_error = p_error WHERE event_id = p_event;
 ELSIF p_source = 'kb' THEN UPDATE kb.storage_outbox SET lease_token = NULL, leased_until = NULL, available_at = clock_timestamp() + delay WHERE event_id = p_event;
 ELSIF p_source = 'ai' THEN UPDATE workforce.agent_outbox SET lease_token = NULL, leased_until = NULL, available_at = clock_timestamp() + delay WHERE event_id = p_event; END IF;
 RETURN 'RETRY'; END $$;

-- In-database delivery. Runs in a REPEATABLE READ transaction so that "rows visible now but not in the pre-call set"
-- are exactly the rows the consumer wrote in this transaction (including committed subtransactions): causal capture.
CREATE FUNCTION mesh.deliver(p_source text, p_event uuid, p_worker text, p_max_depth integer DEFAULT 8) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
DECLARE r mesh.lease_row; l mesh.lineage; rt mesh.routes; before_keys text[]; child record; routed integer := 0; BEGIN
 IF current_setting('transaction_isolation') <> 'repeatable read' THEN RAISE EXCEPTION 'deliver requires REPEATABLE READ for causal capture'; END IF;
 r := mesh.read_event(p_source, p_event);
 IF r.event_id IS NULL THEN RETURN 'GONE'; END IF;
 l := mesh.ensure_lineage(r);
 IF l.depth > p_max_depth THEN
  PERFORM mesh.dead_letter(p_source, p_event, 'CAUSAL_DEPTH_EXCEEDED',
   format('causal depth %s exceeds limit %s (correlation %s)', l.depth, p_max_depth, l.correlation_id), p_worker);
  RETURN 'DEAD_LETTERED';
 END IF;
 FOR rt IN SELECT * FROM mesh.routes WHERE source = p_source AND event_type = r.event_type ORDER BY consumer LOOP
  routed := routed + 1;
  CONTINUE WHEN EXISTS (SELECT 1 FROM mesh.deliveries d WHERE d.space_id = r.space_id AND d.source = p_source AND d.event_id = p_event AND d.consumer = rt.consumer);
  SELECT array_agg(k.source || ':' || k.event_id) INTO before_keys FROM mesh.pending_keys() k;
  EXECUTE format('SELECT %s($1, $2)', rt.handler::regproc) USING to_jsonb(r), mesh.envelope(r);
  FOR child IN SELECT k.source, k.event_id FROM mesh.pending_keys() k WHERE NOT (k.source || ':' || k.event_id = ANY (coalesce(before_keys, '{}'))) LOOP
   INSERT INTO mesh.lineage VALUES (r.space_id, child.source, child.event_id, l.correlation_id, p_source, p_event, l.depth + 1, 'CAPTURE')
   ON CONFLICT (space_id, source, event_id) DO NOTHING;
  END LOOP;
  INSERT INTO mesh.deliveries (space_id, source, event_id, consumer, worker) VALUES (r.space_id, p_source, p_event, rt.consumer, p_worker);
 END LOOP;
 RETURN CASE WHEN routed = 0 THEN 'NO_CONSUMER' ELSE 'DELIVERED' END;
END $$;

CREATE FUNCTION mesh.heartbeat(p_run uuid, p_worker text, p_source text, p_pending integer, p_claimed integer) RETURNS void LANGUAGE sql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
 INSERT INTO mesh.heartbeats (run_id, worker, source, space_id, context_bound, pending_visible, claimed)
 VALUES (p_run, p_worker, p_source, nullif(current_setting('app.space_id', true), '')::uuid,
         nullif(current_setting('app.space_id', true), '') IS NOT NULL, p_pending, p_claimed) $$;

CREATE FUNCTION mesh.relay_spaces() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 SELECT id FROM platform.spaces WHERE lifecycle <> 'OFFBOARDED' ORDER BY id $$;   -- SUSPENDED still relays (erasure must flow)

-- Monitor: ground truth is computed per tenant WITH context (a context-free monitor would be blind too).
CREATE FUNCTION mesh.relay_health(p_window interval DEFAULT '5 minutes') RETURNS TABLE (space_id uuid, property_code text, source text,
 backlog integer, oldest_age interval, dead_letters_open integer, last_heartbeat timestamptz, last_seen integer, status text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET app.space_id = '' AS $$
DECLARE s record; src text; hb mesh.heartbeats; b integer; old timestamptz; dl integer; BEGIN
 FOR s IN SELECT id, platform.spaces.property_code, lifecycle FROM platform.spaces ORDER BY property_code LOOP
  PERFORM set_config('app.space_id', s.id::text, true);
  FOREACH src IN ARRAY ARRAY['cc','crm','ops','kb','ai'] LOOP
   SELECT count(*), min(p.created_at) INTO b, old FROM mesh.pending(src) p
    WHERE NOT EXISTS (SELECT 1 FROM mesh.dead_letters d WHERE d.space_id = p.space_id AND d.source = src AND d.event_id = p.event_id AND d.state = 'OPEN');
   SELECT count(*) INTO dl FROM mesh.dead_letters d WHERE d.space_id = s.id AND d.source = src AND d.state = 'OPEN';
   SELECT * INTO hb FROM mesh.heartbeats h WHERE h.space_id = s.id AND h.source = src AND h.at > clock_timestamp() - p_window ORDER BY h.at DESC LIMIT 1;
   space_id := s.id; property_code := s.property_code; source := src; backlog := b; oldest_age := clock_timestamp() - old;
   dead_letters_open := dl; last_heartbeat := hb.at; last_seen := hb.pending_visible;
   CONTINUE WHEN s.lifecycle = 'OFFBOARDED' AND b = 0;
   status := CASE WHEN s.lifecycle = 'OFFBOARDED' THEN 'OFFBOARDED_BACKLOG'
                  WHEN hb.id IS NULL AND b > 0 THEN 'UNSCANNED_BACKLOG'
                  WHEN hb.id IS NULL THEN 'UNSCANNED_IDLE'
                  WHEN hb.pending_visible = 0 AND old < hb.at THEN 'BLIND_SCAN'
                  WHEN dl > 0 THEN 'DEAD_LETTER_OPEN' ELSE 'OK' END;
   RETURN NEXT;
  END LOOP;
 END LOOP;
 FOR s IN SELECT h.worker, h.source, count(*) AS n, max(h.at) AS at FROM mesh.heartbeats h
          WHERE NOT h.context_bound AND h.at > clock_timestamp() - p_window GROUP BY 1, 2 LOOP
  space_id := NULL; property_code := 'worker:' || s.worker; source := s.source; backlog := NULL; oldest_age := NULL;
  dead_letters_open := NULL; last_heartbeat := s.at; last_seen := 0; status := 'CONTEXTLESS_RELAY'; RETURN NEXT;
 END LOOP;
END $$;

CREATE FUNCTION mesh.replay_dead_letter(p_source text, p_event uuid, p_actor text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
DECLARE d mesh.dead_letters; att integer; BEGIN
 SELECT * INTO STRICT d FROM mesh.dead_letters WHERE source = p_source AND event_id = p_event
  AND space_id = nullif(current_setting('app.space_id', true), '')::uuid FOR UPDATE;
 IF d.state <> 'OPEN' THEN RAISE EXCEPTION 'dead letter is %', d.state; END IF;
 IF d.reason_code = 'CAUSAL_DEPTH_EXCEEDED' THEN RAISE EXCEPTION 'causal-depth dead letters cannot be replayed; discard after fixing the loop'; END IF;
 att := CASE WHEN p_source = 'crm' THEN (SELECT attempts FROM mesh.crm_leases WHERE event_id = p_event) ELSE (mesh.read_event(p_source, p_event)).attempts END;
 UPDATE mesh.dead_letters SET state = 'REPLAYED', replay_base = att, resolved_at = clock_timestamp(), resolved_by = p_actor
  WHERE space_id = d.space_id AND source = p_source AND event_id = p_event;
 IF p_source = 'cc' THEN UPDATE contact_center.outbox_events SET available_at = clock_timestamp() WHERE id = p_event;
 ELSIF p_source = 'crm' THEN UPDATE mesh.crm_leases SET parked = false, available_at = clock_timestamp() WHERE event_id = p_event;
 ELSIF p_source = 'ops' THEN UPDATE ops.task_outbox SET available_at = clock_timestamp() WHERE event_id = p_event;
 ELSIF p_source = 'kb' THEN UPDATE kb.storage_outbox SET available_at = clock_timestamp() WHERE event_id = p_event;
 ELSIF p_source = 'ai' THEN UPDATE workforce.agent_outbox SET available_at = clock_timestamp() WHERE event_id = p_event; END IF;
END $$;

-- Discard resolves a dead letter WITHOUT delivery. The locked outboxes only have published_at, so the row is marked
-- published (unblocking its aggregate) and the dead-letter record is the audit of the non-delivery.
CREATE FUNCTION mesh.discard_dead_letter(p_source text, p_event uuid, p_actor text, p_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF p_note IS NULL OR length(trim(p_note)) = 0 THEN RAISE EXCEPTION 'discard requires a reviewed reason'; END IF;
 UPDATE mesh.dead_letters SET state = 'DISCARDED', resolved_at = clock_timestamp(), resolved_by = p_actor, resolution_note = p_note
  WHERE source = p_source AND event_id = p_event AND state = 'OPEN' AND space_id = nullif(current_setting('app.space_id', true), '')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'no open dead letter'; END IF;
 IF p_source = 'cc' THEN UPDATE contact_center.outbox_events SET published_at = clock_timestamp() WHERE id = p_event;
 ELSIF p_source = 'crm' THEN UPDATE guest_crm.crm_outbox SET published_at = clock_timestamp() WHERE id = p_event;
 ELSIF p_source = 'ops' THEN UPDATE ops.task_outbox SET published_at = clock_timestamp() WHERE event_id = p_event;
 ELSIF p_source = 'kb' THEN UPDATE kb.storage_outbox SET published_at = clock_timestamp() WHERE event_id = p_event;
 ELSIF p_source = 'ai' THEN UPDATE workforce.agent_outbox SET published_at = clock_timestamp() WHERE event_id = p_event; END IF;
END $$;

-- @@relay  (R1: one backend, many short transactions; SECURITY INVOKER because procedures with transaction control cannot be definer)
CREATE PROCEDURE mesh.r1_run(p_worker text, p_sources text[], p_batch integer DEFAULT 10, p_lease interval DEFAULT '30 seconds',
 p_max_cycles integer DEFAULT 1000, p_idle_cycles integer DEFAULT 2, p_bind_context boolean DEFAULT true,
 p_max_attempts integer DEFAULT 3, p_naive boolean DEFAULT false, p_max_depth integer DEFAULT 8, p_drain_rounds integer DEFAULT 50,
 p_spaces uuid[] DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE sp uuid; src text; spaces uuid[]; rows mesh.lease_row[]; r mesh.lease_row; outcome text; err text; run uuid;
 idle integer := 0; work integer; cyc integer := 0; pend integer; trole name; i integer; rounds integer; BEGIN
 COMMIT;
 WHILE cyc < p_max_cycles AND idle < p_idle_cycles LOOP
  cyc := cyc + 1; work := 0; run := gen_random_uuid();
  spaces := coalesce(p_spaces, ARRAY(SELECT mesh.relay_spaces()));   -- p_spaces emulates a statically configured relay
  COMMIT;
  FOREACH sp IN ARRAY spaces LOOP
   FOREACH src IN ARRAY p_sources LOOP
   SELECT transport_role INTO trole FROM mesh.sources WHERE source = src;
   rounds := 0;
   LOOP                                   -- drain this property/source in bounded rounds (fairness across tenants)
    rounds := rounds + 1;
    IF p_bind_context THEN PERFORM set_config('app.space_id', sp::text, true); END IF;
    PERFORM set_config('TimeZone', 'UTC', true);
    PERFORM set_config('role', trole, true);
    pend := mesh.pending_count(src);
    rows := ARRAY(SELECT c FROM mesh.claim(src, p_batch, p_lease, p_naive) c);
    PERFORM mesh.heartbeat(run, p_worker, src, pend, cardinality(rows));
    -- Delivery transactions must be REPEATABLE READ (causal capture). PL/pgSQL evaluates the loop header after COMMIT,
    -- which already starts the next transaction, so the isolation is chosen via the session default instead of SET TRANSACTION.
    IF cardinality(rows) > 0 THEN PERFORM set_config('default_transaction_isolation', 'repeatable read', false); END IF;
    COMMIT;
    FOR i IN 1 .. cardinality(rows) LOOP
     r := rows[i];
     PERFORM set_config('app.space_id', r.space_id::text, true);
     PERFORM set_config('TimeZone', 'UTC', true);
     PERFORM set_config('app.mesh_worker', p_worker, true);
     BEGIN outcome := mesh.deliver(src, r.event_id, p_worker, p_max_depth); err := NULL;
     EXCEPTION WHEN OTHERS THEN outcome := 'ERROR'; err := SQLERRM; END;
     COMMIT;
     PERFORM set_config('app.space_id', r.space_id::text, true);
     PERFORM set_config('role', trole, true);
     IF outcome IN ('DELIVERED', 'NO_CONSUMER', 'GONE') THEN PERFORM mesh.ack(src, r.event_id, r.fence);
     ELSIF outcome = 'ERROR' THEN PERFORM mesh.nack(src, r.event_id, r.fence, err, p_max_attempts, p_worker); END IF;
     IF i = cardinality(rows) THEN PERFORM set_config('default_transaction_isolation', 'read committed', false); END IF;
     COMMIT;
     work := work + 1;
    END LOOP;
    EXIT WHEN cardinality(rows) = 0 OR rounds >= p_drain_rounds;
   END LOOP;
   END LOOP;
  END LOOP;
  IF work = 0 THEN idle := idle + 1; PERFORM pg_sleep(0.05); ELSE idle := 0; END IF;
  COMMIT;
 END LOOP;
END $$;

-- @@grants
ALTER FUNCTION mesh.read_event(text, uuid) OWNER TO mesh_owner;
ALTER FUNCTION mesh.pending_keys() OWNER TO mesh_owner;
ALTER FUNCTION mesh.ensure_lineage(mesh.lease_row) OWNER TO mesh_owner;
ALTER FUNCTION mesh.causal_chain(uuid, text, uuid) OWNER TO mesh_owner;
ALTER FUNCTION mesh.park(text, uuid, text) OWNER TO mesh_owner;
ALTER FUNCTION mesh.dead_letter(text, uuid, text, text, text) OWNER TO mesh_owner;
ALTER FUNCTION mesh.nack(text, uuid, text, text, integer, text, interval) OWNER TO mesh_owner;
ALTER FUNCTION mesh.deliver(text, uuid, text, integer) OWNER TO mesh_owner;
ALTER FUNCTION mesh.heartbeat(uuid, text, text, integer, integer) OWNER TO mesh_owner;
ALTER FUNCTION mesh.relay_spaces() OWNER TO mesh_owner;
ALTER FUNCTION mesh.relay_health(interval) OWNER TO mesh_owner;
ALTER FUNCTION mesh.replay_dead_letter(text, uuid, text) OWNER TO mesh_owner;
ALTER FUNCTION mesh.discard_dead_letter(text, uuid, text, text) OWNER TO mesh_owner;
GRANT SELECT, INSERT, UPDATE ON mesh.crm_leases TO crm_transport, mesh_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mesh FROM PUBLIC;
REVOKE ALL ON PROCEDURE mesh.r1_run(text, text[], integer, interval, integer, integer, boolean, integer, boolean, integer, integer, uuid[]) FROM PUBLIC;
GRANT USAGE ON SCHEMA mesh TO platform_relay, cc_transport, crm_transport, ops_transport, kb_transport, ai_transport;
GRANT SELECT ON mesh.sources TO platform_relay, cc_transport, crm_transport, ops_transport, kb_transport, ai_transport;
GRANT EXECUTE ON FUNCTION mesh.norm_cc(contact_center.outbox_events, text), mesh.norm_crm(guest_crm.crm_outbox, text, integer),
 mesh.norm_ops(ops.task_outbox), mesh.norm_kb(kb.storage_outbox), mesh.norm_ai(workforce.agent_outbox),
 mesh.pending(text), mesh.pending_count(text), mesh.claim(text, integer, interval, boolean), mesh.claim_cc(integer, interval, boolean),
 mesh.claim_crm(integer, interval, boolean), mesh.claim_ops(integer, interval, boolean), mesh.claim_kb(integer, interval, boolean),
 mesh.claim_ai(integer, interval, boolean), mesh.ack(text, uuid, text), mesh.nack(text, uuid, text, text, integer, text, interval),
 mesh.heartbeat(uuid, text, text, integer, integer), mesh.envelope(mesh.lease_row)
 TO cc_transport, crm_transport, ops_transport, kb_transport, ai_transport, mesh_owner;
GRANT EXECUTE ON FUNCTION mesh.relay_spaces(), mesh.deliver(text, uuid, text, integer) TO platform_relay;
GRANT EXECUTE ON PROCEDURE mesh.r1_run(text, text[], integer, interval, integer, integer, boolean, integer, boolean, integer, integer, uuid[]) TO platform_relay;
GRANT EXECUTE ON FUNCTION mesh.read_event(text, uuid), mesh.pending_keys(), mesh.ensure_lineage(mesh.lease_row), mesh.causal_chain(uuid, text, uuid),
 mesh.park(text, uuid, text), mesh.dead_letter(text, uuid, text, text, text) TO mesh_owner;
```

## Appendix B — test-bed builder (`build_base.py`)

Builds `mesh_base` from `kernel_clean`: Sub-Component A kernel (hard-FK mode), the locked App 3/4/5 suites' real outbox traffic, and App 1/App 2 events from their own locked functions.

<!-- artifact: build_base.py -->
```python
"""Build `mesh_base`: five locked app schemas + Sub-Component A kernel (hard-FK mode, 01 report §3.5 / check 4.03)
+ real outbox traffic produced by the locked App 3/4/5 verification suites + App 1/App 2 events produced by
their own locked functions (change_control, erase_profile). Run from the repository root."""
import os, sys, re, subprocess, json, uuid
from pathlib import Path
W = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(W / 'kernel'))
import test_kernel as K                                 # Sub-Component A fixture helpers, unmodified

def psql(sql, db='mesh_base', check=True):
    return K.psql(sql, db, check=check)

K.psql('DROP DATABASE IF EXISTS mesh_base;', 'postgres')
K.psql('CREATE DATABASE mesh_base TEMPLATE kernel_clean;', 'postgres')
K.install_kernel('mesh_base', fk=True)
# 4.03 mode: fixture tenants registered in the kernel first, apps own their projection inserts.
psql("""ALTER TABLE platform.spaces DISABLE TRIGGER space_provision;
INSERT INTO platform.spaces (id, property_code, display_name)
SELECT ('00000000-0000-0000-0000-'||lpad(to_hex(n),12,'0'))::uuid, 'FIXTURE-'||n, 'Fixture tenant '||n FROM generate_series(1, 1024) n;
ALTER TABLE platform.spaces ENABLE TRIGGER space_provision;""")
results = {}
for t in ['app3/verify.py', 'app4/verify.py', 'app4/extra.py', 'app5/verify.py']:
    src = (W / t).read_text().replace("'-d','kernel'", "'-d','mesh_base'")
    p = (W / t).with_name('meshbase_' + Path(t).name); p.write_text(src)
    r = subprocess.run(['python3', str(p)], text=True, capture_output=True, timeout=900)
    m = re.search(r'"passed":\s*(\d+)', r.stdout)
    results[t] = (r.returncode, m.group(1) if m else r.stderr[-300:])
print('suites', results)
assert all(v[0] == 0 for v in results.values())

S1 = str(uuid.UUID(int=1))
# Fixture tenant 1 gains its App 1 / App 2 projections through the kernel's own repair path.
psql(f"GRANT EXECUTE ON FUNCTION platform.reconcile_space(uuid) TO platform_owner;")
print('reconcile', K.q(f"SELECT platform.reconcile_space('{S1}');", 'mesh_base', role='platform_owner'))
# Two more properties created normally (trigger provisioning), one later suspended.
KV = K.new_space('mesh_base', 'KVARELI-LAKE', 'Kvareli Lake Resort (synthetic)')
SG = K.new_space('mesh_base', 'SIGHNAGHI-INN', 'Sighnaghi Inn (synthetic)')
Path(W / 'mesh' / 'spaces.json').write_text(json.dumps({'S1': S1, 'KV': KV, 'SG': SG}))

def app1_fixture(space, n_conv):
    """Guest + AI participants and conversations; one real change_control per conversation (real outbox row)."""
    ai = str(uuid.uuid4())
    sql = [f"BEGIN; SET LOCAL app.space_id='{space}';",
           f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{space}','{ai}','ai','Mia (AI)');"]
    convs = []
    for i in range(n_conv):
        g, c = str(uuid.uuid4()), str(uuid.uuid4()); convs.append(c)
        sql.append(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{space}','{g}','guest','Guest {i} (synthetic)');")
        sql.append(f"INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{space}','{c}','{g}');")
    sql.append('COMMIT;')
    psql('\n'.join(sql))
    for c in convs:
        K.q(f"SET LOCAL search_path = contact_center, pg_catalog; SELECT contact_center.change_control('{space}','{c}',0,'ESC_REQUESTED','{ai}',NULL,'Guest asked for a person',now()+interval '10 minutes');", 'mesh_base', space=space)
    return convs

def app2_fixture(space, n):
    approver = str(uuid.uuid4())
    psql(f"BEGIN; SET LOCAL app.space_id='{space}'; INSERT INTO guest_crm.retention_policies(space_id,approved_by) VALUES('{space}','{approver}') ON CONFLICT DO NOTHING; COMMIT;")
    ids = []
    for i in range(n):
        p = K.q(f"SET LOCAL search_path = guest_crm, pg_catalog; INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{space}','visitor',now()+interval '7 days') RETURNING id;", 'mesh_base', space=space)
        K.q(f"SET LOCAL search_path = guest_crm, pg_catalog; SELECT guest_crm.erase_profile('{space}','{p}','rtbf');", 'mesh_base', space=space)
        ids.append(p)
    return ids

fx = {'S1': {'convs': app1_fixture(S1, 3), 'erased': app2_fixture(S1, 2)},
      'KV': {'convs': app1_fixture(KV, 4), 'erased': app2_fixture(KV, 1)},
      'SG': {'convs': app1_fixture(SG, 2), 'erased': app2_fixture(SG, 1)}}
Path(W / 'mesh' / 'fixtures.json').write_text(json.dumps(fx, indent=1))
counts = psql("""SELECT 'cc',count(*) FROM contact_center.outbox_events UNION ALL SELECT 'crm',count(*) FROM guest_crm.crm_outbox
 UNION ALL SELECT 'ops',count(*) FROM ops.task_outbox UNION ALL SELECT 'kb',count(*) FROM kb.storage_outbox UNION ALL SELECT 'ai',count(*) FROM workforce.agent_outbox;""").stdout
print('outbox rows (superuser view):', counts.replace('\n', ' '))
```

## Appendix C — verification harness (`test_mesh.py`)

Parts: 1 = normalization adapters, 2 = R1 relay and heartbeats, 3 = head-of-line ordering and isolation, 4 = anti-storm limiter and dead-letter store.

<!-- artifact: test_mesh.py -->
```python
"""Sub-Component B micro-research harness. Each part runs on a fresh clone of `mesh_base` (locked apps + Sub-Component A
kernel + real App 1-5 outbox traffic) with mesh_experiment.sql installed. Checks record evidence; negative checks pass
when they demonstrate the hazard. Run from the repository root."""
import subprocess, json, re, uuid, hashlib, sys, time, os, threading
from pathlib import Path

W = Path(__file__).resolve().parent.parent
SOCK, PORT = str(W / 'socket'), '55466'
MSQL = (W / 'mesh' / 'mesh_experiment.sql').read_text()
SP = json.loads((W / 'mesh' / 'spaces.json').read_text()); FX = json.loads((W / 'mesh' / 'fixtures.json').read_text())
S1, KV, SG = SP['S1'], SP['KV'], SP['SG']
RESULTS, EVIDENCE = [], {}
SOURCES = ['cc', 'crm', 'ops', 'kb', 'ai']

def psql(sql, db, user=None, extra=(), check=True):
    cmd = ['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-F', '|'] + (['-U', user] if user else []) + list(extra)
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if check and r.returncode: raise RuntimeError(f'{db}: {r.stderr}\n--- SQL ---\n{sql[:1200]}')
    return r

def val(sql, db): return psql(sql, db).stdout.strip()

def q(sql, db, role=None, space=None, fail=False, iso=None):
    pre = ['BEGIN' + (f' ISOLATION LEVEL {iso}' if iso else '') + ';']
    if space: pre.append(f"SET LOCAL app.space_id = '{space}';")
    if role: pre.append(f'SET LOCAL ROLE {role};')
    r = psql('\n'.join(pre) + '\n' + sql + '\nCOMMIT;', db, check=False)
    if fail:
        assert r.returncode != 0, f'expected failure: {sql[:200]}'
        return next((l for l in r.stderr.splitlines() if 'ERROR' in l), r.stderr.strip())
    if r.returncode: raise RuntimeError(r.stderr + '\n' + sql[:1200])
    return r.stdout.strip()

def ok(name, cond, evidence=None):
    RESULTS.append({'check': name, 'passed': bool(cond), 'evidence': evidence})
    print(('PASS ' if cond else 'FAIL ') + name + (f'  :: {str(evidence)[:260]}' if evidence is not None else ''), flush=True)

def fresh(db):
    psql(f'DROP DATABASE IF EXISTS {db};', 'postgres')
    psql(f'CREATE DATABASE {db} TEMPLATE mesh_base;', 'postgres')
    psql(MSQL, db)
    psql("""DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mesh_relay_login') THEN
      CREATE ROLE mesh_relay_login LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$; GRANT platform_relay TO mesh_relay_login;""", db)
    psql(TEST_DOUBLES, db)

TEST_DOUBLES = r"""
CREATE SCHEMA mesh_test;
CREATE TABLE mesh_test.config (k text PRIMARY KEY, v text NOT NULL);
CREATE TABLE mesh_test.faults (event_id uuid PRIMARY KEY, mode text NOT NULL CHECK (mode IN ('FAIL','SLOW')), sleep_ms integer NOT NULL DEFAULT 0);
CREATE TABLE mesh_test.publish_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source text, space_id uuid, aggregate_id uuid, seq bigint,
 event_id uuid, event_type text, worker text, started_at timestamptz, finished_at timestamptz);
-- Test-double consumers (owned by the bootstrap superuser; they stand in for real consumer functions).
CREATE FUNCTION mesh_test.sink(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE f mesh_test.faults; t0 timestamptz := clock_timestamp(); BEGIN
 SELECT * INTO f FROM mesh_test.faults WHERE event_id = (p_row->>'event_id')::uuid;
 IF f.mode = 'FAIL' THEN RAISE EXCEPTION 'consumer rejected event % (injected fault)', p_row->>'event_id'; END IF;
 PERFORM pg_sleep(CASE WHEN f.mode = 'SLOW' THEN f.sleep_ms / 1000.0 ELSE random() * 0.012 END);
 INSERT INTO mesh_test.publish_log (source, space_id, aggregate_id, seq, event_id, event_type, worker, started_at, finished_at)
 VALUES (p_row->>'source', (p_row->>'space_id')::uuid, (p_row->>'aggregate_id')::uuid, (p_row->>'seq')::bigint, (p_row->>'event_id')::uuid,
         p_row->>'event_type', current_setting('app.mesh_worker', true), t0, clock_timestamp());
END $$;
-- Deliberately buggy write-back pair: App 1 request -> Operations queues a task event -> App 1 re-detects a request ...
CREATE FUNCTION mesh_test.ops_writeback(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 INSERT INTO ops.task_outbox (space_id, task_id, event_type, payload)
 VALUES ((p_row->>'space_id')::uuid, (SELECT v::uuid FROM mesh_test.config WHERE k = 'loop_task'), 'TaskQueuedEvent',
         jsonb_build_object('note', 'write-back from ' || (p_row->>'event_id')));
END $$;
-- App 1's outbox trigger (allocate_event) uses unqualified names, so any producer must put contact_center on its path.
CREATE FUNCTION mesh_test.cc_writeback(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = contact_center, pg_catalog, pg_temp AS $$
DECLARE parent_corr uuid; BEGIN
 SELECT correlation_id INTO parent_corr FROM mesh.lineage WHERE event_id = (p_row->>'event_id')::uuid;
 INSERT INTO contact_center.outbox_events (space_id, conversation_id, event_seq, event_type, dedupe_key, correlation_id, causation_id, payload)
 VALUES ((p_row->>'space_id')::uuid, (SELECT v::uuid FROM mesh_test.config WHERE k = 'loop_conversation'), 0, 'GuestRequestDetectedEvent',
         'loop:' || (p_row->>'event_id'), parent_corr, (p_row->>'event_id')::uuid, jsonb_build_object('note', 'write-back'));
END $$;
GRANT USAGE ON SCHEMA mesh_test TO mesh_owner;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA mesh_test TO mesh_owner;
"""

def relay(db, worker='w1', sources=SOURCES, batch=10, lease='30 seconds', cycles=50, idle=1, bind=True, max_attempts=3,
          naive=False, max_depth=8, drain=50, spaces=None, background=False):
    sp = 'NULL' if spaces is None else "ARRAY[" + ','.join(f"'{s}'" for s in spaces) + "]::uuid[]"
    call = (f"CALL mesh.r1_run('{worker}', ARRAY[{','.join(repr(s) for s in sources)}], {batch}, '{lease}', {cycles}, {idle}, "
            f"{'true' if bind else 'false'}, {max_attempts}, {'true' if naive else 'false'}, {max_depth}, {drain}, {sp});")
    cmd = ['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-U', 'mesh_relay_login', '-v', 'ON_ERROR_STOP=1', '-Atq',
           '-c', 'SET ROLE platform_relay', '-c', call, '-c', "SELECT current_user, current_setting('app.space_id', true), current_setting('default_transaction_isolation');"]
    if background: return subprocess.Popen(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    r = subprocess.run(cmd, text=True, capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr)
    return r.stdout.strip()

def unpublished(db):
    return int(val("""SELECT (SELECT count(*) FROM contact_center.outbox_events WHERE published_at IS NULL)+(SELECT count(*) FROM guest_crm.crm_outbox WHERE published_at IS NULL)
      +(SELECT count(*) FROM ops.task_outbox WHERE published_at IS NULL)+(SELECT count(*) FROM kb.storage_outbox WHERE published_at IS NULL)
      +(SELECT count(*) FROM workforce.agent_outbox WHERE published_at IS NULL);""", db))

def unpublished_src(db, srcs):
    parts = {'cc': 'contact_center.outbox_events', 'crm': 'guest_crm.crm_outbox', 'ops': 'ops.task_outbox', 'kb': 'kb.storage_outbox', 'ai': 'workforce.agent_outbox'}
    return int(val('SELECT ' + '+'.join(f'(SELECT count(*) FROM {parts[x]} WHERE published_at IS NULL)' for x in srcs) + ';', db))

def health(db, window='5 minutes'):
    rows = psql(f"SELECT coalesce(space_id::text,''), property_code, source, coalesce(backlog,-1), coalesce(dead_letters_open,-1), status FROM mesh.relay_health('{window}');", db).stdout.splitlines()
    return [dict(zip(['space', 'code', 'source', 'backlog', 'dlq', 'status'], r.split('|'))) for r in rows]

OUTBOXES = ['contact_center.outbox_events', 'guest_crm.crm_outbox', 'ops.task_outbox', 'kb.storage_outbox', 'workforce.agent_outbox']
def structure_fingerprint(db):
    sql = " UNION ALL ".join(f"""SELECT '{t}', md5(
      coalesce((SELECT string_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),',' ORDER BY attnum)
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE attrelid='{t}'::regclass AND attnum>0 AND NOT attisdropped),'')||
      coalesce((SELECT string_agg(conname||pg_get_constraintdef(oid),',' ORDER BY conname) FROM pg_constraint WHERE conrelid='{t}'::regclass),'')||
      coalesce((SELECT string_agg(pg_get_indexdef(indexrelid),',' ORDER BY 1) FROM pg_index WHERE indrelid='{t}'::regclass),'')||
      coalesce((SELECT string_agg(tgname||pg_get_triggerdef(oid),',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid='{t}'::regclass AND NOT tgisinternal),'')||
      coalesce((SELECT string_agg(polname||pg_get_expr(polqual,polrelid),',' ORDER BY polname) FROM pg_policy WHERE polrelid='{t}'::regclass),'')||
      (SELECT relrowsecurity::text||relforcerowsecurity::text FROM pg_class WHERE oid='{t}'::regclass)), (SELECT relacl::text FROM pg_class WHERE oid='{t}'::regclass)""" for t in OUTBOXES)
    return {r.split('|')[0]: r.split('|')[1:] for r in psql(sql + ';', db).stdout.splitlines()}

def contracts():
    from referencing import Registry, Resource
    from jsonschema import Draft202012Validator, FormatChecker
    reg = Registry(); schemas = {}
    for p in (W / 'app5' / 'contracts').glob('*.json'):
        obj = json.loads(p.read_text())
        if isinstance(obj, dict) and '$id' in obj and '$schema' in obj:
            reg = reg.with_resource(obj['$id'], Resource.from_contents(obj)); schemas[obj['$id']] = obj
    def validator(sid): return Draft202012Validator(schemas[sid], registry=reg, format_checker=FormatChecker())
    return validator

# =====================================================================================
# PART 1 - normalization adapters over the five heterogeneous locked outboxes
# =====================================================================================
def part1():
    db = 'm1'
    psql('DROP DATABASE IF EXISTS m1pre;', 'postgres'); psql('CREATE DATABASE m1pre TEMPLATE mesh_base;', 'postgres')
    before = structure_fingerprint('m1pre')
    fresh(db); after = structure_fingerprint(db)
    same_struct = all(before[t][0] == after[t][0] for t in OUTBOXES)
    acl_changed = sorted(t for t in OUTBOXES if before[t][1] != after[t][1])
    def grants(db):
        return set(psql("SELECT c.oid::regclass::text||'|'||coalesce(g.rolname,'PUBLIC')||'|'||a.privilege_type||'|'||coalesce((SELECT string_agg(attname,',' ORDER BY attname) FROM pg_attribute x WHERE x.attrelid=c.oid AND x.attnum>0 AND has_column_privilege(g.oid, c.oid, x.attnum, a.privilege_type) AND NOT has_table_privilege(g.oid, c.oid, a.privilege_type)),'') FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a LEFT JOIN pg_roles g ON g.oid=a.grantee WHERE c.oid = ANY(ARRAY['" + "','".join(OUTBOXES) + "']::regclass[]);", db).stdout.splitlines())
    col_grants = lambda db: set(psql("SELECT table_schema||'.'||table_name||'|'||grantee||'|'||privilege_type||'|'||column_name FROM information_schema.column_privileges WHERE (table_schema, table_name) IN (('contact_center','outbox_events'),('guest_crm','crm_outbox'),('ops','task_outbox'),('kb','storage_outbox'),('workforce','agent_outbox'));", db).stdout.splitlines())
    gb, ga = grants('m1pre') | col_grants('m1pre'), grants(db) | col_grants(db)
    new_grantees = sorted({x.split('|')[1] for x in ga - gb}); lost = sorted(gb - ga)
    locked_transport_same = {x for x in gb if x.split('|')[1] in ('kb_transport', 'ai_transport')} == {x for x in ga if x.split('|')[1] in ('kb_transport', 'ai_transport')}
    EVIDENCE['outbox_structure'] = {t: {'structure_md5': after[t][0], 'acl_before': before[t][1], 'acl_after': after[t][1]} for t in OUTBOXES}
    ok('1.01 installing the mesh leaves all five locked outbox tables structurally identical (columns, defaults, constraints, indexes, triggers, RLS)', same_struct)
    ok('1.02 only privileges are added: no grant removed; locked kb_transport/ai_transport privileges unchanged and sufficient; new grantees are only the three new transport roles and mesh_owner',
       not lost and locked_transport_same and new_grantees == ['cc_transport', 'crm_transport', 'mesh_owner', 'ops_transport'], {'tables_with_acl_change': acl_changed, 'new_grantees': new_grantees, 'removed': lost})

    # normalized view == ground truth, per space and source, payload bytes unchanged
    truth = {}; normal = {}; mism = []
    spaces = [r for r in val("SELECT DISTINCT space_id FROM contact_center.outbox_events UNION SELECT DISTINCT space_id FROM guest_crm.crm_outbox UNION SELECT DISTINCT space_id FROM ops.task_outbox UNION SELECT DISTINCT space_id FROM kb.storage_outbox UNION SELECT DISTINCT space_id FROM workforce.agent_outbox;", db).split()]
    idcol = {'cc': 'id', 'crm': 'id', 'ops': 'event_id', 'kb': 'event_id', 'ai': 'event_id'}
    for s in spaces:
        for src, t in zip(SOURCES, OUTBOXES):
            role = val(f"SELECT transport_role FROM mesh.sources WHERE source='{src}';", db)
            n = q(f"SELECT coalesce(string_agg(event_id||':'||md5(payload::text)||':'||coalesce(seq::text,'-')||':'||coalesce(aggregate_id::text,'-'), ',' ORDER BY event_id), '') FROM mesh.pending('{src}');", db, role=role, space=s)
            g = val(f"SELECT coalesce(string_agg({idcol[src]}||':'||md5(payload::text), ',' ORDER BY {idcol[src]}), '') FROM {t} WHERE space_id='{s}' AND published_at IS NULL;", db)
            nn = [x.rsplit(':', 2)[0] for x in n.split(',') if x]; gg = [x for x in g.split(',') if x]
            truth[(s, src)] = len(gg); normal[(s, src)] = len(nn)
            if nn != gg: mism.append((s, src))
    EVIDENCE['normalized_counts'] = {f'{s[:8]}/{src}': normal[(s, src)] for (s, src) in normal if normal[(s, src)]}
    ok('1.03 normalized pending rows equal ground truth for every property x source, with byte-identical payloads', not mism and sum(normal.values()) == 46, {'total': sum(normal.values()), 'mismatches': mism})

    semantics = psql("SELECT source, aggregate_kind, ordering, lease_strategy, lineage_mode FROM mesh.sources ORDER BY source;", db).stdout.splitlines()
    EVIDENCE['source_catalog'] = semantics
    gaps = val(f"SELECT string_agg(DISTINCT session_id||':'||state_version, ',') FROM workforce.agent_outbox WHERE space_id='{S1}';", db)
    vers = sorted(int(x.split(':')[1]) for x in gaps.split(','))
    ok('1.04 App 5 state_version is not gap-free per session (head-of-line must mean "no earlier unpublished", never "seq = last+1")',
       any(b - a > 1 for a, b in zip(vers, vers[1:])), vers)

    # contract-valid envelopes from real locked-function traffic
    V = contracts(); bad = []
    for src, sid, where in [('cc', 'https://schemas.smartstay.example/contact-center/outbox-event/1', "event_type='ConversationControlChangedEvent'"),
                            ('ops', 'https://schemas.smartstay.example/contact-center/task-status/1', "event_type='TaskStatusChangedEvent'"),
                            ('kb', 'https://schemas.smartstay.example/knowledge/policy-event/1', 'true'),
                            ('ai', 'https://schemas.smartstay.example/ai-team/handoff-event/1', "event_type='AgentHandoffEvent'")]:
        role = val(f"SELECT transport_role FROM mesh.sources WHERE source='{src}';", db)
        envs = []
        for s in spaces:
            out = q(f"SELECT mesh.envelope(p) FROM mesh.pending('{src}') p WHERE {where};", db, role=role, space=s)
            envs += [json.loads(x) for x in out.splitlines() if x]
        v = V(sid); errs = [e.message for env in envs for e in v.iter_errors(env)]
        EVIDENCE[f'envelopes_{src}'] = {'schema': sid, 'validated': len(envs), 'errors': errs[:3]}
        if errs or not envs: bad.append((src, len(envs), errs[:2]))
    ok('1.05 adapter envelopes validate against the locked contracts: App1 outbox-event/1, App3->App1 task-status/1, App4 policy-event/1, App5 handoff-event/1',
       not bad, {k: EVIDENCE[k]['validated'] for k in EVIDENCE if k.startswith('envelopes_')} if not bad else bad)
    crm = q("SELECT mesh.envelope(p) FROM mesh.pending('crm') p;", db, role='crm_transport', space=S1).splitlines()
    ok('1.06 App 2 envelope follows its documented mapping (id->event_id, created_at->occurred_at, payload->data); no $id schema exists to validate',
       crm and all(set(json.loads(x)) == {'event_id', 'type', 'space_id', 'occurred_at', 'causation_id', 'schema_version', 'data'} for x in crm), len(crm))

    e = q("SELECT count(*) FROM kb.storage_outbox;", db, role='platform_relay', fail=True)
    ok('1.07 the relay role inherits nothing (PG16 GRANT ... WITH INHERIT FALSE): it must SET ROLE to one transport role per source', 'permission denied' in e, e)
    attrs = val("SELECT string_agg(rolname||':'||rolsuper||rolbypassrls, ',' ORDER BY rolname) FROM pg_roles WHERE rolname IN ('platform_relay','mesh_owner','cc_transport','crm_transport','ops_transport','kb_transport','ai_transport');", db)
    ok('1.08 no mesh role is superuser or BYPASSRLS', 'true' not in attrs, attrs)

    # App 2 sidecar lease: concurrent claimers never share an event; EvalPlanQual sees the sidecar update
    q("SELECT 1;", db)
    def hold():
        return psql(f"BEGIN; SET LOCAL app.space_id='{S1}'; SET LOCAL ROLE crm_transport; SELECT event_id FROM mesh.claim('crm', 1, '30 seconds'); SELECT pg_sleep(1.5); COMMIT;", db).stdout.split()[0]
    res = {}
    t = threading.Thread(target=lambda: res.setdefault('a', hold())); t.start(); time.sleep(0.5)
    res['b'] = q("SELECT event_id FROM mesh.claim('crm', 5, '30 seconds');", db, role='crm_transport', space=S1).split()
    t.join()
    res['c'] = q("SELECT event_id FROM mesh.claim('crm', 5, '30 seconds');", db, role='crm_transport', space=S1).split()
    ok('1.09 App 2 sidecar leases: a concurrent claimer skips the locked event, and after commit nobody re-claims a live lease',
       res['a'] not in res['b'] and res['a'] not in res['c'] and len(set(res['b']) & set(res['c'])) == 0, res)

    # fencing: App 1 attempt fence (no token column) and App 3 token fence
    for src, space, role in [('cc', KV, 'cc_transport'), ('ops', S1, 'ops_transport')]:
        a = q(f"SELECT event_id||'|'||fence FROM mesh.claim('{src}', 1, '1 second');", db, role=role, space=space).split('|')
        time.sleep(1.3)
        b = q(f"SELECT event_id||'|'||fence FROM mesh.claim('{src}', 1, '30 seconds');", db, role=role, space=space).split('|')
        stale = q(f"SELECT mesh.ack('{src}', '{a[0]}', '{a[1]}');", db, role=role, space=space)
        cur = q(f"SELECT mesh.ack('{src}', '{b[0]}', '{b[1]}');", db, role=role, space=space)
        ok(f"1.{10 if src == 'cc' else 11} {src}: after lease expiry the event is re-claimed with a new fence; the stale holder's ack is rejected, the current one succeeds",
           a[0] == b[0] and a[1] != b[1] and stale == 'f' and cur == 't', {'fence_old': a[1][:8], 'fence_new': b[1][:8], 'stale_ack': stale, 'current_ack': cur})

    # App 4 supersession pair claimed as one group
    grp = q("SELECT group_key||'|'||count(*) FROM mesh.pending('kb') GROUP BY group_key HAVING count(*) > 1;", db, role='kb_transport', space=S1)
    rows = []
    for _ in range(12):
        got = q("SELECT group_key||'|'||event_type||'|'||event_id||'|'||fence FROM mesh.claim('kb', 1, '30 seconds');", db, role='kb_transport', space=S1).splitlines()
        if not got: break
        rows.append([g.rsplit('|', 2)[0] for g in got])
        for g in got:                                   # a relay acknowledges each group before claiming further
            _, _, ev, fe = g.split('|'); q(f"SELECT mesh.ack('kb', '{ev}', '{fe}');", db, role='kb_transport', space=S1)
    pair = [g for g in rows if len(g) > 1]
    ok('1.12 App 4 supersession: both events of one knowledge_epoch are claimed together in one lease (never split across workers)',
       grp and len(pair) == 1 and len({x.split('|')[0] for x in pair[0]}) == 1 and {x.split('|')[1] for x in pair[0]} == {'PolicySupersededEvent', 'PolicyApprovedEvent'}, pair)

# =====================================================================================
# PART 2 - R1 relay, heartbeats and the zero-row hazard
# =====================================================================================
def part2():
    db = 'm2'; fresh(db)
    total = unpublished(db)
    out = relay(db, worker='contextless', bind=False, cycles=1, idle=1)
    after = unpublished(db)
    hb = val("SELECT count(*)||'|'||count(*) FILTER (WHERE context_bound)||'|'||coalesce(sum(pending_visible),0)||'|'||coalesce(sum(claimed),0) FROM mesh.heartbeats;", db).split('|')
    ok('2.01 NEGATIVE: a relay iterating properties without tenant context sees 0 rows and publishes nothing while real backlog exists',
       total == 46 and after == 46 and hb[1] == '0' and hb[2] == '0' and hb[3] == '0', {'backlog': total, 'after': after, 'heartbeats': hb[0], 'context_bound': hb[1]})
    h = health(db)
    ctxless = [r for r in h if r['status'] == 'CONTEXTLESS_RELAY']; unscanned = [r for r in h if r['status'] == 'UNSCANNED_BACKLOG']
    truth = int(val("""SELECT count(*) FROM (SELECT DISTINCT space_id,'cc' FROM contact_center.outbox_events UNION SELECT DISTINCT space_id,'crm' FROM guest_crm.crm_outbox
      UNION SELECT DISTINCT space_id,'ops' FROM ops.task_outbox UNION SELECT DISTINCT space_id,'kb' FROM kb.storage_outbox UNION SELECT DISTINCT space_id,'ai' FROM workforce.agent_outbox) x;""", db))
    EVIDENCE['health_after_contextless'] = {'contextless': ctxless, 'unscanned': unscanned}
    ok('2.02 the heartbeat monitor flags it immediately: CONTEXTLESS_RELAY for the worker on every source, and UNSCANNED_BACKLOG for exactly each property x source holding work',
       len(ctxless) == 5 and len(unscanned) == truth and sum(int(r['backlog']) for r in unscanned) == 46, {'contextless_rows': len(ctxless), 'unscanned': len(unscanned), 'expected': truth})
    ok('2.03 the relay session leaves no tenant context, role switch or isolation override behind', out.splitlines()[-1] == 'platform_relay||read committed', out)

    n_spaces = int(val("SELECT count(*) FROM platform.spaces WHERE lifecycle <> 'OFFBOARDED';", db))
    psql("TRUNCATE mesh.heartbeats;", db)
    t0 = time.time(); relay(db, worker='r1', cycles=3, idle=1); dt = time.time() - t0
    hbs = val(f"SELECT count(DISTINCT (space_id, source))||'|'||bool_and(context_bound)||'|'||count(*) FROM mesh.heartbeats;", db).split('|')
    h = health(db); bad = [r for r in h if r['status'] not in ('OK',)]
    ok('2.04 the correct R1 relay publishes all 46 real events and leaves zero backlog', unpublished(db) == 0, f'{dt:.1f}s')
    ok('2.05 R1 heartbeats cover every non-offboarded property x source, all context-bound', int(hbs[0]) == n_spaces * 5 and hbs[1] == 'true', {'pairs': hbs[0], 'expected': n_spaces * 5, 'heartbeats': hbs[2], 'seconds': round(dt, 1)})
    ok('2.06 after a correct run every property x source reports OK', not bad, bad[:3])
    EVIDENCE['r1_scale'] = {'properties': n_spaces, 'sources': 5, 'heartbeats': int(hbs[2]), 'seconds': round(dt, 2)}

    # statically configured relay misses properties
    db = 'm2b'; fresh(db)
    relay(db, worker='static', spaces=[S1], cycles=2, idle=1)
    h = health(db); miss = sorted({r['code'] for r in h if r['status'] == 'UNSCANNED_BACKLOG'})
    ok('2.07 a relay with a static property list leaves other tenants unscanned; the monitor names each one', miss == ['KVARELI-LAKE', 'SIGHNAGHI-INN'], miss)

    # monitor rule for a relay that reports a property but saw nothing (synthetic heartbeat input)
    psql(f"INSERT INTO mesh.heartbeats (run_id, worker, source, space_id, context_bound, pending_visible, claimed) VALUES (gen_random_uuid(), 'external', 'cc', '{KV}', true, 0, 0);", db)
    blind = [r for r in health(db) if r['code'] == 'KVARELI-LAKE' and r['source'] == 'cc']
    ok('2.08 BLIND_SCAN: a heartbeat that saw 0 pending while older work existed is flagged (synthetic heartbeat input to the monitor rule)', blind and blind[0]['status'] == 'BLIND_SCAN', blind)

    # lifecycle: suspended still relays (erasure must flow), offboarded backlog is surfaced not dropped
    q(f"UPDATE platform.spaces SET lifecycle='SUSPENDED' WHERE id='{SG}';", db, role='platform_owner')
    q(f"UPDATE platform.spaces SET lifecycle='SUSPENDED' WHERE id='{KV}'; UPDATE platform.spaces SET lifecycle='OFFBOARDED' WHERE id='{KV}';", db, role='platform_owner')
    relay(db, worker='r1', cycles=2, idle=1)
    sg_left = int(val(f"SELECT count(*) FROM guest_crm.crm_outbox WHERE space_id='{SG}' AND published_at IS NULL;", db))
    kv_left = int(val(f"SELECT (SELECT count(*) FROM contact_center.outbox_events WHERE space_id='{KV}' AND published_at IS NULL)+(SELECT count(*) FROM guest_crm.crm_outbox WHERE space_id='{KV}' AND published_at IS NULL);", db))
    off = [r for r in health(db) if r['code'] == 'KVARELI-LAKE']
    ok('2.09 a SUSPENDED property is still relayed (its ProfileErasureRequestedEvent is published)', sg_left == 0)
    ok('2.10 an OFFBOARDED property is not relayed, and its stranded backlog is surfaced as OFFBOARDED_BACKLOG rather than silently dropped',
       kv_left == 5 and {r['status'] for r in off} == {'OFFBOARDED_BACKLOG'}, {'stranded': kv_left, 'rows': [(r['source'], r['backlog'], r['status']) for r in off]})

    # two relays in parallel: every event delivered exactly once
    db = 'm2c'; fresh(db)
    psql(f"""INSERT INTO mesh.routes SELECT source, event_type, 'sink', 'mesh_test.sink(jsonb,jsonb)'::regprocedure FROM
      (SELECT DISTINCT 'cc' source, event_type FROM contact_center.outbox_events UNION SELECT DISTINCT 'crm', event_type FROM guest_crm.crm_outbox
       UNION SELECT DISTINCT 'ops', event_type FROM ops.task_outbox UNION SELECT DISTINCT 'kb', event_type FROM kb.storage_outbox
       UNION SELECT DISTINCT 'ai', event_type FROM workforce.agent_outbox) x;""", db)
    ps = [relay(db, worker=f'p{i}', cycles=6, idle=2, background=True) for i in range(3)]
    for p in ps: p.wait()
    d = val("SELECT count(*)||'|'||count(DISTINCT event_id) FROM mesh_test.publish_log;", db).split('|')
    ok('2.11 three concurrent R1 relays over the same backlog: every real event delivered exactly once (SKIP LOCKED + fenced ack + delivery inbox)',
       d == ['46', '46'] and unpublished(db) == 0, d)

# =====================================================================================
# PART 3 - head-of-line ordering under concurrency, poison isolation, slow events, crash redelivery
# =====================================================================================
N_CONV, N_EV = 24, 20
def seed_ordering(db):
    sql = [f"BEGIN; SET LOCAL app.space_id='{KV}'; SET LOCAL search_path = contact_center, pg_catalog;   -- App 1 allocate_event() resolves 'conversations' via search_path"]
    convs = []
    for i in range(N_CONV):
        g, c = str(uuid.uuid4()), str(uuid.uuid4()); convs.append(c)
        sql.append(f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{KV}','{g}','guest','Order guest {i}');")
        sql.append(f"INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{KV}','{c}','{g}');")
    for n in range(N_EV):                       # interleaved creation so naive claiming mixes aggregates
        for c in convs:
            sql.append(f"INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{KV}','{c}',0,'MessageRecordedEvent','ord:{c}:{n}',gen_random_uuid(),'{{\"n\":{n}}}');")
    sql.append('COMMIT;')
    tasks = val(f"SELECT string_agg(t.task_id||':'||coalesce((SELECT max(task_seq) FROM ops.task_outbox o WHERE o.task_id=t.task_id),0), ',') FROM ops.operational_tasks t WHERE space_id='{S1}';", db).split(',')
    sql.append(f"BEGIN; SET LOCAL app.space_id='{S1}';")
    for n in range(1, N_EV + 1):
        for t in tasks:
            tid, mx = t.split(':')
            sql.append(f"INSERT INTO ops.task_outbox(space_id,task_id,event_type,task_seq,payload) VALUES('{S1}','{tid}','TaskStatusChangedEvent',{int(mx) + n},'{{\"probe\":{n}}}');")
    sql.append('COMMIT;')
    sql.append("""INSERT INTO mesh.routes VALUES ('cc','MessageRecordedEvent','sink','mesh_test.sink(jsonb,jsonb)'::regprocedure),
                                              ('ops','TaskStatusChangedEvent','sink','mesh_test.sink(jsonb,jsonb)'::regprocedure);""")
    psql('\n'.join(sql), db)
    return convs, [t.split(':')[0] for t in tasks]

def inversions(db):
    """Per aggregate, publication order (log id) must follow sequence order; also no overlapping in-flight deliveries."""
    rows = psql("SELECT source, aggregate_id, seq, id, started_at, finished_at FROM mesh_test.publish_log WHERE seq IS NOT NULL ORDER BY source, aggregate_id, id;", db).stdout.splitlines()
    inv, overlap, last = 0, 0, {}
    for r in rows:
        src, agg, seq, _id, st, fin = r.split('|'); key = (src, agg); seq = int(seq)
        if key in last:
            pseq, pfin = last[key]
            if seq < pseq: inv += 1
            if st < pfin: overlap += 1
        last[key] = (seq, fin)
    return inv, overlap, len(rows)

def run_workers(db, n, **kw):
    ps = [relay(db, worker=f'w{i}', background=True, **kw) for i in range(n)]
    outs = [p.communicate() for p in ps]
    for p, (o, e) in zip(ps, outs):
        if p.returncode: raise RuntimeError(e)

def part3():
    db = 'm3a'; fresh(db); seed_ordering(db)
    run_workers(db, 6, sources=['cc', 'ops'], naive=True, batch=4, cycles=40, idle=2)
    inv, ov, n = inversions(db)
    EVIDENCE['naive'] = {'deliveries': n, 'inversions': inv, 'overlaps': ov}
    ok('3.01 NEGATIVE CONTROL: naive SKIP LOCKED claiming with 6 workers publishes events out of sequence within aggregates', inv > 0, EVIDENCE['naive'])

    db = 'm3b'; fresh(db); convs, tasks = seed_ordering(db)
    poison = val(f"SELECT id FROM contact_center.outbox_events WHERE conversation_id='{convs[6]}' AND event_seq=5;", db)
    slow = val(f"SELECT id FROM contact_center.outbox_events WHERE conversation_id='{convs[2]}' AND event_seq=2;", db)
    psql(f"INSERT INTO mesh_test.faults VALUES ('{poison}','FAIL',0), ('{slow}','SLOW',2500);", db)
    t0 = time.time(); run_workers(db, 6, sources=['cc', 'ops'], batch=4, cycles=80, idle=3); dt = time.time() - t0
    inv, ov, n = inversions(db)
    EVIDENCE['hol'] = {'deliveries': n, 'inversions': inv, 'overlaps': ov, 'seconds': round(dt, 1)}
    expected = int(val("SELECT (SELECT count(*) FROM contact_center.outbox_events WHERE event_type='MessageRecordedEvent')+(SELECT count(*) FROM ops.task_outbox WHERE event_type='TaskStatusChangedEvent');", db)) - 16
    ok('3.02 head-of-line claiming with 6 concurrent workers: zero sequence inversions and zero overlapping in-flight deliveries per aggregate',
       inv == 0 and ov == 0, EVIDENCE['hol'])
    ok('3.03 every non-poisoned conversation and every task streamed completely; the poisoned conversation stopped exactly before its bad event',
       n == expected and val(f"SELECT max(seq) FROM mesh_test.publish_log WHERE aggregate_id='{convs[6]}';", db) == '4', {'delivered': n, 'expected': expected})
    dl = psql(f"SELECT reason_code, attempts, last_error, payload_sha256, seq, jsonb_array_length(causal_chain), state FROM mesh.dead_letters WHERE event_id='{poison}';", db).stdout.strip().split('|')
    real_sha = val(f"SELECT encode(sha256(convert_to(payload::text,'UTF8')),'hex') FROM contact_center.outbox_events WHERE id='{poison}';", db)
    EVIDENCE['poison_dead_letter'] = dl
    ok('3.04 the poison event is dead-lettered after its retry budget (3) with error, sequence, causal chain and payload hash - payload itself not copied',
       dl[0] == 'RETRY_BUDGET_EXHAUSTED' and dl[1] == '3' and 'injected fault' in dl[2] and dl[3] == real_sha and dl[4] == '5' and dl[6] == 'OPEN', dl[:3])
    blocked = int(val(f"SELECT count(*) FROM contact_center.outbox_events WHERE conversation_id='{convs[6]}' AND published_at IS NULL;", db))
    ok('3.05 the dead letter keeps its own aggregate blocked (gap preserved): 16 later events of that conversation wait; nothing else waits',
       blocked == 16 and unpublished_src(db, ['cc', 'ops']) == 16, blocked)
    sl = psql(f"SELECT started_at, finished_at FROM mesh_test.publish_log WHERE event_id='{slow}';", db).stdout.strip().split('|')
    during = int(val(f"SELECT count(*) FROM mesh_test.publish_log WHERE started_at > '{sl[0]}' AND finished_at < '{sl[1]}' AND aggregate_id <> '{convs[2]}';", db))
    after_slow = int(val(f"SELECT count(*) FROM mesh_test.publish_log WHERE aggregate_id='{convs[2]}' AND seq > 2 AND started_at < '{sl[1]}';", db))
    ok('3.06 a 2.5 s slow delivery delays only its own conversation: other aggregates kept publishing during it, its own later events waited',
       during > 20 and after_slow == 0, {'other_deliveries_during_slow_event': during, 'own_later_events_before_it_finished': after_slow})

    psql(f"DELETE FROM mesh_test.faults WHERE event_id='{poison}';", db)
    q(f"SELECT mesh.replay_dead_letter('cc', '{poison}', 'ops-reviewer');", db, role='mesh_owner', space=KV)
    relay(db, worker='replay', sources=['cc'], cycles=5, idle=1)
    seqs = val(f"SELECT string_agg(seq::text, ',' ORDER BY id) FROM mesh_test.publish_log WHERE aggregate_id='{convs[6]}';", db)
    st = val(f"SELECT state||'|'||replay_base FROM mesh.dead_letters WHERE event_id='{poison}';", db)
    same_id = val(f"SELECT count(*) FROM mesh_test.publish_log WHERE event_id='{poison}';", db)
    ok('3.07 reviewed replay: the original event id is redelivered and the conversation completes strictly in order 1..20',
       seqs == ','.join(str(i) for i in range(1, 21)) and st.startswith('REPLAYED') and same_id == '1' and unpublished_src(db, ['cc', 'ops']) == 0, {'order': seqs, 'dead_letter': st})

    # crash windows: (a) claimed then worker died; (b) delivered+committed then died before ack
    db = 'm3c'; fresh(db); convs, _ = seed_ordering(db)
    psql(f"UPDATE contact_center.outbox_events SET published_at = clock_timestamp() WHERE space_id='{KV}' AND event_type <> 'MessageRecordedEvent';", db)  # unrelated, unrouted traffic out of the way
    a = q("SELECT event_id||'|'||fence FROM mesh.claim('cc', 1, '1 second');", db, role='cc_transport', space=KV).split('|')
    b = q("SELECT event_id||'|'||fence FROM mesh.claim('cc', 1, '1 second');", db, role='cc_transport', space=KV).split('|')
    q(f"SELECT mesh.deliver('cc', '{b[0]}', 'crashed');", db, role='platform_relay', space=KV, iso='REPEATABLE READ')
    time.sleep(1.3)
    run_workers(db, 3, sources=['cc'], batch=4, cycles=60, idle=2)
    once = val(f"SELECT string_agg((SELECT count(*) FROM mesh_test.publish_log WHERE event_id=x)::text, ',') FROM unnest(ARRAY['{a[0]}','{b[0]}']::uuid[]) x;", db)
    att = val(f"SELECT string_agg(attempts::text, ',' ORDER BY x) FROM (SELECT id x, attempts FROM contact_center.outbox_events WHERE id IN ('{a[0]}','{b[0]}')) s;", db)
    inv, ov, n = inversions(db)
    ok('3.08 crash after claim and crash after delivery-before-ack: both events re-claimed after lease expiry, each applied exactly once, order intact',
       once == '1,1' and inv == 0 and n == N_CONV * N_EV and all(int(x) >= 2 for x in att.split(',')), {'applied': once, 'attempts': att, 'inversions': inv})

# =====================================================================================
# PART 4 - anti-storm causal depth limiter and dead-letter store
# =====================================================================================
def part4():
    db = 'm4'; fresh(db)
    loop_conv = FX['S1']['convs'][0]; other_conv = FX['S1']['convs'][1]
    task = val(f"SELECT task_id FROM ops.operational_tasks WHERE space_id='{S1}' ORDER BY task_id LIMIT 1;", db)
    relay(db, worker='drain', cycles=3, idle=1)                                  # drain the baseline real traffic first
    psql(f"""INSERT INTO mesh_test.config VALUES ('loop_conversation','{loop_conv}'), ('loop_task','{task}');
      INSERT INTO mesh.routes VALUES ('cc','GuestRequestDetectedEvent','ops','mesh_test.ops_writeback(jsonb,jsonb)'::regprocedure),
                                     ('ops','TaskQueuedEvent','cc','mesh_test.cc_writeback(jsonb,jsonb)'::regprocedure);""", db)
    root = q(f"""SET LOCAL search_path = contact_center, pg_catalog; INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload)
      VALUES('{S1}','{loop_conv}',0,'GuestRequestDetectedEvent','storm-root',gen_random_uuid(),'{{"summary":"Extra towels to room 304"}}') RETURNING id||'|'||correlation_id;""", db, space=S1).split('|')
    relay(db, worker='storm', cycles=30, idle=2)
    lin = psql(f"SELECT depth, source, how, correlation_id FROM mesh.lineage WHERE correlation_id='{root[1]}' ORDER BY depth;", db).stdout.splitlines()
    depths = [int(l.split('|')[0]) for l in lin]; srcs = [l.split('|')[1] for l in lin]; hows = [l.split('|')[2] for l in lin]
    EVIDENCE['storm_lineage'] = lin
    ok('4.01 the injected App 1 <-> App 3 write-back loop produced exactly depths 0..9, alternating cc/ops, all under the root correlation id',
       depths == list(range(10)) and srcs == ['cc', 'ops'] * 5, {'depths': depths, 'sources': srcs})
    dels = int(val(f"SELECT count(*) FROM mesh.deliveries d JOIN mesh.lineage l USING (space_id, source, event_id) WHERE l.correlation_id='{root[1]}';", db))
    ok('4.02 events at depth 0..8 were delivered (9 deliveries); propagation halted at depth 9 - no depth-10 event exists', dels == 9 and max(depths) == 9, dels)
    dl = psql(f"SELECT source, reason_code, depth, correlation_id, jsonb_array_length(causal_chain), causal_chain->0->>'event_id', causal_chain->9->>'depth', last_error, state FROM mesh.dead_letters WHERE correlation_id='{root[1]}';", db).stdout.strip().split('|')
    EVIDENCE['storm_dead_letter'] = dl
    ok('4.03 the depth-9 event is dead-lettered as CAUSAL_DEPTH_EXCEEDED with the full 10-hop chain back to the root and the correlation id',
       dl[0] == 'ops' and dl[1] == 'CAUSAL_DEPTH_EXCEEDED' and dl[2] == '9' and dl[3] == root[1] and dl[4] == '10' and dl[5] == root[0] and dl[6] == '9' and 'exceeds limit 8' in dl[7], dl[:7])
    ok('4.04 capture-based lineage works for the source without causation columns (App 3 rows are CAPTURE; the root is ROOT)', hows[0] == 'ROOT' and set(hows[1:]) == {'CAPTURE'}, hows)
    agree = val(f"""SELECT count(*) FILTER (WHERE o.causation_id = l.parent_event_id)||'/'||count(*) FROM mesh.lineage l
      JOIN contact_center.outbox_events o ON o.id = l.event_id WHERE l.correlation_id='{root[1]}' AND l.depth > 0;""", db)
    ok("4.05 for App 1 (which has causation_id), captured parents agree with the column in every hop", agree == '4/4', agree)

    psql(f"SET search_path = contact_center, pg_catalog; INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{S1}','{other_conv}',0,'MessageRecordedEvent','after-storm',gen_random_uuid(),'{{}}');", db)
    relay(db, worker='after', cycles=3, idle=1)
    other_ok = val(f"SELECT count(*) FROM contact_center.outbox_events WHERE conversation_id='{other_conv}' AND published_at IS NULL;", db)
    dl_src, dl_event = val(f"SELECT source||'|'||event_id FROM mesh.dead_letters WHERE correlation_id='{root[1]}';", db).split('|')
    parked = val(f"SELECT event_type||'|'||(task_seq IS NULL)::text||'|'||(available_at = 'infinity')::text FROM ops.task_outbox WHERE event_id='{dl_event}';", db)
    ok("4.06 the depth-9 event (an unsequenced App 3 TaskQueuedEvent) is parked, not delivered; traffic in the same property keeps flowing",
       other_ok == '0' and parked == 'TaskQueuedEvent|true|true' and unpublished(db) == 1, {'parked': parked, 'other_unpublished': other_ok})
    e = q(f"SELECT mesh.replay_dead_letter('{dl_src}', '{dl_event}', 'reviewer');", db, role='mesh_owner', space=S1, fail=True)
    ok('4.07 a causal-depth dead letter cannot be replayed (replaying would restart the storm)', 'cannot be replayed' in e, e)
    e2 = q(f"SELECT mesh.discard_dead_letter('{dl_src}', '{dl_event}', 'reviewer', '');", db, role='mesh_owner', space=S1, fail=True)
    q(f"SELECT mesh.discard_dead_letter('{dl_src}', '{dl_event}', 'reviewer', 'Write-back route ops->cc removed; loop confirmed as test double');", db, role='mesh_owner', space=S1)
    psql(f"SET search_path = contact_center, pg_catalog; INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{S1}','{loop_conv}',0,'MessageRecordedEvent','post-discard',gen_random_uuid(),'{{}}');", db)
    psql("DELETE FROM mesh.routes WHERE consumer IN ('ops','cc');", db)
    relay(db, worker='after', cycles=3, idle=1)
    st = val(f"SELECT state||'|'||resolved_by FROM mesh.dead_letters WHERE event_id='{dl_event}';", db)
    ok('4.08 discard requires a reviewed reason, records who resolved it, and resolves the parked event without delivering it',
       'reviewed reason' in e2 and unpublished(db) == 0 and st == 'DISCARDED|reviewer', st)

    # dead-letter store: idempotent, minimal, durable across a server restart
    before = val("SELECT md5(string_agg(to_jsonb(d)::text, ',' ORDER BY event_id)) || '|' || count(*) FROM mesh.dead_letters d;", db)
    q(f"SELECT mesh.dead_letter('{dl_src}', '{dl_event}', 'CAUSAL_DEPTH_EXCEEDED', 'again', 'x');", db, role='mesh_owner', space=S1)
    again = val(f"SELECT count(*)||'|'||state FROM mesh.dead_letters WHERE event_id='{dl_event}' GROUP BY state;", db)
    ok('4.09 dead-lettering is idempotent: repeating it for the same event neither duplicates nor reopens a resolved entry', again == '1|DISCARDED', again)
    cols = val("SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='mesh' AND table_name='dead_letters';", db)
    ok('4.10 the dead-letter store holds identifiers, causal context and a payload SHA-256 - no payload column (personal data stays in the owning app)', 'payload,' not in cols + ',' and 'payload_sha256' in cols, cols)
    pgbin = os.environ.get('PGBIN', str(Path('/tmp/kernel-iam.qigQ4X/pg/lib/postgresql/16/bin')))
    subprocess.run([f'{pgbin}/pg_ctl', '-D', str(W / 'pgdata'), '-m', 'immediate', 'restart', '-w', '-l', str(W / 'postgres.log'), '-o', f"-k {SOCK} -p {PORT} -h ''"], check=True, capture_output=True)
    after = val("SELECT md5(string_agg(to_jsonb(d)::text, ',' ORDER BY event_id)) || '|' || count(*) FROM mesh.dead_letters d;", db)
    ok('4.11 dead letters survive an immediate (crash-style) server restart byte-for-byte', before == after, {'before': before, 'after': after})

    # legitimate traffic is not affected by the limiter: F1 -> F2 is depth 1
    psql(f"""INSERT INTO mesh.routes VALUES ('cc','GuestRequestDetectedEvent','ops','mesh_test.ops_writeback(jsonb,jsonb)'::regprocedure);""", db)
    r2 = q(f"""SET LOCAL search_path = contact_center, pg_catalog; INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload)
      VALUES('{S1}','{other_conv}',0,'GuestRequestDetectedEvent','legit-1',gen_random_uuid(),'{{}}') RETURNING correlation_id;""", db, space=S1)
    relay(db, worker='legit', cycles=4, idle=1)
    lin = val(f"SELECT string_agg(source||':'||depth, ',' ORDER BY depth) FROM mesh.lineage WHERE correlation_id='{r2}';", db)
    ok('4.12 with the write-back route removed, a real request -> task flow is depth 0 -> 1 and completes (no false storm)',
       lin == 'cc:0,ops:1' and unpublished(db) == 0, lin)

if __name__ == '__main__':
    only = sys.argv[1:] or ['1', '2', '3', '4']
    for n in only: globals()['part' + n]()
    out = W / 'mesh' / ('results_' + '_'.join(only) + '.json')
    out.write_text(json.dumps({'server': val('SHOW server_version;', 'postgres'), 'checks': RESULTS, 'evidence': EVIDENCE}, indent=2, default=str))
    print(json.dumps({'passed': sum(r['passed'] for r in RESULTS), 'failed': sum(not r['passed'] for r in RESULTS), 'total': len(RESULTS)}))
```
