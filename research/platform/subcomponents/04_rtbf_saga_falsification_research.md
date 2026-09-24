# Sub-Component D — Global RTBF Saga Orchestration and Platform Falsification Suite

**Empirical micro-research and proof of concept · 24 September 2026 · PostgreSQL 16.15 · SmartStay Kakheti hospitality platform**

This report executes what `00_master_kernel_research.md` §6 and §10 left open, on top of Sub-Components A (`01`), B (`02`) and C (`03`):

- the end-to-end, forward-only Right-to-be-Forgotten saga across all five apps, with receipt return;
- anti-resurrection after restoring a pre-erasure backup;
- the seven system-level falsification gates.

Everything ran in disposable PostgreSQL 16 clusters under `/tmp`. **The SQL in the appendices is experimental fixture code, not master DDL.** No locked dossier, contract file or dossier-embedded DDL was edited. Every extension is applied on top of the unmodified locked DDL inside throwaway databases.

## 0. Status, evidence and environment

**Result:** one clean end-to-end run of `run_all_d.sh` (Appendix E) rebuilt everything from the pristine locked DDL:

| Suite | Result |
|---|---|
| Sub-D suite (G6 journey, saga, restore, G2, G3, G5, G7) | **27 / 27** |
| Locked app suites (Gate 1) | 47 / 43 / 17 / 59 / 11, unchanged |
| Sub-B suite | 43 / 43 |
| Sub-C suite | 51 / 51 |
| Sub-A suite | all pass except the **three checks that document defects Sub-C fixed** (2.14, 2.16, 3.12), which invert as intended |

The run was then reproduced from this document alone (§9).

**Labels:** **[O]** observed in this investigation's runs; **[L]** stated in a locked dossier (`NN:Lnnn`); **[A]/[B]/[C]** established by Sub-Component A/B/C (`01`/`02`/`03`); **[I]** inference or recommendation.

**Environment [O]:**

- **Server:** PostgreSQL `16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)` with pgvector 0.8.6, using the relocated local binaries from `01 §0`. Nothing was installed system-wide.
- **Cluster:** a fresh cluster at `/tmp/saga.gxOxKE`, reachable only through a private Unix socket on port 55466, with no TCP. `trust` authentication applies only inside that owner-only directory.
- **Reused artifacts:** all earlier artifacts were extracted byte-for-byte from reports 01, 02 and 03 (hashes match `01 §7`, `02 §8`, `03 §8`).

**Read-only inputs (verified unchanged after writing):**

| Input | SHA-256 |
|---|---|
| `research/platform/00_master_kernel_research.md` | `8f2a8c41a70cf9bb73716422abd1d4faf4f3390d2354c902628fd68f2e0f688c` |
| `research/platform/subcomponents/01_kernel_iam_research.md` | `08174bea0edaf1db815003c5c8530da37fdd30047cdd8f417a8c6bcff0fb2802` |
| `research/platform/subcomponents/02_event_mesh_research.md` | `c897ae17140c4ec55286b6acb864d1b7a035df818b2ee210352e4bd3ae0f037b` |
| `research/platform/subcomponents/03_cross_app_bridges_research.md` | `63f0f385cd163b6aaadfc2dea56b7fe4f689830b77db8aad4b31c658609b88c8` |
| `research/apps/01_contact_center_dossier.md` | `d60c9100092e275a9a4165e5a139f3f7e5c96273dbec53e6a18f234b485edd65` |
| `research/apps/02_guest_crm_dossier.md` | `e7481fcce7303cb55864ddfaac5c6f2bd8b4d2458eb427f6d3a286c815b7f2fb` |
| `research/apps/03_operations_task_dossier.md` | `e0de5d8b68a4ff106d164dfdf39790213d7b83b4e2b372d8ba875946419f5c1b` |
| `research/apps/04_storage_knowledge_dossier.md` | `fb7d4c8dee0e5ab423421a548716b83452560f99ebb5ff863bb1ea7acaaa870a` |
| `research/apps/05_ai_team_agent_core_dossier.md` | `d3bb193d0be03f0f78bd9b7b263a571cd04fd5e6d75f86045348f232e78dd97e` |

### 0.1 The stack under test

| Layer | Source | Where applied |
|---|---|---|
| Five locked app DDLs | dossiers 01–05 | `kernel_locked` |
| Cross-app bridges (CR1–CR12) | `03` Appendix A | `kernel_clean` |
| **Saga app layer:** App 1 redaction, App 3 erasure, App 5 purge, App 4 sweep, App 2 saga helpers | this report, Appendix A (`saga.sql` up to `@@platform_saga`) | `kernel_clean` |
| Kernel (tenant registry, IAM, projection) in hard-FK mode, real App 1–5 traffic | `01`, `02` `build_base.py` | `mesh_base` |
| Event mesh + R1 relay | `02` Appendix A | test clones |
| **Mesh patch:** epoch-ordered App 4 claims | this report, Appendix B | test clones |
| Kernel revisions v2 (F1/F3) and **v3** (App 1 revocation) | `03` Appendix B; this report, Appendix C | test clones |
| **Platform saga:** coordinator, commands, worker, ledger, replay; journey bridges | Appendix A (`@@platform_saga` onward) | test clones |

**Locked-function replacements introduced here** keep their signatures, owners and grants, and each admits exactly one narrowly scoped purge path:

- `contact_center.immutable_message()` allows only role `cc_redactor` to set fixed redaction values, with every identity, ordering and dedupe column unchanged.
- `workforce.immutable()` allows only role `ai_purger` to `DELETE` from `agent_checkpoints`.

In both cases, every other caller and every other table still gets the original exception (S.04, S.06).

---

## 1. The orchestrated RTBF saga

### 1.1 Design [I, built on L/C]

`00 §6.2` recommended an orchestrated, forward-only saga, with **App 2 as system of record** and the **kernel providing delivery, fan-out, retry, deadlines and restore replay**. Sub-C built the recipient registry and the receipt contract (`03 §2.1`). This phase supplies the rest.

```mermaid
sequenceDiagram
  participant A2 as App 2 erase_profile() (unchanged)
  participant R as Sub-B R1 relay
  participant K as platform.enqueue_erasure (coordinator)
  participant Wk as platform.run_erasure_commands (worker)
  participant A1 as App 1 redaction (cc_redactor)
  participant A3 as App 3 erasure (ops_owner)
  participant A5 as App 5 purge (ai_purger)
  participant A4 as App 4 sweep (kb_owner)
  A2->>A2: fence: epoch+1, hard delete, suppression 30d, 7 pending receipts, outbox event
  R->>K: ProfileErasureRequestedEvent (route crm -> platform)
  K->>K: resolve App 1 conversations once; 1 command per registered recipient; ledger row
  Wk->>A1: erase_subject(request, App 1 subjects)
  Wk->>A3: erase_subject(request, profile, conversations)
  Wk->>A5: erase_subject(request, profile, conversations)
  Wk->>A4: pii_sweep(request)
  Wk->>A2: record_erasure_receipt(recipient, outcome) per recipient
  A2->>A2: propagating -> complete | exception_review
```

**Why orchestration was necessary, not just preferable [O].** App 3 cannot identify a guest's tasks on its own: `ingest_request()` never sets `profile_ref` (`03:L475–520`). App 5 sessions reference conversations. Only App 1 knows which conversations belong to the guest's participant. The coordinator therefore resolves them **once**, at fan-out, through App 1's public `subject_conversations()`, and passes them in each command. A choreographed design would have required App 3 and App 5 to read App 1 directly, which is the cross-app coupling `00 §3.6` forbids.

**One recipient, one transaction, its own role.**

- Each command runs in its own transaction, through the recipient's `SECURITY DEFINER` adapter, owned by that app's purge role. None of these roles is superuser or `BYPASSRLS`, and all run under the tenant's RLS context.
- A failing adapter rolls back only its own work. The worker retries it; after the retry budget it records a `failed` receipt.
- Recipients without a database adapter record honest detail codes: `cache_search` → `NO_CACHE_DEPLOYED`, `object_store` → `REFS_TOMBSTONED_BY_APPS`, `backup_ledger` → `lawful_restriction` / `BACKUP_ROTATION_WINDOW`, conditional on the ledger entry existing.

### 1.2 The recipient adapters

| Recipient | Adapter | What it does [O] |
|---|---|---|
| `contact_center` | `contact_center.erase_subject` (**00 CR4 proper**, the redaction procedure `01:L757` asks for) | For every conversation of the guest participant, it redacts **all** message bodies and attachments and sets `payload` to `{"redacted":true}`. Rows, IDs, `seq`, provider and command keys are kept as dedupe tombstones (`01:L755`). It also: anonymizes the participant; revokes identities and removes the phone; clears reservation special requests and room number; redacts request summaries, chapter summaries and outbox payloads; redacts control, escalation and HITL reasons and **channel addressing** (§1.4); and writes a PII-free `redaction_log` |
| `operations` | `ops.erase_subject` (00 CR9 erasure; `03:L717–719`) | Neutralizes task title, details and reason; tombstones evidence object references and sets `redacted_at`; scrubs staff command bodies and results (so no stale response can re-serve erased text), outbox payloads and handover notes; **keeps** status, `task_attestations` and evidence hashes (minimal attestation history) |
| `workforce` | `workforce.erase_subject` (`05:L161`, `L572`) | Stops active sessions through the locked `stop_session()` (fence + 1, so a running worker can no longer write); detaches `profile_id` and `privacy_epoch`; deletes checkpoint state references |
| `kb` | `kb.pii_sweep` (`04:L21`) | App 4 holds no guest profiles by design, so it sweeps all chunks, including drafts, for phone and e-mail patterns and queues any hit for human review. Its retrieval audit keeps only `query_hmac` (`04:L351`) |
| `cache_search`, `object_store`, `backup_ledger` | platform adapters | Detail codes as above; `backup_ledger` requires the ledger row |

### 1.3 Saga results [O]

| # | Result |
|---|---|
| S.01 | App 2's **unchanged** `erase_profile()`, run as its own privacy role, fences locally: profile hard-deleted, `local_erased`, **7 pending receipts** (Sub-C CR6), suppression active |
| S.02 | The R1 relay delivers `ProfileErasureRequestedEvent` to the coordinator: **7 commands**, one per registered recipient; the guest's App 1 conversation resolved once; ledger written |
| S.03 | State machine observed `local_erased` → **`propagating`** (after the first receipt) → **`complete`**, with 6 `erased` and `backup_ledger: lawful_restriction` |
| S.04 | App 1: every body in the conversation reads `[redacted]` (rows kept); participant `Redacted guest`; phone `null`; identity revoked. The Sub-C resolved-snapshot manifest now answers **410** (`SNAPSHOT_SOURCE_GONE`), because the digests no longer match. Messages remain immutable to every other role, superuser included |
| S.05 | App 3: `COMPLETED \| Guest request (redacted) \| redacted \| 1 attestation \| evidence tombstoned` |
| S.06 | App 5: session `INTERRUPTED` → `CANCELLED` through its fence, `profile_id` null, 0 checkpoints. `agent_audit_log` remains immutable, even for the purge role |
| **S.07** | **Falsification scan:** every row of **all 114 tables in the eight platform schemas** is searched as text for the guest's plaintext markers: name, phone, message fragment and preference value. **0 hits after the saga.** Before the saga the same scan found the guest in 10 tables (G6.7) |
| S.08 | Idempotent: re-running relay and worker creates no new commands; a repeated App 1 redaction is a no-op |
| S.09 | **Failure isolation**, on a second guest: an accidental phone number in an App 4 *draft* upload fails the kb sweep (`PII_SUSPECTED_REVIEW`, 1 chunk queued), which sends the saga to **`exception_review`**. An injected transient App 5 fault is retried and succeeds on attempt 3. Every other recipient completes |

### 1.4 What the falsification scan caught [O]

The first complete run reported every receipt `erased` and the state `complete`, **yet S.07 found the guest's phone in `contact_center.conversation_channels`** (`recipient_subject = 'whatsapp:+995555123456'`). My App 1 adapter had missed the channel addressing columns. The fix (redact `recipient_subject`, `external_thread_id`, `consent`) is in Appendix A. The final run shows 0 hits.

The lesson matters beyond this one column [I]: **a saga that ends in `complete` proves only that every recipient *said* it erased.** An independent, schema-wide residual scan is what checks the claim. It belongs in the release gate and in periodic compliance runs, not only in development.

---

## 2. Anti-resurrection after a backup restore

### 2.1 Procedure [O/I]

1. **Snapshot** the live database while the guest is fully present (after G6). A physical copy with `CREATE DATABASE … TEMPLATE` stands in for a backup restore point.
2. **Erase** the guest in the live database (§1). The coordinator writes a pseudonymous ledger entry: request, profile, privacy epoch, source subjects, resolved conversations.
3. **Ship the ledger outside the database** (`COPY` to a file, standing in for a WORM store).
4. **Restore:** create `restored` from the snapshot and mark `platform.restore_state.traffic_enabled = false`.
5. **Before traffic:** `platform.replay_erasure_ledger(shipped entries)` classifies each entry via App 2's `replay_status()`:
   - `PRESENT` → re-run App 2's `erase_profile()`, which re-fences, re-suppresses and re-emits the event;
   - `ALREADY_ERASED` → skip;
   - `ABSENT` → skip.

   The relay and the saga worker then re-run every recipient adapter.
6. Verify, then set `traffic_enabled = true`.

### 2.2 Results [O]

| # | Result |
|---|---|
| R.01 | **Negative control.** The restored snapshot **resurrects** the guest: CRM context served, active preference served (`1\|1`), transcript intact, plaintext present in 10 tables. **The restored database's own ledger has no entry for this guest**, because the snapshot predates the erasure. An in-database ledger alone therefore cannot prevent resurrection |
| R.02 | Replaying the **shipped** ledger before traffic: the one subject present in the snapshot is re-erased end to end (state `complete`). Entries already erased in the snapshot, or absent from it, are classified and skipped. **The 114-table residual scan finds 0 plaintext hits** |
| R.03 | Re-ingestion is blocked after the restore. Linking the erased App 1 subject to a new profile fails with `erased source replay blocked`; recreating the erased profile ID fails with `erased subject blocked` (App 2's own guards and suppression, `02:L237`) |

**Requirements this establishes [I]:**

- The anti-resurrection ledger **must be shipped out of the database it protects**, to storage whose retention exceeds the backup window.
- Restore runbooks must replay it **before** relays, CRM lookups or AI sessions are re-enabled (`02:L225`, `04:L1421`, `05:L572`).
- The ledger holds pseudonymous identifiers only. App 2 already classifies such records as a restricted anti-resurrection purpose, not anonymous data (`02:L496`).

---

## 3. The falsification gates (`00 §10`)

| Gate | What `00 §10` asked | Evidence [O] | Result |
|---|---|---|---|
| **G1** | All schemas co-installed; every existing suite passes unchanged | Full stack = locked + Sub-C bridges + Sub-D saga app layer. Locked suites 47 / 43 / 17 / 59 / 11. The Sub-B builder re-runs them in hard-FK mode (47 / 43 / 17 / 59). Sub-B 43/43; Sub-C 51/51; Sub-A all pass except the 3 intended inversions (`03 §5`) | **Pass** |
| **G2** | Cross-tenant isolation under pooled transactions | G2.1: all **94** tenant tables in the five app schemas (every bridge and saga table included) have RLS enabled + forced. The one non-tenant table, the global erasure-recipient catalog with no guest data, is not writable by any runtime role. G2.2: kernel bookkeeping tables without RLS are unreachable by all 13 runtime, transport and gateway roles, except Sub-B's read-only `mesh.sources` catalog. G2.3: **one reused backend, 40 alternating S1/Kvareli transactions over all 94 tables: every count equals that tenant's own row count** (268 vs 33 rows); 40 context-free transactions see **0 rows everywhere** | **Pass** |
| **G3** | Relay kill/restart at claim, deliver and ack with zero loss | 180 ordered App 1 events, 3 workers, a slow consumer. Kills: 1 after claim, 1 after delivery-before-ack, **10 random `pg_terminate_backend` during runs**, and **1 `pg_ctl restart -m immediate`**. 25 events were still pending when the chaos ended, their leases held by dead workers; all were re-claimed after the 3 s lease expired. **180 applied, 180 distinct, 0 unpublished, 0 dead letters, 0 per-conversation inversions** | **Pass** |
| **G4** | Storm limiting | Covered by the Sub-B suite inside G1 (`02` 4.01–4.12: depth-9 halt, full chain, replay refusal, durable dead letters), re-run on the full stack: 43/43 | **Pass** |
| **G5** | Lock graph: concurrent App 1 sends, App 3 claims, App 4 publications under colliding advisory keys; zero deadlocks | 25 s at the same time: 2 workers doing App 1 control changes, 2 doing App 3 `ingest_request`, 1 doing the App 4 upload → process → **approve with supersede** cycle, plus the relay. **Collisions simulated**: every App 3 and App 4 transaction first takes one of App 1's exact conversation advisory keys, as if its hash had collided. **474 / 859 / 94 operations, 0 deadlock errors, `pg_stat_database.deadlocks` delta 0.** The 233 business rejects are App 1's optimistic `version conflict` between its own two workers. **Negative control (G5.2):** two transactions spanning App 1 and App 4 rows in opposite order **deadlock immediately**. The one-app-per-transaction rule (`00 §3.3`) is what makes G5.1 safe | **Pass** |
| **G6** | Cross-app guest journey | §4 | **Pass** |
| **G7** | Revocation propagates within token TTL | A "night manager" member (GM + Front Desk Lead + Housekeeping Supervisor templates) is revoked in one kernel transaction. The kernel gateway (`begin_request`), App 1 claim (Sub-C `disabled_at`, now set by **kernel v3**), App 3 action **using a token issued before revocation with 5 minutes of TTL left**, App 4 approval of a real pending revision, and App 5 resume **all refuse**; all checks completed within **168 ms** of the commit. Database-enforced paths do not wait for token expiry. App 2 has no member table, so it relies on the gateway check | **Pass** |

**Gate 2 surfaced one convention exception [O].** Sub-C's `guest_crm.erasure_recipient_registry` has no RLS: it is a global catalog with no `space_id` and no guest data. The gate now makes this explicit, and verifies the compensating control: no runtime role can write it.

---

## 4. Gate 6 — the cross-app guest journey, end to end

**Fixture:** a guest at the Telavi fixture property writes on WhatsApp: *"Could you send 2 extra towels to room 12 before our Kindzmarauli tasting?"*

| # | Hop | Evidence [O] |
|---|---|---|
| G6.1 | App 1 → App 2 | The message is recorded through App 1's own triggers. App 2 gets a verified source link, a `service_memory` permission and an explicit, active `wine_experience` preference that passes App 2's locked allowlist guard. The Layer-1 context read returns it |
| G6.2 | App 4 → App 1 | The locked App 4 `guest_search` (hybrid retrieval, guest audience, `kb_guest` role) cites an approved tasting-cancellation policy. The App 1 dispatch gate (Sub-C CR1 projection) confirms the citation is servable, and the AI reply is recorded with that `policy_evidence` |
| G6.3 | App 1 → relay → App 3 | The `GuestRequestDetectedEvent` envelope validates against App 1's locked `outbox-event/1`. The R1 relay delivers it to the **real** App 3 `ingest_request()`; the task is `QUEUED` |
| G6.4 | App 3 → relay → App 1 | Staff **claim → start → human attestation** with completion evidence → `COMPLETED`. Three callbacks (`accepted`, `in_progress`, `completed`) validate against `task-status/1` and are applied by the App 1 consumer (Appendix A `@@journey`). App 1's projection is `completed`, `last_task_seq = 3`, `evidence:<id>` |
| G6.5 | Lineage | `cc:0:ROOT, ops:1:CAPTURE`: the request → task chain is depth 1, far below the storm limit |
| G6.6 | App 1 → App 2 | The conversation resolves; App 1 freezes a resolved-snapshot manifest (Sub-C CR2) that validates against App 2's contract |
| G6.7 | Baseline | Before erasure, the guest's plaintext is present in 10 tables across App 1 and App 2 (the S.07 counterpart) |

### 4.1 The cross-sub-component defect Gate 6 found [O]

**G6.0.** On the first journey run, App 1's knowledge projection was **fenced** (`KNOWLEDGE_GAP expected<=7 got 12`), so the tasting-policy citation was refused, even though all 12 App 4 events had been delivered.

- **Cause.** Sub-B's `claim_kb` enforces head-of-line order **per knowledge item**. Sub-C's App 1 consumer needs **property-wide epoch order**, because `knowledge_epoch` is a total order per property that the consumer applies in sequence. The relay legitimately delivered epochs 9–12 while the epoch-7 supersession pair waited behind its predecessor. The consumer saw a gap and fenced AI dispatch, which is its designed, fail-safe response (`03` A.23).
- **Fix.** A small mesh patch (Appendix B): an App 4 group is claimable only if no earlier-epoch event of the same property is still unpublished.
- **Evidence.** With the published Sub-B claim, the projection fences (`true|KNOWLEDGE_GAP…|12`) and `reconcile_knowledge()` lifts it (`RECONCILED`). With the patch, all 12 events arrive in order and nothing fences (`false|-|12`).

**Lesson [I].** Each sub-component passed its own suite. The defect lives only in the **composition**: the relay's per-aggregate ordering versus the consumer's per-property ordering. That is why `00 §10` asked for a journey gate. **The source's ordering key must be declared per contract, not inferred from the table.**

---

## 5. Findings from this phase

1. **The RTBF saga works end to end with the locked apps' own functions,** plus narrowly scoped purge adapters, and its completeness was **independently falsified** by a 114-table scan (S.07).
2. **A `complete` saga can still be incomplete.** The scan caught channel addressing that my App 1 adapter missed (§1.4). A schema-wide residual scan should be a standing compliance control.
3. **Orchestration is structurally required.** App 3 and App 5 cannot locate a guest's data without the conversations only App 1 can resolve (§1.1).
4. **Immutability and erasure are reconcilable.** Replacing a locked immutability trigger so that exactly one dedicated role may set exactly the redaction values (App 1), or delete exactly one table's rows (App 5), preserves every other guarantee. The App 5 suite's own immutability checks still pass (G1).
5. **Backups resurrect erased guests unless an externally shipped ledger is replayed before traffic** (R.01–R.03).
6. **The platform has no deadlock path** as long as each transaction touches one app, even under simulated advisory-key collisions (G5.1). A single cross-app transaction reintroduces deadlocks immediately (G5.2).
7. **Relay durability is bounded by lease duration.** Nothing is lost when workers or the server die; orphaned events wait until their lease expires (G3). Lease length is therefore a latency and recovery trade-off to size deliberately.
8. **Composition defects need composition tests:** the epoch-order mismatch between Sub-B and Sub-C (§4.1).
9. **Revocation is immediate on every database-enforced path**, including pre-issued action tokens (G7), once the kernel projection also disables App 1 operators (kernel v3 closes Sub-A gap 3.16).

## 6. Change requests and open items

| Item | Status |
|---|---|
| 00 CR4 (App 1 redaction procedure) | **Implemented** here (`contact_center.erase_subject` + guarded `immutable_message`) |
| 00 CR9 (App 3 erasure function) | **Implemented** here (`ops.erase_subject`) |
| 00 CR12 (App 5 erasure consumer) | **Implemented** here (`workforce.erase_subject` + guarded `immutable`) |
| App 4 accidental-PII handling | **Sweep + review queue implemented.** The *removal* workflow for flagged chunks (the reviewed purge `04:L592` asks for) remains open; the saga correctly stops in `exception_review` until it exists |
| Sub-B mesh | **Change request:** App 4 must be claimed in property-wide epoch order (Appendix B) |
| External ledger store | Required for production. Tested here with a file export; WORM storage, retention and access control are open |
| Object store / caches / provider-side caches / backups | Honest placeholder receipts in the test bed. Real adapters are required before any claim of completeness outside the database |
| App 1 provider-event replay after erasure | App 2 blocks relinking (R.03). App 1 itself still needs the "reject source events older than the deletion watermark" rule (`02:L237`) for replayed channel webhooks |
| Saga deadlines and alerting | `erasure_commands.deadline` exists; alerting on overdue recipients is not built |

---

## 7. Test inventory (27 checks)

**G6 journey (8):**

- G6.0 epoch-order finding and fix
- G6.1 App 1 message + App 2 preference
- G6.2 App 4 retrieval and servable citation
- G6.3 App 1 request → relay → App 3 task
- G6.4 staff completion → callbacks → App 1 projection
- G6.5 shallow lineage
- G6.6 resolved-snapshot manifest
- G6.7 pre-erasure plaintext baseline

**Saga (9):**

- S.01 local fence
- S.02 fan-out
- S.03 state machine
- S.04 App 1 redaction
- S.05 App 3 erasure
- S.06 App 5 purge
- S.07 residual scan
- S.08 idempotence
- S.09 failure isolation

**Restore (3):** R.01 resurrection negative control · R.02 external ledger replay · R.03 re-ingestion blocked.

**Gates (7):** G2.1–G2.3 · G3.1 · G5.1–G5.2 · G7.1.

G1 and G4 are the prior suites re-run on the full stack (§3).

## 8. Limits of what this proves

- **Proven [O]:**
  - The saga and its adapters on real locked schemas and real traffic.
  - Completeness by independent scan.
  - Resurrection and its prevention with an externally shipped ledger.
  - Isolation across 94 tables under backend reuse.
  - Zero-loss relay recovery from process and server kills.
  - No deadlocks under simulated collisions (plus a negative control).
  - The journey across all five apps.
  - Immediate revocation.
- **Not proven:**
  - Erasure outside PostgreSQL: object store, caches, provider or model-side caches, analytics, subprocessors and real backup media.
  - PITR/WAL-based restores (a template copy stood in).
  - True hash collisions (simulated by taking the other app's key).
  - A real connection pooler.
  - The HTTP and IdP layer, including JWT TTL behavior on non-database paths.
  - Performance at production scale.
  - Georgian legal deadlines (inherited limit, `02:L195`).
- **Not done (by constraint):** no master DDL and no locked-file edit.

## 9. Reproduction

Prerequisites: the Sub-A environment (`01 §7`) — PostgreSQL 16 with pgvector ≥ 0.6.0 available to the server, and Python 3.12 with `jsonschema` and `referencing`. Run from the repository root.

```bash
export SW="$(mktemp -d /tmp/saga.XXXXXX)"
mkdir -p "$SW/kernel" "$SW/mesh" "$SW/bridges/contracts" "$SW/saga" -m 700 "$SW/socket"
python3 - <<'PY'   # artifacts from reports 01 (kernel), 02 (mesh), 03 (bridges), 04 (saga)
import os, re
from pathlib import Path
W = Path(os.environ['SW'])
for rep, sub in [('01_kernel_iam_research.md', 'kernel'), ('02_event_mesh_research.md', 'mesh'),
                 ('03_cross_app_bridges_research.md', 'bridges'), ('04_rtbf_saga_falsification_research.md', 'saga')]:
    md = Path('research/platform/subcomponents', rep).read_text()
    for name, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```\w+\n(.*?)\n```', md, re.S):
        p = W / sub / name; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(body + '\n')
PY
KERNEL_WORKDIR="$SW" python3 "$SW/kernel/prepare.py"
export PGBIN="$(pg_config --bindir)"          # or the relocated pgvector-enabled copy from 01 §0
"$PGBIN/initdb" -D "$SW/pgdata" -A trust --no-locale --encoding=UTF8
"$PGBIN/pg_ctl" -D "$SW/pgdata" -l "$SW/postgres.log" -o "-k $SW/socket -p 55466 -h ''" -w start
P="psql -X -q -h $SW/socket -p 55466 -v ON_ERROR_STOP=1"
$P -d postgres -c 'CREATE DATABASE kernel_locked'
for n in 1 2 3 4 5; do $P -d kernel_locked -f "$SW/ddl/app$n.sql"; done
SW="$SW" bash "$SW/saga/run_all_d.sh" build gate1 sagad     # ~30 min; G3 and Sub-B part 4 restart the server
"$PGBIN/pg_ctl" -D "$SW/pgdata" -m fast stop
```

**Independent reproduction [O]:** the recipe above was replayed from reports 01–04 alone into a new work directory and cluster, reusing only the relocated pgvector-enabled binaries. Results were identical:

- Gate 1: locked suites 47 / 43 / 17 / 59 / 11; Sub-A 17 + 23 + 11 + 2 + 1 passing, with the same three intended inversions; Sub-B 43 / 43; Sub-C 51 / 51.
- Sub-D suite: **27 / 27**.

**Artifact fingerprints (as executed):**

| Artifact | SHA-256 |
|---|---|
| `saga.sql` (Appendix A) | `0e94511c9157ffe692e3e0d92f86afb2498ee136c99cce97265bc5e88c788fde` |
| `mesh_patch.sql` (Appendix B) | `9fdd951e3a4ada9fb0e5256758400eb1317d2f02ade512d799b892fcb6727c12` |
| `kernel_v3.sql` (Appendix C) | `ab2599a50ad973660593332e112f70c1ef353588e2a6da34dc119083dbb9e1b1` |
| `test_saga.py` (Appendix D) | `bd955310290ecf62079772da847bbc520d93101bf1545c56a944c6e35c81377f` |
| `run_all_d.sh` (Appendix E) | `e12336881d64172b0bddc51d0ef92ba1a288136410476692a838ecb423991b69` |

---

## Appendix A — RTBF saga and journey bridges

RTBF saga and journey bridges. Sections up to `@@platform_saga` form the app-level layer installed on `kernel_clean` (and therefore under every Gate 1 suite); the rest is the platform layer. **Not master DDL.**

<!-- artifact: saga.sql -->
```sql
-- EXPERIMENTAL RTBF SAGA + JOURNEY BRIDGES (Sub-Component D micro-research). Disposable test fixture, NOT master DDL.
-- Prerequisites: five locked DDLs + Sub-C bridges.sql (+ Sub-A kernel + Sub-B mesh for the saga/journey sections).
-- Signature-preserving replacements of locked functions in this file: contact_center.immutable_message() and
-- workforce.immutable() - each now admits exactly one narrowly-scoped purge path for one dedicated role.

-- @@roles
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['cc_redactor','ai_purger','platform_saga'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS', r);
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN RAISE EXCEPTION 'role % has unsafe attributes', r; END IF;
 END LOOP; END $$;

-- @@app1_redaction  (00 CR4 proper: the authorized redaction procedure 01:L757 asks for)
GRANT USAGE, CREATE ON SCHEMA contact_center TO cc_redactor;
GRANT SELECT ON contact_center.conversations, contact_center.messages, contact_center.participants, contact_center.participant_identities,
 contact_center.reservations, contact_center.guest_requests, contact_center.conversation_chapters, contact_center.outbox_events,
 contact_center.control_history, contact_center.hitl_sessions TO cc_redactor;
GRANT UPDATE (body, attachments, payload) ON contact_center.messages TO cc_redactor;
GRANT UPDATE (display_name, preferred_locale, preferences) ON contact_center.participants TO cc_redactor;
GRANT UPDATE (external_subject, normalized_phone, metadata, revoked_at) ON contact_center.participant_identities TO cc_redactor;
GRANT UPDATE (special_requests, vip_status, room_number) ON contact_center.reservations TO cc_redactor;
GRANT UPDATE (summary, detail) ON contact_center.guest_requests TO cc_redactor;
GRANT UPDATE (summary) ON contact_center.conversation_chapters TO cc_redactor;
GRANT UPDATE (payload) ON contact_center.outbox_events TO cc_redactor;
GRANT UPDATE (escalation_reason) ON contact_center.conversations TO cc_redactor;
GRANT UPDATE (reason) ON contact_center.control_history TO cc_redactor;
GRANT UPDATE (end_reason) ON contact_center.hitl_sessions TO cc_redactor;
GRANT SELECT ON contact_center.conversation_channels TO cc_redactor;
GRANT UPDATE (external_thread_id, recipient_subject, consent) ON contact_center.conversation_channels TO cc_redactor;
-- Messages stay immutable for everyone except the redaction role, and even that role may only set the fixed redaction
-- values while every identity / ordering / dedupe column is unchanged (dedupe tombstones survive, 01:L755).
CREATE OR REPLACE FUNCTION contact_center.immutable_message() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, contact_center, pg_temp AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND current_user = 'cc_redactor'
  AND (NEW.space_id, NEW.id, NEW.conversation_id, NEW.chapter_id, NEW.channel_id, NEW.sender_id, NEW.seq, NEW.direction, NEW.control_version,
       NEW.occurred_at, NEW.recorded_at, NEW.provider_message_id, NEW.provider_event_key, NEW.client_command_key)
   IS NOT DISTINCT FROM (OLD.space_id, OLD.id, OLD.conversation_id, OLD.chapter_id, OLD.channel_id, OLD.sender_id, OLD.seq, OLD.direction, OLD.control_version,
       OLD.occurred_at, OLD.recorded_at, OLD.provider_message_id, OLD.provider_event_key, OLD.client_command_key)
  AND NEW.body = '[redacted]' AND NEW.attachments = '[]'::jsonb AND NEW.payload = '{"redacted": true}'::jsonb THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'messages are immutable; use receipt, redaction procedure, or revision event';
END $$;
SET ROLE cc_redactor;
CREATE TABLE contact_center.redaction_log (
 space_id uuid NOT NULL, request_id uuid NOT NULL, participant_id uuid NOT NULL, conversations integer NOT NULL, messages integer NOT NULL,
 identities integer NOT NULL, reservations integer NOT NULL, requests integer NOT NULL, outbox integer NOT NULL, redacted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (space_id, request_id, participant_id));
ALTER TABLE contact_center.redaction_log ENABLE ROW LEVEL SECURITY; ALTER TABLE contact_center.redaction_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON contact_center.redaction_log USING (space_id = nullif(current_setting('app.space_id', true), '')::uuid)
 WITH CHECK (space_id = nullif(current_setting('app.space_id', true), '')::uuid);
CREATE FUNCTION contact_center.subject_conversations(p_subjects uuid[]) RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
 SELECT coalesce(array_agg(c.id ORDER BY c.id), '{}') FROM conversations c
 WHERE c.space_id = nullif(current_setting('app.space_id', true), '')::uuid AND c.guest_id = ANY (p_subjects) $$;
CREATE FUNCTION contact_center.erase_subject(p_request uuid, p_subjects uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; p uuid; convs uuid[]; n_msg integer; n_id integer; n_res integer; n_req integer; n_out integer;
 total jsonb := '[]'; BEGIN
 FOREACH p IN ARRAY coalesce(p_subjects, '{}') LOOP
  CONTINUE WHEN NOT EXISTS (SELECT 1 FROM participants WHERE space_id = sid AND id = p AND kind = 'guest');   -- staff identities are not the subject
  CONTINUE WHEN EXISTS (SELECT 1 FROM redaction_log WHERE space_id = sid AND request_id = p_request AND participant_id = p);   -- idempotent
  SELECT coalesce(array_agg(id), '{}') INTO convs FROM conversations WHERE space_id = sid AND guest_id = p;
  UPDATE messages SET body = '[redacted]', attachments = '[]', payload = '{"redacted": true}'
   WHERE space_id = sid AND conversation_id = ANY (convs) AND NOT (body = '[redacted]' AND attachments = '[]' AND payload = '{"redacted": true}');
  GET DIAGNOSTICS n_msg = ROW_COUNT;
  UPDATE participants SET display_name = 'Redacted guest', preferred_locale = NULL, preferences = '{}' WHERE space_id = sid AND id = p;
  UPDATE participant_identities SET external_subject = 'redacted:' || id, normalized_phone = NULL, metadata = '{}', revoked_at = coalesce(revoked_at, clock_timestamp())
   WHERE space_id = sid AND participant_id = p;
  GET DIAGNOSTICS n_id = ROW_COUNT;
  UPDATE reservations SET special_requests = '[]', vip_status = 'none', room_number = NULL WHERE space_id = sid AND primary_guest_id = p;
  GET DIAGNOSTICS n_res = ROW_COUNT;
  UPDATE guest_requests SET summary = '[redacted]', detail = detail - ARRAY['summary','note','notes','room_number','reason','requested_quantity']
   WHERE space_id = sid AND conversation_id = ANY (convs);
  GET DIAGNOSTICS n_req = ROW_COUNT;
  UPDATE conversation_chapters SET summary = '{}' WHERE space_id = sid AND conversation_id = ANY (convs);
  UPDATE outbox_events SET payload = '{"redacted": true}' WHERE space_id = sid AND conversation_id = ANY (convs) AND payload <> '{"redacted": true}';
  GET DIAGNOSTICS n_out = ROW_COUNT;
  UPDATE conversations SET escalation_reason = '[redacted]' WHERE space_id = sid AND id = ANY (convs) AND escalation_reason IS NOT NULL;
  UPDATE control_history SET reason = '[redacted]' WHERE space_id = sid AND conversation_id = ANY (convs);
  UPDATE hitl_sessions SET end_reason = '[redacted]' WHERE space_id = sid AND conversation_id = ANY (convs) AND end_reason IS NOT NULL;
  -- channel addressing (e.g. whatsapp:+995...) is the guest's contact identifier: found by the Sub-D residual-PII scan (S.07)
  UPDATE conversation_channels SET recipient_subject = 'redacted:' || conversation_id, external_thread_id = 'redacted:' || conversation_id || ':' || channel_id, consent = '{}'
   WHERE space_id = sid AND conversation_id = ANY (convs) AND recipient_subject NOT LIKE 'redacted:%';
  INSERT INTO redaction_log VALUES (sid, p_request, p, cardinality(convs), n_msg, n_id, n_res, n_req, n_out);
  total := total || jsonb_build_object('participant', p, 'conversations', cardinality(convs), 'messages', n_msg, 'identities', n_id, 'reservations', n_res, 'requests', n_req, 'outbox', n_out);
 END LOOP;
 RETURN total; END $$;
RESET ROLE;

-- @@app3_erasure  (03:L717-719: neutralize, tombstone evidence, keep minimal attestation, scrub commands/outbox)
SET ROLE ops_owner;
CREATE TABLE ops.erasure_log (space_id uuid NOT NULL, request_id uuid NOT NULL, tasks integer NOT NULL, evidence integer NOT NULL, commands integer NOT NULL,
 outbox integer NOT NULL, handovers integer NOT NULL, erased_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, request_id));
ALTER TABLE ops.erasure_log ENABLE ROW LEVEL SECURITY; ALTER TABLE ops.erasure_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ops.erasure_log USING (space_id = ops.tenant()) WITH CHECK (space_id = ops.tenant());
CREATE FUNCTION ops.erase_subject(p_request uuid, p_profile uuid, p_conversations uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = ops, pg_temp AS $$
DECLARE sid uuid := tenant(); ids uuid[]; n_ev integer; n_cmd integer; n_out integer; n_ho integer; BEGIN
 IF EXISTS (SELECT 1 FROM erasure_log WHERE space_id = sid AND request_id = p_request) THEN RETURN jsonb_build_object('replay', true); END IF;
 SELECT coalesce(array_agg(task_id), '{}') INTO ids FROM operational_tasks
  WHERE space_id = sid AND (profile_ref = p_profile OR conversation_id = ANY (coalesce(p_conversations, '{}')));
 UPDATE operational_tasks SET title = 'Guest request (redacted)', reason = CASE WHEN reason IS NULL THEN NULL ELSE '[redacted]' END,
  details = jsonb_build_object('redacted', true, 'erasure_request', p_request), profile_ref = NULL
  WHERE space_id = sid AND task_id = ANY (ids);
 UPDATE completion_evidence SET redacted_at = coalesce(redacted_at, clock_timestamp()), object_ref = 'tombstone:' || evidence_id   -- object URL revoked
  WHERE space_id = sid AND task_id = ANY (ids);
 GET DIAGNOSTICS n_ev = ROW_COUNT;
 UPDATE staff_commands SET request_body = jsonb_build_object('action', request_body->'action', 'redacted', true),
  result = jsonb_build_object('state', result->'state', 'state_version', result->'state_version', 'redacted', true)   -- no stale response can re-serve erased text
  WHERE space_id = sid AND task_id = ANY (ids);
 GET DIAGNOSTICS n_cmd = ROW_COUNT;
 UPDATE task_outbox SET payload = CASE WHEN payload ? 'reason' THEN jsonb_set(payload, '{reason}', 'null') ELSE payload END - 'title' - 'summary'
  WHERE space_id = sid AND task_id = ANY (ids);
 GET DIAGNOSTICS n_out = ROW_COUNT;
 UPDATE shift_handovers SET note = '[redacted]' WHERE space_id = sid AND task_id = ANY (ids);
 GET DIAGNOSTICS n_ho = ROW_COUNT;
 INSERT INTO erasure_log VALUES (sid, p_request, cardinality(ids), n_ev, n_cmd, n_out, n_ho);
 RETURN jsonb_build_object('tasks', cardinality(ids), 'evidence', n_ev, 'commands', n_cmd, 'outbox', n_out, 'handovers', n_ho); END $$;
RESET ROLE;

-- @@app5_purge  (05:L161: stop sessions, purge memory references and state blobs; 05:L572 audited administrative purge)
CREATE OR REPLACE FUNCTION workforce.immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'agent_checkpoints' AND current_user = 'ai_purger' THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'immutable record'; END $$;
GRANT USAGE, CREATE ON SCHEMA workforce TO ai_purger;
GRANT SELECT ON workforce.agent_execution_sessions, workforce.agent_checkpoints TO ai_purger;
GRANT UPDATE (profile_id, privacy_epoch) ON workforce.agent_execution_sessions TO ai_purger;
GRANT DELETE ON workforce.agent_checkpoints TO ai_purger;
GRANT EXECUTE ON FUNCTION workforce.tenant(), workforce.stop_session(uuid, bigint, text) TO ai_purger;
SET ROLE ai_owner;
CREATE TABLE workforce.erasure_log (space_id uuid NOT NULL, request_id uuid NOT NULL, sessions_stopped integer NOT NULL, sessions_detached integer NOT NULL,
 checkpoints_deleted integer NOT NULL, erased_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, request_id));
ALTER TABLE workforce.erasure_log ENABLE ROW LEVEL SECURITY; ALTER TABLE workforce.erasure_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON workforce.erasure_log USING (space_id = workforce.tenant()) WITH CHECK (space_id = workforce.tenant());
GRANT SELECT, INSERT ON workforce.erasure_log TO ai_purger;
RESET ROLE;
SET ROLE ai_purger;
CREATE FUNCTION workforce.erase_subject(p_request uuid, p_profile uuid, p_conversations uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, workforce, pg_temp AS $$
DECLARE sid uuid := workforce.tenant(); s record; ids uuid[]; n_stop integer := 0; n_det integer; n_cp integer; BEGIN
 IF EXISTS (SELECT 1 FROM erasure_log WHERE space_id = sid AND request_id = p_request) THEN RETURN jsonb_build_object('replay', true); END IF;
 SELECT coalesce(array_agg(session_id), '{}') INTO ids FROM agent_execution_sessions
  WHERE space_id = sid AND (profile_id = p_profile OR conversation_id = ANY (coalesce(p_conversations, '{}')));
 FOR s IN SELECT session_id, state_version FROM agent_execution_sessions WHERE space_id = sid AND session_id = ANY (ids) AND state IN ('QUEUED','RUNNING','INTERRUPTED') LOOP
  PERFORM workforce.stop_session(s.session_id, s.state_version, 'CANCELLED'); n_stop := n_stop + 1;   -- fence++ : a running worker can no longer write
 END LOOP;
 UPDATE agent_execution_sessions SET profile_id = NULL, privacy_epoch = NULL WHERE space_id = sid AND session_id = ANY (ids) AND profile_id IS NOT NULL;
 GET DIAGNOSTICS n_det = ROW_COUNT;
 DELETE FROM agent_checkpoints WHERE space_id = sid AND session_id = ANY (ids);                      -- state-blob references (blob store is external)
 GET DIAGNOSTICS n_cp = ROW_COUNT;
 INSERT INTO erasure_log VALUES (sid, p_request, n_stop, n_det, n_cp);
 RETURN jsonb_build_object('sessions_stopped', n_stop, 'sessions_detached', n_det, 'checkpoints_deleted', n_cp); END $$;
RESET ROLE;

-- @@app4_sweep  (04:L21: no guest profiles in the corpus; accidental PII must be quarantined for review)
SET ROLE kb_owner;
CREATE TABLE kb.pii_review_queue (space_id uuid NOT NULL, request_id uuid NOT NULL, chunk_id uuid NOT NULL, finding text NOT NULL,
 found_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, request_id, chunk_id));
ALTER TABLE kb.pii_review_queue ENABLE ROW LEVEL SECURITY; ALTER TABLE kb.pii_review_queue FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON kb.pii_review_queue USING (space_id = kb.tenant()) WITH CHECK (space_id = kb.tenant());
CREATE FUNCTION kb.pii_sweep(p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, kb, pg_temp AS $$
DECLARE n integer; BEGIN
 INSERT INTO pii_review_queue (space_id, request_id, chunk_id, finding)
 SELECT c.space_id, p_request, c.chunk_id, CASE WHEN c.content ~ '\+[1-9][0-9 ]{7,17}[0-9]' THEN 'PHONE_PATTERN' ELSE 'EMAIL_PATTERN' END
 FROM document_chunks c WHERE c.space_id = kb.tenant()
  AND (c.content ~ '\+[1-9][0-9 ]{7,17}[0-9]' OR c.content ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
 ON CONFLICT DO NOTHING;
 SELECT count(*) INTO n FROM pii_review_queue WHERE space_id = kb.tenant() AND request_id = p_request;
 RETURN jsonb_build_object('suspect_chunks', n, 'raw_query_text_stored', false);   -- retrieval audit keeps only query_hmac (04:L351)
END $$;
RESET ROLE;

-- @@app2_saga_ext
CREATE FUNCTION guest_crm.erasure_recipients_for(p_request uuid) RETURNS TABLE (system_code text, outcome text) LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path = pg_catalog, guest_crm, pg_temp AS $$
 SELECT system_code, outcome FROM erasure_receipts WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND request_id = p_request ORDER BY system_code $$;
ALTER FUNCTION guest_crm.erasure_recipients_for(uuid) OWNER TO crm_bridge_owner;
-- Deployment grants the App 2 dossier leaves to provisioning (02:L744), so the privacy worker role can run erase_profile().
GRANT USAGE ON SCHEMA guest_crm TO guest_crm_privacy_maintenance;
GRANT SELECT, UPDATE, DELETE ON guest_crm.crm_profiles TO guest_crm_privacy_maintenance;
GRANT SELECT ON guest_crm.profile_aliases, guest_crm.profile_source_links, guest_crm.retention_policies TO guest_crm_privacy_maintenance;
GRANT SELECT, INSERT ON guest_crm.erasure_requests, guest_crm.erasure_receipts, guest_crm.crm_outbox, guest_crm.gdpr_audit_log TO guest_crm_privacy_maintenance;
GRANT SELECT ON guest_crm.erasure_recipient_registry TO guest_crm_privacy_maintenance;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA guest_crm TO guest_crm_privacy_maintenance;
CREATE FUNCTION guest_crm.replay_status(p_profile uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, guest_crm, pg_temp AS $$
 SELECT CASE WHEN EXISTS (SELECT 1 FROM erasure_requests WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND profile_id = p_profile) THEN 'ALREADY_ERASED'
             WHEN EXISTS (SELECT 1 FROM crm_profiles WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND id = p_profile) THEN 'PRESENT'
             ELSE 'ABSENT' END $$;
ALTER FUNCTION guest_crm.replay_status(uuid) OWNER TO guest_crm_privacy_maintenance;
CREATE FUNCTION guest_crm.erase_for_saga(p_profile uuid) RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, guest_crm, pg_temp AS $$
 SELECT guest_crm.erase_profile(nullif(current_setting('app.space_id', true), '')::uuid, p_profile, 'rtbf') $$;
ALTER FUNCTION guest_crm.erase_for_saga(uuid) OWNER TO guest_crm_privacy_maintenance;

-- @@platform_saga  (orchestrated, forward-only saga: App 2 is the system of record; the kernel delivers, fans out, retries, escalates)
GRANT USAGE ON SCHEMA platform, contact_center, guest_crm, ops, kb, workforce TO platform_saga;
GRANT CREATE ON SCHEMA platform TO platform_saga;
GRANT EXECUTE ON FUNCTION contact_center.erase_subject(uuid, uuid[]), contact_center.subject_conversations(uuid[]), ops.erase_subject(uuid, uuid, uuid[]),
 workforce.erase_subject(uuid, uuid, uuid[]), kb.pii_sweep(uuid), guest_crm.erasure_recipients_for(uuid),
 guest_crm.record_erasure_receipt(uuid, text, text, text), guest_crm.erase_for_saga(uuid), guest_crm.replay_status(uuid), ops.tenant(), kb.tenant(), workforce.tenant() TO platform_saga;
GRANT SELECT ON platform.spaces TO platform_saga;
CREATE POLICY saga_registry_read ON platform.spaces FOR SELECT TO platform_saga USING (true);
SET ROLE platform_saga;
CREATE TABLE platform.erasure_commands (
 space_id uuid NOT NULL, request_id uuid NOT NULL, recipient text NOT NULL, profile_id uuid NOT NULL, privacy_epoch text NOT NULL,
 source_subjects jsonb NOT NULL, conversations uuid[] NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','FAILED')),
 attempts integer NOT NULL DEFAULT 0, last_error text, outcome text, detail_code text, result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), deadline timestamptz NOT NULL DEFAULT clock_timestamp() + interval '7 days', completed_at timestamptz,
 PRIMARY KEY (space_id, request_id, recipient));
CREATE TABLE platform.erasure_ledger (                      -- pseudonymous anti-resurrection ledger; must be shipped OUTSIDE the database (see restore)
 space_id uuid NOT NULL, request_id uuid NOT NULL, profile_id uuid NOT NULL, privacy_epoch text NOT NULL, source_subjects jsonb NOT NULL,
 conversations uuid[] NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY (space_id, request_id));
CREATE TABLE platform.erasure_faults (recipient text PRIMARY KEY, fail_until_attempt integer NOT NULL);   -- test-only fault injection
CREATE TABLE platform.restore_state (space_id uuid PRIMARY KEY, traffic_enabled boolean NOT NULL DEFAULT true, note text);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['erasure_commands','erasure_ledger','restore_state'] LOOP
 EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY', t); EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY', t);
 EXECUTE format('CREATE POLICY tenant_scope ON platform.%I USING (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid) WITH CHECK (space_id = nullif(current_setting(''app.space_id'', true), '''')::uuid)', t);
END LOOP; END $$;
-- Mesh handler for crm ProfileErasureRequestedEvent: resolve App 1 conversations once (App 3 / App 5 cannot identify the
-- guest alone), then fan out one command per registered recipient and write the ledger - all idempotent.
CREATE FUNCTION platform.enqueue_erasure(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE d jsonb := p_env->'data'; sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; subj uuid[]; convs uuid[]; BEGIN
 SELECT coalesce(array_agg((x->>'subject_id')::uuid), '{}') INTO subj FROM jsonb_array_elements(d->'source_subjects') x WHERE x->>'source' = 'contact_center';
 convs := contact_center.subject_conversations(subj);
 INSERT INTO platform.erasure_commands (space_id, request_id, recipient, profile_id, privacy_epoch, source_subjects, conversations)
 SELECT sid, (d->>'request_id')::uuid, r.system_code, (d->>'profile_id')::uuid, d->>'privacy_epoch', d->'source_subjects', convs
 FROM guest_crm.erasure_recipients_for((d->>'request_id')::uuid) r WHERE r.outcome = 'pending'
 ON CONFLICT DO NOTHING;
 INSERT INTO platform.erasure_ledger (space_id, request_id, profile_id, privacy_epoch, source_subjects, conversations)
 VALUES (sid, (d->>'request_id')::uuid, (d->>'profile_id')::uuid, d->>'privacy_epoch', d->'source_subjects', convs) ON CONFLICT DO NOTHING;
END $$;
-- One recipient, one transaction, under that recipient's own definer role. Returns (outcome, detail_code, result).
CREATE FUNCTION platform.execute_erasure_command(p_request uuid, p_recipient text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE c platform.erasure_commands; r jsonb; subj uuid[]; f integer; BEGIN
 SELECT * INTO STRICT c FROM platform.erasure_commands WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND request_id = p_request AND recipient = p_recipient FOR UPDATE;
 SELECT fail_until_attempt INTO f FROM platform.erasure_faults WHERE recipient = p_recipient;
 IF f IS NOT NULL AND c.attempts < f THEN RAISE EXCEPTION 'injected transient failure for % (attempt %)', p_recipient, c.attempts + 1; END IF;
 SELECT coalesce(array_agg((x->>'subject_id')::uuid), '{}') INTO subj FROM jsonb_array_elements(c.source_subjects) x WHERE x->>'source' = 'contact_center';
 CASE p_recipient
  WHEN 'contact_center' THEN r := jsonb_build_object('outcome', 'erased', 'result', contact_center.erase_subject(p_request, subj));
  WHEN 'operations' THEN r := jsonb_build_object('outcome', 'erased', 'result', ops.erase_subject(p_request, c.profile_id, c.conversations));
  WHEN 'workforce' THEN r := jsonb_build_object('outcome', 'erased', 'result', workforce.erase_subject(p_request, c.profile_id, c.conversations));
  WHEN 'kb' THEN r := kb.pii_sweep(p_request);
   r := CASE WHEN (r->>'suspect_chunks')::integer = 0 THEN jsonb_build_object('outcome', 'erased', 'detail', 'NOT_HELD', 'result', r)
             ELSE jsonb_build_object('outcome', 'failed', 'detail', 'PII_SUSPECTED_REVIEW', 'result', r) END;
  WHEN 'cache_search' THEN r := jsonb_build_object('outcome', 'erased', 'detail', 'NO_CACHE_DEPLOYED');
  WHEN 'object_store' THEN r := jsonb_build_object('outcome', 'erased', 'detail', 'REFS_TOMBSTONED_BY_APPS');
  WHEN 'backup_ledger' THEN
   IF NOT EXISTS (SELECT 1 FROM platform.erasure_ledger WHERE space_id = c.space_id AND request_id = p_request) THEN RAISE EXCEPTION 'ledger entry missing'; END IF;
   r := jsonb_build_object('outcome', 'lawful_restriction', 'detail', 'BACKUP_ROTATION_WINDOW');
  ELSE RAISE EXCEPTION 'NO_ADAPTER for recipient %', p_recipient;
 END CASE;
 PERFORM guest_crm.record_erasure_receipt(p_request, p_recipient, r->>'outcome', r->>'detail');
 UPDATE platform.erasure_commands SET status = CASE WHEN r->>'outcome' = 'failed' THEN 'FAILED' ELSE 'DONE' END, outcome = r->>'outcome', detail_code = r->>'detail',
  result = r->'result', completed_at = clock_timestamp(), attempts = attempts + 1 WHERE space_id = c.space_id AND request_id = p_request AND recipient = p_recipient;
 RETURN r; END $$;
CREATE FUNCTION platform.fail_erasure_command(p_request uuid, p_recipient text, p_error text, p_max integer) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE a integer; BEGIN
 UPDATE platform.erasure_commands SET attempts = attempts + 1, last_error = p_error
  WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND request_id = p_request AND recipient = p_recipient RETURNING attempts INTO a;
 IF a >= p_max THEN
  PERFORM guest_crm.record_erasure_receipt(p_request, p_recipient, 'failed', 'ADAPTER_ERROR');
  UPDATE platform.erasure_commands SET status = 'FAILED', outcome = 'failed', detail_code = 'ADAPTER_ERROR', completed_at = clock_timestamp()
   WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND request_id = p_request AND recipient = p_recipient;
  RETURN 'FAILED'; END IF;
 RETURN 'RETRY'; END $$;
CREATE FUNCTION platform.saga_spaces() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 SELECT id FROM platform.spaces WHERE lifecycle <> 'OFFBOARDED' ORDER BY id $$;
CREATE FUNCTION platform.pending_commands() RETURNS TABLE (request_id uuid, recipient text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 SELECT request_id, recipient FROM platform.erasure_commands WHERE space_id = nullif(current_setting('app.space_id', true), '')::uuid AND status = 'PENDING'
 ORDER BY created_at, recipient $$;
-- Restore: re-apply shipped ledger entries into a database restored from a pre-erasure snapshot, before traffic is enabled.
CREATE FUNCTION platform.replay_erasure_ledger(p_entries jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE e jsonb; sid uuid := nullif(current_setting('app.space_id', true), '')::uuid; out jsonb := '[]'; nr uuid; st text; BEGIN
 FOR e IN SELECT x FROM jsonb_array_elements(p_entries) x WHERE (x->>'space_id')::uuid = sid LOOP
  st := guest_crm.replay_status((e->>'profile_id')::uuid);
  nr := CASE WHEN st = 'PRESENT' THEN guest_crm.erase_for_saga((e->>'profile_id')::uuid) END;   -- App 2 re-fences, re-suppresses, re-emits the event
  out := out || jsonb_build_object('original_request', e->>'request_id', 'status', st, 'replayed_request', nr);
 END LOOP;
 RETURN out; END $$;
RESET ROLE;
REVOKE ALL ON FUNCTION platform.enqueue_erasure(jsonb, jsonb), platform.execute_erasure_command(uuid, text), platform.fail_erasure_command(uuid, text, text, integer),
 platform.replay_erasure_ledger(jsonb), platform.saga_spaces(), platform.pending_commands() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.enqueue_erasure(jsonb, jsonb) TO mesh_owner;
GRANT USAGE ON SCHEMA platform TO mesh_owner;

-- @@saga_worker  (R1-style: one backend, one transaction per command, failure isolated per recipient)
CREATE PROCEDURE platform.run_erasure_commands(p_worker text, p_max_attempts integer DEFAULT 3, p_cycles integer DEFAULT 10) LANGUAGE plpgsql AS $$
DECLARE sp uuid; spaces uuid[]; reqs uuid[]; recips text[]; err text; cyc integer := 0; work integer; BEGIN
 COMMIT;
 LOOP
  cyc := cyc + 1; work := 0;
  spaces := ARRAY(SELECT platform.saga_spaces()); COMMIT;
  FOREACH sp IN ARRAY spaces LOOP
   PERFORM set_config('app.space_id', sp::text, true);
   SELECT coalesce(array_agg(c.request_id), '{}'), coalesce(array_agg(c.recipient), '{}') INTO reqs, recips FROM platform.pending_commands() c; COMMIT;
   FOR i IN 1 .. cardinality(reqs) LOOP
    PERFORM set_config('app.space_id', sp::text, true);
    BEGIN PERFORM platform.execute_erasure_command(reqs[i], recips[i]); err := NULL;
    EXCEPTION WHEN OTHERS THEN err := SQLERRM; END;
    COMMIT;
    IF err IS NOT NULL THEN
     PERFORM set_config('app.space_id', sp::text, true);
     PERFORM platform.fail_erasure_command(reqs[i], recips[i], err, p_max_attempts); COMMIT;
    END IF;
    work := work + 1;
   END LOOP;
  END LOOP;
  EXIT WHEN work = 0 OR cyc >= p_cycles;
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA platform TO platform_relay;
GRANT EXECUTE ON FUNCTION platform.execute_erasure_command(uuid, text), platform.fail_erasure_command(uuid, text, text, integer), platform.saga_spaces(),
 platform.pending_commands(), platform.replay_erasure_ledger(jsonb) TO platform_relay;

-- @@journey  (bridges the cross-app guest journey needs: App 3 ingest from the mesh; App 1 task-status consumer, 01:L2408)
SET ROLE ops_owner;
CREATE FUNCTION ops.mesh_ingest(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ops, pg_temp AS $$
DECLARE pol uuid; BEGIN
 SELECT policy_id INTO pol FROM task_sla_policies WHERE space_id = tenant() AND category = p_env->'data'->>'category'
  AND priority = upper(p_env->'data'->>'priority') ORDER BY policy_id LIMIT 1;
 IF pol IS NULL THEN RAISE EXCEPTION 'no SLA policy for % / %', p_env->'data'->>'category', p_env->'data'->>'priority'; END IF;
 PERFORM ingest_request(p_env, encode(sha256(convert_to(p_env::text, 'UTF8')), 'hex'), pol, false, p_env->'data'->>'category');
END $$;
RESET ROLE;
GRANT EXECUTE ON FUNCTION ops.mesh_ingest(jsonb, jsonb) TO mesh_owner;
GRANT USAGE ON SCHEMA ops TO mesh_owner;
GRANT SELECT, UPDATE (status, task_id, detail, version) ON contact_center.guest_requests TO cc_bridge_owner;
GRANT SELECT, INSERT ON contact_center.outbox_events TO cc_bridge_owner;
GRANT UPDATE (next_event_seq) ON contact_center.conversations TO cc_bridge_owner;
SET ROLE cc_bridge_owner;
CREATE FUNCTION contact_center.apply_task_status(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, contact_center, pg_temp AS $$
DECLARE g guest_requests; seq bigint := (p_env->>'task_seq')::bigint; last bigint; BEGIN
 SELECT * INTO g FROM guest_requests WHERE space_id = (p_env->>'space_id')::uuid AND id = (p_env->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown request %', p_env->>'request_id'; END IF;
 last := coalesce((g.detail->>'last_task_seq')::bigint, 0);
 IF seq <= last OR g.status = 'completed' THEN RETURN; END IF;                         -- stale or terminal: ignore (01:L2660)
 UPDATE guest_requests SET status = p_env->>'status', task_id = p_env->>'task_id',
  detail = detail || jsonb_build_object('last_task_seq', seq, 'evidence_refs', p_env->'evidence_refs') WHERE space_id = g.space_id AND id = g.id;
 INSERT INTO outbox_events (space_id, conversation_id, event_seq, event_type, dedupe_key, correlation_id, causation_id, payload)
 VALUES (g.space_id, g.conversation_id, 0, 'GuestRequestStatusChangedEvent', 'status:' || (p_env->>'event_id'), gen_random_uuid(), (p_env->>'event_id')::uuid,
   jsonb_build_object('request_id', g.id, 'status', p_env->>'status', 'task_seq', p_env->>'task_seq'));
END $$;
RESET ROLE;
GRANT EXECUTE ON FUNCTION contact_center.apply_task_status(jsonb, jsonb) TO mesh_owner;
GRANT USAGE ON SCHEMA contact_center TO mesh_owner;
```

## Appendix B — mesh epoch-order patch

Patch to the Sub-B mesh fixture found by Gate 6 (§4.1): App 4 claims follow property-wide epoch order.

<!-- artifact: mesh_patch.sql -->
```sql
-- EXPERIMENTAL Sub-Component D patch to the Sub-B mesh fixture: App 4 claims follow the property-wide knowledge_epoch order.
-- Found by Gate 6: per-item head-of-line let epochs 9-12 overtake the epoch-7 supersession pair, fencing App 1 (Sub-C A.23 path).

-- @@mesh_patch
CREATE OR REPLACE FUNCTION mesh.claim_kb(p_batch integer, p_lease interval, p_naive boolean DEFAULT false) RETURNS SETOF mesh.lease_row LANGUAGE plpgsql AS $$
DECLARE g text; n integer := 0;
BEGIN
 FOR g IN
  SELECT e FROM (SELECT DISTINCT o.payload->>'knowledge_epoch' AS e FROM kb.storage_outbox o
   WHERE o.published_at IS NULL AND o.available_at <= clock_timestamp()) s ORDER BY e::bigint
 LOOP
  EXIT WHEN n >= p_batch;
  CONTINUE WHEN NOT pg_try_advisory_xact_lock(101, hashtext(current_setting('app.space_id', true) || ':kb-epoch:' || g));
  -- Sub-D patch: App 4's knowledge_epoch is a property-wide total order that consumers apply in sequence (Sub-C CR1),
  -- so no group may be claimed while an earlier-epoch event of the same property is still unpublished.
  CONTINUE WHEN EXISTS (SELECT 1 FROM kb.storage_outbox e WHERE e.published_at IS NULL
   AND (e.payload->>'knowledge_epoch')::bigint < g::bigint);
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
```

## Appendix C — kernel revision v3

Kernel projection revision: App 1 operators are disabled when the capability or membership is revoked (closes Sub-A gap 3.16 with Sub-C disabled_at).

<!-- artifact: kernel_v3.sql -->
```sql
-- EXPERIMENTAL kernel revision v3 = Sub-C kernel_v2 + App 1 revocation (Sub-A gap 3.16 closed with Sub-C's disabled_at).
-- Applied after kernel_experiment.sql, bridges.sql and kernel_v2.sql. Signature-preserving replacement; nothing locked touched.

-- @@kernel_v3
GRANT SELECT (disabled_at, disabled_reason), UPDATE (disabled_at, disabled_reason) ON contact_center.participants TO platform_provisioner;

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
  ON CONFLICT (space_id, id) DO UPDATE SET display_name = EXCLUDED.display_name, disabled_at = NULL, disabled_reason = NULL;
 ELSE                                    -- capability or membership gone: the App 1 identity stops being able to act (CR4-as-briefed / F4)
  UPDATE contact_center.participants SET disabled_at = clock_timestamp(), disabled_reason = 'membership revoked'
   WHERE space_id = p_space AND id = p_member AND kind = 'operator' AND disabled_at IS NULL;
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
```

## Appendix D — Sub-D verification harness

Sub-D harness: G6 journey, saga, restore, G2, G3, G5, G7.

<!-- artifact: test_saga.py -->
```python
"""Sub-Component D harness: Gate 6 journey -> RTBF saga -> restore/anti-resurrection, plus Gates 2, 3, 5, 7.
Runs on clones of mesh_base (locked apps + Sub-C bridges + saga app layer + Sub-A kernel + real traffic) with
mesh_experiment.sql, kernel_v2, kernel_v3 and saga_platform.sql installed. Run from the repository root."""
import subprocess, json, re, uuid, hashlib, sys, time, os, copy, threading, random
from pathlib import Path

W = Path(__file__).resolve().parent.parent
SOCK, PORT = str(W / 'socket'), '55466'
PGBIN = os.environ.get('PGBIN', '/tmp/kernel-iam.qigQ4X/pg/lib/postgresql/16/bin')
SP = json.loads((W / 'mesh' / 'spaces.json').read_text()); S1, KV = SP['S1'], SP['KV']
RESULTS, EVIDENCE = [], {}
def uid(n): return str(uuid.UUID(int=n))
STAFF, OTHER, SUPERVISOR, POLICY, ROOM = uid(20), uid(21), uid(22), uid(40), uid(30)
EDITOR, REVIEWER = uid(2), uid(3)
LAYERS = [W / 'mesh' / 'mesh_experiment.sql', W / 'saga' / 'mesh_patch.sql', W / 'bridges' / 'kernel_v2.sql', W / 'saga' / 'kernel_v3.sql', W / 'saga' / 'saga_platform.sql']
GUEST_NAME, GUEST_PHONE, MSG_TEXT, PREF = 'Nino Kakhetelashvili (synthetic)', '+995555123456', 'Could you send 2 extra towels to room 12 before our Kindzmarauli tasting?', 'kindzmarauli_cellar_tour'
MARKERS = [GUEST_NAME, GUEST_PHONE, 'extra towels to room 12', PREF]

def psql(sql, db, user=None, check=True, app=None):
    env = dict(os.environ, PGAPPNAME=app) if app else None
    cmd = ['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-F', '|'] + (['-U', user] if user else [])
    r = subprocess.run(cmd, input=sql, text=True, capture_output=True, env=env)
    if check and r.returncode: raise RuntimeError(f'{db}: {r.stderr}\n--- SQL ---\n{sql[:1500]}')
    return r
def val(sql, db): return psql(sql, db).stdout.strip()
def lit(x): return "'" + str(x).replace("'", "''") + "'"
def q(sql, db, role=None, space=None, actor=None, staff=None, fail=False, iso=None):
    pre = ['BEGIN' + (f' ISOLATION LEVEL {iso}' if iso else '') + ';']
    if space: pre.append(f"SET LOCAL app.space_id = '{space}';")
    if actor: pre.append(f"SET LOCAL app.actor_id = '{actor}';")
    if staff: pre.append(f"SET LOCAL app.staff_id = '{staff}';")
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
def fresh(db, template='mesh_base', layers=True, mesh_patch=True):
    psql(f'DROP DATABASE IF EXISTS {db};', 'postgres'); psql(f'CREATE DATABASE {db} TEMPLATE {template};', 'postgres')
    if layers:
        for f in LAYERS:
            if mesh_patch or f.name != 'mesh_patch.sql': psql(f.read_text(), db)
        psql("""DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mesh_relay_login') THEN CREATE ROLE mesh_relay_login LOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
          GRANT platform_relay TO mesh_relay_login;""", db)
def relay(db, sources, cycles=6, worker='r', background=False, lease='30 seconds'):
    cmd = ['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-U', 'mesh_relay_login', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', 'SET ROLE platform_relay',
           '-c', f"CALL mesh.r1_run('{worker}', ARRAY[{','.join(repr(s) for s in sources)}], 10, '{lease}', {cycles}, 1);"]
    if background: return subprocess.Popen(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=dict(os.environ, PGAPPNAME=f'relay-{worker}'))
    r = subprocess.run(cmd, text=True, capture_output=True, env=dict(os.environ, PGAPPNAME=f'relay-{worker}'))
    if r.returncode: raise RuntimeError(r.stderr)
def saga_worker(db, cycles=10, max_attempts=3):
    r = subprocess.run(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-U', 'mesh_relay_login', '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', 'SET ROLE platform_relay',
                        '-c', f"CALL platform.run_erasure_commands('saga', {max_attempts}, {cycles});"], text=True, capture_output=True)
    if r.returncode: raise RuntimeError(r.stderr)
def validator(sid):
    from referencing import Registry, Resource
    from jsonschema import Draft202012Validator, FormatChecker
    reg = Registry(); ids = {}
    for p in list((W / 'app5' / 'contracts').glob('*.json')) + list((W / 'bridges' / 'contracts').glob('*.json')):
        o = json.loads(p.read_text())
        if isinstance(o, dict) and '$id' in o and '$schema' in o: reg = reg.with_resource(o['$id'], Resource.from_contents(o)); ids[o['$id']] = o
    return Draft202012Validator(ids[sid], registry=reg, format_checker=FormatChecker())
def errs(v, o): return [e.message for e in v.iter_errors(o)]
def residual_pii(db, markers=MARKERS):
    """Scan every row of every table in every platform schema (as superuser) for the guest's plaintext markers."""
    tabs = val("""SELECT string_agg(n.nspname||'.'||c.relname, ',') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind='r' AND n.nspname IN ('contact_center','guest_crm','ops','kb','workforce','platform','mesh','mesh_test');""", db).split(',')
    conds = ' OR '.join(f"strpos(t::text, {lit(m)}) > 0" for m in markers)
    hits = {}
    for t in tabs:
        n = int(val(f"SELECT count(*) FROM {t} t WHERE {conds};", db))
        if n: hits[t] = n
    return hits, len(tabs)

# =====================================================================================================
# GATE 6 - cross-app guest journey (message -> CRM preference -> RAG citation -> task -> attestation)
# =====================================================================================================
def journey(db):
    J = {}
    # knowledge projection for App 1 (Sub-C CR1) and journey routes over the Sub-B mesh
    psql(f"""INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{REVIEWER}','operator','Knowledge reviewer (projected)','reviewer');
      CREATE FUNCTION contact_center.mesh_policy_consumer(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $f$ SELECT contact_center.apply_policy_events(p_env) $f$;
      GRANT EXECUTE ON FUNCTION contact_center.mesh_policy_consumer(jsonb,jsonb), contact_center.apply_policy_events(jsonb) TO mesh_owner;
      INSERT INTO mesh.routes SELECT 'kb', t, 'contact_center', 'contact_center.mesh_policy_consumer(jsonb,jsonb)'::regprocedure FROM unnest(ARRAY['PolicyApprovedEvent','PolicySupersededEvent','PolicyArchivedEvent']) t;
      INSERT INTO mesh.routes VALUES ('cc','GuestRequestDetectedEvent','ops','ops.mesh_ingest(jsonb,jsonb)'::regprocedure),
                                     ('ops','TaskStatusChangedEvent','contact_center','contact_center.apply_task_status(jsonb,jsonb)'::regprocedure),
                                     ('crm','ProfileErasureRequestedEvent','platform','platform.enqueue_erasure(jsonb,jsonb)'::regprocedure);""", db)
    relay(db, ['kb', 'crm', 'cc', 'ops', 'ai'], cycles=4)          # drain the pre-existing real traffic (kb events project into App 1)
    g, ai, ch, conv, chap, res, ident = (str(uuid.uuid4()) for _ in range(7))
    q(f"""SET LOCAL search_path = contact_center, pg_catalog;
      INSERT INTO contact_center.channels(space_id,id,kind,provider_account_id,credential_ref) VALUES('{S1}','{ch}','whatsapp','acct-journey','secret://whatsapp/journey');
      INSERT INTO contact_center.participants(space_id,id,kind,display_name,preferred_locale) VALUES('{S1}','{g}','guest',{lit(GUEST_NAME)},'ka'),('{S1}','{ai}','ai','Mia (AI)',NULL);
      INSERT INTO contact_center.participant_identities(space_id,participant_id,channel_id,external_subject,normalized_phone,verified_at,verification_method)
        VALUES('{S1}','{g}','{ch}','whatsapp:{GUEST_PHONE}','{GUEST_PHONE}',now(),'pms_match');
      INSERT INTO contact_center.reservations(space_id,id,pms_system,pms_reservation_id,primary_guest_id,arrival_at,departure_at,status,room_type,room_number,special_requests,source_version,source_updated_at)
        VALUES('{S1}','{res}','fixture-pms','R-JOURNEY','{g}',now()-interval '1 day',now()+interval '2 days','in_house','deluxe','12','["late checkout for {GUEST_NAME}"]','v3',now());
      INSERT INTO contact_center.conversations(space_id,id,guest_id,reservation_id,binding_status) VALUES('{S1}','{conv}','{g}','{res}','verified');
      INSERT INTO contact_center.conversation_participants VALUES('{S1}','{conv}','{g}'),('{S1}','{conv}','{ai}');
      INSERT INTO contact_center.conversation_channels(space_id,conversation_id,channel_id,external_thread_id,recipient_subject) VALUES('{S1}','{conv}','{ch}','thr-journey','whatsapp:{GUEST_PHONE}');
      INSERT INTO contact_center.conversation_chapters(space_id,id,conversation_id,title,journey_stage,topic,start_seq) VALUES('{S1}','{chap}','{conv}','Stay','in_stay','service',1);""", db, space=S1)
    msg = q(f"""INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,provider_message_id,provider_event_key,control_version,occurred_at)
      VALUES('{S1}','{conv}','{chap}','{ch}','{g}',0,'inbound',{lit(MSG_TEXT)},'wamid-journey','evt-journey',0,now()) RETURNING id;""", db, space=S1)
    J.update(guest=g, ai=ai, channel=ch, conv=conv, chapter=chap, res=res, msg=msg)
    # App 2: verified link, permission, explicit preference; Layer-1 read
    prof = q(f"INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at,display_name,locale) VALUES('{S1}','visitor',now()+interval '7 days',{lit(GUEST_NAME)},'ka') RETURNING id;", db, space=S1)
    perm = q(f"""INSERT INTO guest_crm.profile_source_links(space_id,profile_id,source,source_subject) VALUES('{S1}','{prof}','contact_center','{g}');
      INSERT INTO guest_crm.processing_permissions(space_id,profile_id,purpose,basis,notice_version,proof_ref,granted_at,expires_at)
        VALUES('{S1}','{prof}','service_memory','contract','notice-v1','proof:stay:R-JOURNEY',now(),now()+interval '30 days') RETURNING id;""", db, space=S1)
    q(f"""INSERT INTO guest_crm.guest_preferences(space_id,profile_id,domain,scope,document,evidence_kind,source_message_ids,confidence,status,permission_id,observed_at,expires_at)
      VALUES('{S1}','{prof}','wine_experience','persistent','{{"tour_interest":"{PREF}"}}','guest_explicit',ARRAY['{msg}']::uuid[],0.95,'active','{perm}',now(),now()+interval '30 days');""", db, space=S1)
    ctx = q(f"""SELECT count(*)||'|'||coalesce((SELECT string_agg(document->>'tour_interest', ',') FROM guest_crm.guest_preferences p WHERE p.profile_id=c.id AND status='active'),'-')
      FROM guest_crm.active_profile_context c WHERE c.id='{prof}' GROUP BY c.id;""", db, space=S1)
    J['profile'] = prof
    ok('G6.1 message recorded in App 1 and an explicit, permission-backed wine preference linked in App 2; the Layer-1 context read returns it', ctx == f'1|{PREF}', ctx)
    vec = '[' + ','.join('1' if k == 1 else '0' for k in range(384)) + ']'
    cit = q(f"SELECT knowledge_item_id||'|'||policy_version FROM kb.guest_search('tasting cancellation', 'en', '{vec}'::vector, 'fixture-384-v1', 3) LIMIT 1;", db, role='kb_guest', space=S1)
    item, ver = cit.split('|')
    servable = q(f"SELECT contact_center.evidence_servable('{item}', {ver}, now());", db, space=S1)
    evid = [{'knowledge_item_id': item, 'policy_version': ver, 'valid_at': val("SELECT to_json(now())#>>'{}';", db)}]
    reply = q(f"""INSERT INTO contact_center.messages(space_id,conversation_id,chapter_id,channel_id,sender_id,seq,direction,body,client_command_key,control_version,occurred_at,payload)
      VALUES('{S1}','{conv}','{chap}','{ch}','{ai}',0,'outbound','Towels are on their way. Tastings can be cancelled free of charge up to 24 hours before.','cmd-journey-ai',0,now(),{lit(json.dumps({'policy_evidence': evid}))}::jsonb) RETURNING id;""", db, space=S1)
    ok('G6.2 App 4 guest_search (real hybrid retrieval, guest audience) cites an approved policy; the App 1 dispatch gate (Sub-C CR1 projection) confirms the evidence is servable; AI reply recorded with it',
       bool(item) and servable == 't' and bool(reply), {'item': item[:8], 'version': ver, 'servable': servable})
    # App 1 service step: the extracted request + its outbox event (App 1 emits this from its request service)
    ex = json.loads((W / 'app3' / 'ops-contracts' / 'inbound.example.json').read_text())['data']
    rid = str(uuid.uuid4())
    data = copy.deepcopy(ex); data.update({'request_id': rid, 'request_version': '1', 'chapter_id': chap, 'reservation_id': res, 'source_message_ids': [msg],
        'summary': 'Deliver 2 extra towels to room 12', 'room_number': '12', 'requested_quantity': 2, 'guest_locale': 'ka'})
    q(f"""INSERT INTO contact_center.guest_requests(space_id,id,conversation_id,chapter_id,reservation_id,source_message_id,intent_key,category,summary,priority,status,assigned_team,due_at)
      VALUES('{S1}','{rid}','{conv}','{chap}','{res}','{msg}','towels','housekeeping','Deliver 2 extra towels to room 12','{data['priority']}','dispatched','{data['assigned_team']}','{data['due_at']}');
      INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload)
      VALUES('{S1}','{conv}',0,'GuestRequestDetectedEvent','request:{rid}:1',gen_random_uuid(),{lit(json.dumps(data))}::jsonb);""", db, space=S1)
    env = json.loads(q(f"SELECT mesh.envelope(p) FROM mesh.pending('cc') p WHERE p.payload->>'request_id'='{rid}';", db, role='cc_transport', space=S1))
    v_out = validator('https://schemas.smartstay.example/contact-center/outbox-event/1')
    relay(db, ['cc', 'ops'], cycles=3)
    task = q(f"SELECT task_id||'|'||status FROM ops.operational_tasks WHERE request_id='{rid}';", db, space=S1).split('|')
    ok('G6.3 the GuestRequestDetectedEvent envelope validates (App 1 outbox-event/1) and the R1 relay delivers it to the real App 3 ingest_request: task QUEUED',
       not errs(v_out, env) and task[1] == 'QUEUED', {'errors': errs(v_out, env)[:2], 'task': task[0][:8]})
    tid = task[0]; J.update(request=rid, task=tid)
    def act(action, version, **extra):
        tok = q(f"SELECT ops.issue_action_token('{tid}','{action}',{version});", db, role='ops_human', space=S1, staff=STAFF)
        body = {'action': action, 'expected_version': str(version), 'action_token': tok, **extra}
        return json.loads(q(f"SELECT ops.staff_action('{tid}','{uuid.uuid4()}',{lit(json.dumps(body))}::jsonb);", db, role='ops_human', space=S1, staff=STAFF))
    act('ClaimTask', 1); act('StartTask', 2)
    ev = str(uuid.uuid4())
    q(f"""INSERT INTO ops.completion_evidence(space_id,evidence_id,task_id,staff_id,assignment_id,task_version,request_version,room_cycle,kind,object_ref,sha256,checklist_version,verified_at,expires_at)
      SELECT '{S1}','{ev}','{tid}','{STAFF}',a.assignment_id,t.state_version,t.request_version,t.room_cycle,'PHOTO','objects://evidence/journey.jpg','{'e' * 64}','towels-v1',now(),now()+interval '30 days'
      FROM ops.operational_tasks t JOIN ops.task_assignments a ON a.task_id=t.task_id AND a.released_at IS NULL WHERE t.task_id='{tid}';""", db, space=S1)
    done = act('AttestCompleted', 3, statement='I personally completed and checked this hotel service.', completion_evidence_ref=ev)
    relay(db, ['ops', 'cc'], cycles=3)
    cbs = [json.loads(x) for x in q(f"SELECT payload FROM ops.task_outbox WHERE task_id='{tid}' AND event_type='TaskStatusChangedEvent' ORDER BY task_seq;", db, space=S1).splitlines()]
    v_ts = validator('https://schemas.smartstay.example/contact-center/task-status/1')
    proj = q(f"SELECT status||'|'||(detail->>'last_task_seq')||'|'||(detail->'evidence_refs'->>0) FROM contact_center.guest_requests WHERE id='{rid}';", db, space=S1).split('|')
    ok('G6.4 staff claim -> start -> human attestation completes the task; 3 callbacks validate against task-status/1 and the App 1 projection reaches "completed" with the evidence reference',
       done['state'] == 'COMPLETED' and [c['status'] for c in cbs] == ['accepted', 'in_progress', 'completed'] and all(not errs(v_ts, c) for c in cbs)
       and proj[0] == 'completed' and proj[1] == '3' and proj[2] == f'evidence:{ev}', {'callbacks': [c['status'] for c in cbs], 'app1': proj})
    lin = q(f"SELECT string_agg(l.source||':'||l.depth||':'||l.how, ',' ORDER BY l.depth) FROM mesh.lineage l WHERE l.correlation_id = (SELECT x.correlation_id FROM mesh.lineage x JOIN contact_center.outbox_events o ON o.id=x.event_id WHERE o.payload->>'request_id'='{rid}' AND o.event_type='GuestRequestDetectedEvent');", db)
    ok('G6.5 the causal chain stays shallow (request depth 0 -> task queued depth 1); no event exceeded depth 2', lin.startswith('cc:0:ROOT,ops:1:CAPTURE') and max(int(x.split(':')[1]) for x in lin.split(',')) <= 2, lin)
    # App 5: an interrupted agent session for this conversation, holding the profile, with checkpoint state references
    g5 = val(f"SELECT graph_id||'|'||version||'|'||entry_node FROM workforce.agent_graph_definitions WHERE space_id='{S1}' AND state='ACTIVE' LIMIT 1;", db).split('|')
    sess = str(uuid.uuid4())
    psql(f"""INSERT INTO workforce.agent_execution_sessions(space_id,session_id,command_id,request_sha256,graph_id,graph_version,conversation_id,chapter_id,generation_id,
        control_version,binding_version,last_message_seq,profile_id,privacy_epoch,context_valid_until,knowledge_epoch,state,current_node,budget_micro_usd,deadline)
      VALUES('{S1}','{sess}',gen_random_uuid(),'{'a' * 64}','{g5[0]}',{g5[1]},'{conv}','{chap}',gen_random_uuid(),0,0,2,'{prof}',1,now()+interval '1 hour',2,'INTERRUPTED','{g5[2]}',5000,now()+interval '10 minutes');
      INSERT INTO workforce.agent_checkpoints(space_id,session_id,seq,node_key,state_object_id,state_sha256,expires_at)
      VALUES('{S1}','{sess}',1,'{g5[2]}',gen_random_uuid(),'{'b' * 64}',now()+interval '1 hour'),('{S1}','{sess}',2,'{g5[2]}',gen_random_uuid(),'{'c' * 64}',now()+interval '1 hour');""", db)
    J['session'] = sess
    q(f"SELECT contact_center.change_control('{S1}','{conv}',0,'RESOLVED','{ai}',NULL,'Guest thanked us');", db, space=S1)
    man = json.loads(q(f"SELECT contact_center.resolved_snapshot_manifest('{conv}', 1);", db, space=S1))
    ok('G6.6 the conversation resolves and App 1 freezes a resolved-snapshot manifest for CRM extraction (Sub-C CR2) - the journey is complete end to end',
       not errs(validator('https://schemas.smartstay.example/guest-crm/resolved-snapshot-manifest/1'), man), man['chapters'][0]['through_seq'])
    hits, n = residual_pii(db)
    J['pii_before'] = hits
    ok('G6.7 before erasure the guest\'s plaintext is present across the stack (baseline for the erasure proof)', len(hits) >= 5, {'tables_with_hits': hits, 'tables_scanned': n})
    return J

# =====================================================================================================
# PART S - the orchestrated RTBF saga ; PART R - restore / anti-resurrection
# =====================================================================================================
def epoch_order_finding():
    out = {}
    for label, patch in (('published_sub_b', False), ('epoch_patch', True)):
        db = f'g6_{label}'; fresh(db, mesh_patch=patch)
        psql(f"""INSERT INTO contact_center.participants(space_id,id,kind,display_name,auth_subject) VALUES('{S1}','{REVIEWER}','operator','Knowledge reviewer (projected)','reviewer');
          CREATE FUNCTION contact_center.mesh_policy_consumer(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE sql SET search_path = pg_catalog, pg_temp AS $f$ SELECT contact_center.apply_policy_events(p_env) $f$;
          GRANT EXECUTE ON FUNCTION contact_center.mesh_policy_consumer(jsonb,jsonb), contact_center.apply_policy_events(jsonb) TO mesh_owner;
          INSERT INTO mesh.routes SELECT 'kb', t, 'contact_center', 'contact_center.mesh_policy_consumer(jsonb,jsonb)'::regprocedure FROM unnest(ARRAY['PolicyApprovedEvent','PolicySupersededEvent','PolicyArchivedEvent']) t;""", db)
        relay(db, ['kb'], cycles=4)
        out[label] = q("SELECT dispatch_fenced::text||'|'||coalesce(fence_reason,'-')||'|'||(SELECT count(*) FROM contact_center.policy_event_inbox) FROM contact_center.knowledge_projection;", db, space=S1)
        if not patch:
            out['after_reconcile'] = json.loads(q("SELECT contact_center.reconcile_knowledge();", db, space=S1))['status']
    EVIDENCE['epoch_order'] = out
    ok('G6.0 FINDING: with the published Sub-B claim_kb (per-item head-of-line) the relay lets later epochs overtake the supersession pair, so the Sub-C App 1 consumer fences AI dispatch (safe; reconcile lifts it); with the epoch-ordered claim patch all 12 events arrive in order and nothing fences',
       out['published_sub_b'].startswith('true|KNOWLEDGE_GAP') and out['published_sub_b'].endswith('|12') and out['after_reconcile'] == 'RECONCILED' and out['epoch_patch'] == 'false|-|12', out)

def saga_and_restore():
    epoch_order_finding()
    db = 'journey'; fresh(db); J = journey(db)
    # snapshot BEFORE erasure (a physical copy = a backup restore point)
    psql('DROP DATABASE IF EXISTS snap;', 'postgres'); psql(f'CREATE DATABASE snap TEMPLATE {db};', 'postgres')
    req = q(f"SELECT guest_crm.erase_for_saga('{J['profile']}');", db, space=S1)
    st0 = q(f"SELECT state||'|'||(SELECT count(*) FROM guest_crm.erasure_receipts WHERE request_id='{req}' AND outcome='pending')||'|'||(suppress_until > now())::text FROM guest_crm.erasure_requests WHERE id='{req}';", db, space=S1)
    gone = q(f"SELECT count(*) FROM guest_crm.crm_profiles WHERE id='{J['profile']}';", db, space=S1)
    ok('S.01 App 2 erase_profile() (unchanged, run as its privacy role) fences locally: profile hard-deleted, state local_erased, 7 pending receipts, suppression active',
       st0 == 'local_erased|7|true' and gone == '0', st0)
    relay(db, ['crm'], cycles=3)
    cmds = q(f"SELECT string_agg(recipient, ',' ORDER BY recipient)||'|'||max(cardinality(conversations))||'|'||(SELECT count(*) FROM platform.erasure_ledger WHERE request_id='{req}') FROM platform.erasure_commands WHERE request_id='{req}';", db, space=S1)
    ok('S.02 the R1 relay delivers ProfileErasureRequestedEvent to the kernel coordinator: 7 commands (one per registered recipient), the guest\'s App 1 conversation resolved once, ledger written',
       cmds == 'backup_ledger,cache_search,contact_center,kb,object_store,operations,workforce|1|1', cmds)
    first = q(f"SELECT platform.execute_erasure_command('{req}', 'contact_center');", db, role='platform_relay', space=S1)
    mid = q(f"SELECT state FROM guest_crm.erasure_requests WHERE id='{req}';", db, space=S1)
    saga_worker(db)
    st = q(f"SELECT state||'|'||(SELECT string_agg(system_code||':'||outcome, ',' ORDER BY system_code) FROM guest_crm.erasure_receipts WHERE request_id='{req}') FROM guest_crm.erasure_requests WHERE id='{req}';", db, space=S1)
    EVIDENCE['saga_receipts'] = st
    ok('S.03 saga state machine observed local_erased -> propagating (after the first receipt) -> complete (all 7 terminal; backup_ledger = lawful_restriction)',
       mid == 'propagating' and st.startswith('complete|') and 'backup_ledger:lawful_restriction' in st and st.count(':erased') == 6, st)
    a1 = q(f"""SELECT (SELECT count(*) FROM contact_center.messages WHERE conversation_id='{J['conv']}' AND body<>'[redacted]')||'|'||
      (SELECT display_name FROM contact_center.participants WHERE id='{J['guest']}')||'|'||
      (SELECT coalesce(normalized_phone,'null')||':'||(revoked_at IS NOT NULL)::text FROM contact_center.participant_identities WHERE participant_id='{J['guest']}')||'|'||
      (SELECT count(*) FROM contact_center.messages WHERE conversation_id='{J['conv']}')""", db, space=S1).split('|')
    e410 = q(f"SELECT contact_center.resolved_snapshot_manifest('{J['conv']}', 1);", db, space=S1, fail=True)
    e_imm = q(f"UPDATE contact_center.messages SET body='x' WHERE conversation_id='{J['conv']}';", db, fail=True)
    ok('S.04 App 1 redaction: every message body of the conversation redacted (rows, ids and sequence kept as dedupe tombstones), participant anonymized, phone removed and identity revoked; the CR2 manifest now answers 410; messages remain immutable to everyone else',
       a1[0] == '0' and a1[1] == 'Redacted guest' and a1[2] == 'null:true' and int(a1[3]) >= 2 and 'SNAPSHOT_SOURCE_GONE' in e410 and 'immutable' in e_imm, {'app1': a1, 'manifest': e410[-30:]})
    a3 = q(f"""SELECT t.status||'|'||t.title||'|'||(t.details->>'redacted')||'|'||(SELECT count(*) FROM ops.task_attestations WHERE task_id=t.task_id)||'|'||
      (SELECT object_ref LIKE 'tombstone:%' AND redacted_at IS NOT NULL FROM ops.completion_evidence WHERE task_id=t.task_id)::text
      FROM ops.operational_tasks t WHERE t.task_id='{J['task']}';""", db, space=S1)
    ok('S.05 App 3 redaction: task text neutralized and evidence object reference tombstoned, while the COMPLETED status and the human attestation record are preserved',
       a3 == 'COMPLETED|Guest request (redacted)|true|1|true', a3)
    a5 = q(f"""SELECT state||'|'||coalesce(profile_id::text,'null')||'|'||(SELECT count(*) FROM workforce.agent_checkpoints WHERE session_id=s.session_id)
      FROM workforce.agent_execution_sessions s WHERE session_id='{J['session']}';""", db, space=S1)
    e5 = q(f"DELETE FROM workforce.agent_audit_log WHERE space_id='{S1}';", db, space=S1, fail=True)
    ok('S.06 App 5 purge: the interrupted session is cancelled through its fence, the profile reference detached, checkpoint state references deleted; audit rows stay immutable',
       a5 == 'CANCELLED|null|0' and 'immutable record' in e5, a5)
    hits, n = residual_pii(db)
    EVIDENCE['pii_after'] = hits
    ok('S.07 FALSIFICATION: a full scan of every row in all 8 platform schemas finds none of the guest\'s plaintext markers after the saga', hits == {}, {'hits': hits, 'tables_scanned': n})
    before = val("SELECT count(*) FROM platform.erasure_commands;", db)
    relay(db, ['crm'], cycles=2); saga_worker(db, cycles=2)
    again = q(f"SELECT contact_center.erase_subject('{req}', ARRAY['{J['guest']}']::uuid[]);", db, role='platform_saga', space=S1)
    ok('S.08 idempotent: re-running relay and saga creates no new commands and a repeated App 1 redaction is a no-op', val("SELECT count(*) FROM platform.erasure_commands;", db) == before and again == '[]', again)
    # failure path: a planted PII upload in App 4 + a transient App 5 fault on a second guest
    p2 = q(f"INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{S1}','visitor',now()+interval '7 days') RETURNING id;", db, space=S1)
    doc = str(uuid.uuid4()); fol = val(f"SELECT folder_id FROM kb.storage_folders WHERE space_id='{S1}' LIMIT 1;", db)
    psql(f"BEGIN; SET LOCAL app.space_id='{S1}'; INSERT INTO kb.storage_documents(space_id,document_id,folder_id,title,policy_key,locale,audience,document_kind) VALUES('{S1}','{doc}','{fol}','Front desk notes','notes.frontdesk','en','GUEST','POLICY'); COMMIT;", db)
    text = 'Call back guest Tamar at +995 599 11 22 33 about her anniversary cake.'
    sha = hashlib.sha256(text.encode()).hexdigest()
    rid2 = q(f"SELECT kb.register_revision('{uuid.uuid4()}','{'a' * 64}','{doc}',1,'fixtures/{sha}','{sha}','text/plain',{len(text)},'fixture-parser-v1',tstzrange(now()-interval '1 day', now()+interval '30 days'));", db, role='kb_ingest', space=S1, actor=EDITOR)
    ch = [{'ordinal': 0, 'start_char': 0, 'end_char': len(text), 'content': text, 'chunk_kind': 'POLICY_CLAUSE', 'locator': {'page': 1, 'table_id': None, 'row_id': None}, 'structured_data': {}, 'embedding': None, 'embedding_model': None}]
    q(f"SELECT kb.process_revision('{rid2}', {lit(text)}, {lit(json.dumps(ch))}::jsonb, '[]'::jsonb);", db, role='kb_ingest', space=S1, actor=EDITOR)
    psql("INSERT INTO platform.erasure_faults VALUES ('workforce', 2);", db)
    req2 = q(f"SELECT guest_crm.erase_for_saga('{p2}');", db, space=S1)
    relay(db, ['crm'], cycles=2); saga_worker(db, cycles=6)
    f = q(f"""SELECT r.state||'|'||(SELECT outcome||':'||coalesce(detail_code,'-')||':'||attempts FROM platform.erasure_commands WHERE request_id='{req2}' AND recipient='kb')||'|'||
      (SELECT outcome||':'||attempts FROM platform.erasure_commands WHERE request_id='{req2}' AND recipient='workforce')||'|'||(SELECT count(*) FROM kb.pii_review_queue WHERE request_id='{req2}')
      FROM guest_crm.erasure_requests r WHERE r.id='{req2}';""", db, space=S1)
    ok('S.09 failure isolation: an accidental phone number in an App 4 upload fails the kb sweep (queued for review) and sends the saga to exception_review; a transient App 5 fault is retried and succeeds on attempt 3; every other recipient completes',
       f.startswith('exception_review|failed:PII_SUSPECTED_REVIEW:1|erased:3|1'), f)

    # ------------------------------ restore / anti-resurrection ------------------------------
    ledger = val(f"SELECT json_agg(l) FROM platform.erasure_ledger l;", 'journey' if False else db)
    (W / 'saga' / 'shipped_ledger.json').write_text(ledger)                       # shipped OUTSIDE the database (WORM store stand-in)
    psql('DROP DATABASE IF EXISTS restored;', 'postgres'); psql('CREATE DATABASE restored TEMPLATE snap;', 'postgres')
    rdb = 'restored'
    q(f"INSERT INTO platform.restore_state VALUES('{S1}', false, 'restored from pre-erasure snapshot; ledger replay pending');", rdb, space=S1)
    in_db_ledger = val(f"SELECT count(*) FROM platform.erasure_ledger WHERE profile_id='{J['profile']}';", rdb)
    back = q(f"""SELECT (SELECT count(*) FROM guest_crm.active_profile_context WHERE id='{J['profile']}')||'|'||
      (SELECT count(*) FROM guest_crm.guest_preferences WHERE profile_id='{J['profile']}' AND status='active')||'|'||
      (SELECT count(*) FROM contact_center.messages WHERE conversation_id='{J['conv']}' AND body<>'[redacted]')""", rdb, space=S1)
    hits_r, _ = residual_pii(rdb)
    ok('R.01 NEGATIVE: the restored pre-erasure snapshot resurrects the guest (profile + active preference served, transcript intact) and its own in-database ledger has no entry for this guest - an in-DB ledger alone cannot prevent resurrection',
       back.startswith('1|1|') and int(back.split('|')[2]) >= 2 and in_db_ledger == '0' and len(hits_r) >= 5, {'restored': back, 'in_db_ledger_rows': in_db_ledger, 'pii_tables': len(hits_r)})
    entries = json.loads(ledger)
    out = json.loads(q(f"SELECT platform.replay_erasure_ledger({lit(json.dumps(entries))}::jsonb);", rdb, role='platform_relay', space=S1))
    psql(f"""INSERT INTO mesh.routes VALUES ('crm','ProfileErasureRequestedEvent','platform','platform.enqueue_erasure(jsonb,jsonb)'::regprocedure) ON CONFLICT DO NOTHING;""", rdb)
    relay(rdb, ['crm'], cycles=3); saga_worker(rdb)
    states = q(f"SELECT string_agg(state, ',' ORDER BY requested_at) FROM guest_crm.erasure_requests WHERE profile_id IN ('{J['profile']}','{p2}');", rdb, space=S1)
    hits_after, _ = residual_pii(rdb)
    ok('R.02 applying the shipped ledger BEFORE traffic: the subject present in the snapshot is re-erased (App 2 re-fences, the saga re-runs through every recipient), entries already erased or absent are classified and skipped, and the full scan finds no plaintext',
       [o['status'] for o in out if o['status'] == 'PRESENT'] == ['PRESENT'] and any(o['status'] == 'ABSENT' for o in out) and hits_after == {} and 'complete' in states,
       {'replay': sorted(set(o['status'] for o in out)), 'entries': len(out), 'states': states})
    q(f"UPDATE platform.restore_state SET traffic_enabled = true, note = 'ledger replayed; saga complete' WHERE space_id='{S1}';", rdb, space=S1)
    p3 = q(f"INSERT INTO guest_crm.crm_profiles(space_id,kind,expires_at) VALUES('{S1}','visitor',now()+interval '7 days') RETURNING id;", rdb, space=S1)   # a new, legitimate visitor
    e1 = q(f"INSERT INTO guest_crm.profile_source_links(space_id,profile_id,source,source_subject) VALUES('{S1}','{p3}','contact_center','{J['guest']}');", rdb, space=S1, fail=True)
    e2 = q(f"INSERT INTO guest_crm.crm_profiles(space_id,id,kind,expires_at) VALUES('{S1}','{J['profile']}','visitor',now()+interval '7 days');", rdb, space=S1, fail=True)
    ok('R.03 re-ingestion is blocked after the restore: linking the erased App 1 subject to a new profile and recreating the erased profile id are both refused by App 2 suppression',
       'erased source replay blocked' in e1 and 'erased subject blocked' in e2, [e1, e2])

# =====================================================================================================
# GATE 2 - cross-tenant isolation over every table under a pooled (reused) backend
# =====================================================================================================
def gate2():
    db = 'g2'; fresh(db)
    tabs = val("""SELECT string_agg(n.nspname||'.'||c.relname||':'||c.relrowsecurity::text||c.relforcerowsecurity::text||':'||
        (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='space_id' AND NOT a.attisdropped) OR c.relname='spaces')::text, ',' ORDER BY 1)
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('contact_center','guest_crm','ops','kb','workforce');""", db).split(',')
    tenant_tabs = [t for t in tabs if t.endswith(':true')]; global_tabs = [t.split(':')[0] for t in tabs if t.endswith(':false')]
    unforced = [t for t in tenant_tabs if ':truetrue:' not in t]
    runtime = ['cc_transport','crm_transport','ops_transport','kb_transport','ai_transport','ops_human','ops_integration','kb_guest','kb_reviewer','kb_ingest','ai_runtime','ai_config','platform_gateway']
    gwrites = [f"{r}->{g}" for g in global_tabs for r in runtime if val(f"SELECT has_table_privilege('{r}','{g}','INSERT,UPDATE,DELETE');", db) == 't']
    ok('G2.1 every tenant table in the five app schemas (incl. all Sub-C bridge and Sub-D saga tables) has RLS enabled AND forced; the only non-tenant table (the global erasure-recipient catalog, no guest data) is not writable by any runtime role',
       not unforced and not gwrites, {'tenant_tables': len(tenant_tabs), 'unforced': unforced, 'global_tables': global_tabs, 'global_writes': gwrites})
    ktabs = val("""SELECT string_agg(n.nspname||'.'||c.relname, ',') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='r' AND n.nspname IN ('platform','mesh') AND NOT c.relforcerowsecurity;""", db).split(',')
    leaks = [f"{r}->{t}" for t in ktabs for r in runtime
             if val(f"SELECT has_table_privilege('{r}','{t}','INSERT,UPDATE,DELETE');", db) == 't' or (t != 'mesh.sources' and val(f"SELECT has_table_privilege('{r}','{t}','SELECT');", db) == 't')]
    ok('G2.2 kernel tables without RLS (mesh bookkeeping, fault table) are unreachable by every app runtime / transport / gateway role; the only grant is read access to the static mesh.sources catalog (Sub-B design)',
       not leaks, {'kernel_private_tables': ktabs, 'leaks': leaks})
    rls = [t.split(':')[0] for t in tenant_tabs]
    psql("""DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='iso_probe') THEN CREATE ROLE iso_probe NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
      GRANT USAGE ON SCHEMA contact_center, guest_crm, ops, kb, workforce TO iso_probe;
      GRANT SELECT ON ALL TABLES IN SCHEMA contact_center, guest_crm, ops, kb, workforce TO iso_probe;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA contact_center, guest_crm, ops, kb, workforce TO iso_probe;""", db)
    per_space = {}
    for s in (S1, KV):
        per_space[s] = {t: int(x) for t, x in zip(rls, val('SELECT ' + ','.join(f"(SELECT count(*) FROM {t} WHERE space_id='{s}')" if t not in ('contact_center.spaces', 'guest_crm.spaces') else f"(SELECT count(*) FROM {t} WHERE id='{s}')" for t in rls) + ';', db).split('|'))}
    script, keys = [], []
    for i in range(40):
        s = S1 if i % 2 == 0 else KV
        body = ','.join(f"(SELECT count(*) FROM {t})" for t in rls)
        script.append(f"BEGIN; SET LOCAL ROLE iso_probe; SET LOCAL app.space_id='{s}'; SELECT 'c{i}', {body}; COMMIT;")
        script.append(f"BEGIN; SET LOCAL ROLE iso_probe; SELECT 'n{i}', {body}; COMMIT;")
    rows = {l.split('|')[0]: [int(x) for x in l.split('|')[1:]] for l in psql('\n'.join(script), db).stdout.splitlines()}
    bad = 0; zero = 0
    for i in range(40):
        s = S1 if i % 2 == 0 else KV
        bad += sum(1 for t, c in zip(rls, rows[f'c{i}']) if c != per_space[s][t])
        zero += sum(rows[f'n{i}'])
    ok('G2.3 one reused backend, 40 alternating S1/Kvareli transactions over all app tables: every count equals that tenant\'s own row count exactly; 40 context-free transactions see 0 rows everywhere',
       bad == 0 and zero == 0, {'tables': len(rls), 'mismatches': bad, 'context_free_rows': zero, 'S1_rows_total': sum(per_space[S1].values()), 'KV_rows_total': sum(per_space[KV].values())})

# =====================================================================================================
# GATE 3 - relay kill / restart with zero loss
# =====================================================================================================
def gate3():
    db = 'g3'; fresh(db)
    psql("""CREATE SCHEMA IF NOT EXISTS g3; CREATE TABLE g3.applied(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id uuid, aggregate_id uuid, seq bigint, at timestamptz DEFAULT clock_timestamp());
      CREATE FUNCTION g3.sink(p_row jsonb, p_env jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
      BEGIN PERFORM pg_sleep(0.03); INSERT INTO g3.applied(event_id, aggregate_id, seq) VALUES ((p_row->>'event_id')::uuid, (p_row->>'aggregate_id')::uuid, (p_row->>'seq')::bigint); END $f$;
      GRANT USAGE ON SCHEMA g3 TO mesh_owner; GRANT EXECUTE ON FUNCTION g3.sink(jsonb,jsonb) TO mesh_owner;
      INSERT INTO mesh.routes VALUES ('cc','MessageRecordedEvent','g3','g3.sink(jsonb,jsonb)'::regprocedure);""", db)
    sql = [f"BEGIN; SET LOCAL app.space_id='{KV}';"]; convs = []
    for i in range(12):
        gg, c = str(uuid.uuid4()), str(uuid.uuid4()); convs.append(c)
        sql += [f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{KV}','{gg}','guest','G3 guest {i}');",
                f"INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{KV}','{c}','{gg}');"]
    for n in range(15):
        for c in convs:
            sql.append(f"INSERT INTO contact_center.outbox_events(space_id,conversation_id,event_seq,event_type,dedupe_key,correlation_id,payload) VALUES('{KV}','{c}',0,'MessageRecordedEvent','g3:{c}:{n}',gen_random_uuid(),'{{\"n\":{n}}}');")
    sql.append('COMMIT;'); psql('\n'.join(sql), db)
    total = 12 * 15
    # deterministic phase kills
    a = q("SELECT event_id||'|'||fence FROM mesh.claim('cc', 1, '2 seconds');", db, role='cc_transport', space=KV).split('|')          # claim, then "die"
    b = q("SELECT event_id||'|'||fence FROM mesh.claim('cc', 1, '2 seconds');", db, role='cc_transport', space=KV).split('|')
    q(f"SELECT mesh.deliver('cc', '{b[0]}', 'dies-before-ack');", db, role='platform_relay', space=KV, iso='REPEATABLE READ')         # deliver, then "die" before ack
    kills = {'claim_then_die': 1, 'deliver_then_die_before_ack': 1, 'terminate_during_run': 0, 'server_crash': 0}
    time.sleep(2.2)
    stop = threading.Event()
    def workers():
        procs = {}
        while not stop.is_set():
            for w in ('w1', 'w2', 'w3'):
                if w not in procs or procs[w].poll() is not None:
                    procs[w] = relay(db, ['cc'], cycles=200, worker=w, background=True, lease='3 seconds')
            time.sleep(0.2)
        for p in procs.values():
            try: p.wait(timeout=60)
            except Exception: p.kill()
    th = threading.Thread(target=workers); th.start()
    for i in range(10):
        time.sleep(0.6)
        r = psql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name LIKE 'relay-w%' AND state <> 'idle' ORDER BY random() LIMIT 1;", db, check=False)
        if r.stdout.strip() == 't': kills['terminate_during_run'] += 1
        if i == 5:
            subprocess.run([f'{PGBIN}/pg_ctl', '-D', str(W / 'pgdata'), '-m', 'immediate', 'restart', '-w', '-l', str(W / 'postgres.log'), '-o', f"-k {SOCK} -p {PORT} -h ''"], capture_output=True)
            kills['server_crash'] += 1; time.sleep(1.0)
    stop.set(); th.join()
    left_after_chaos = int(val("SELECT count(*) FROM contact_center.outbox_events WHERE event_type='MessageRecordedEvent' AND published_at IS NULL;", db))
    kills['unpublished_right_after_chaos'] = left_after_chaos
    for _ in range(5):                                   # recovery is bounded by the 3 s lease of the killed workers
        time.sleep(3.5); relay(db, ['cc'], cycles=60, worker='drain', lease='3 seconds')
        if val("SELECT count(*) FROM contact_center.outbox_events WHERE event_type='MessageRecordedEvent' AND published_at IS NULL;", db) == '0': break
    res = val(f"""SELECT (SELECT count(*) FROM g3.applied)||'|'||(SELECT count(DISTINCT event_id) FROM g3.applied)||'|'||
      (SELECT count(*) FROM contact_center.outbox_events WHERE event_type='MessageRecordedEvent' AND published_at IS NULL)||'|'||(SELECT count(*) FROM mesh.dead_letters);""", db).split('|')
    inv = val("""SELECT count(*) FROM (SELECT seq, lag(seq) OVER (PARTITION BY aggregate_id ORDER BY id) prev FROM g3.applied) x WHERE prev IS NOT NULL AND seq < prev;""", db)
    EVIDENCE['gate3'] = {'kills': kills, 'applied': res, 'inversions': inv}
    ok('G3.1 relay workers killed after claim, after delivery-before-ack, 10x at random during runs, plus one crash-style server restart: events orphaned by killed leases stay durable and are re-claimed after lease expiry; all 180 applied exactly once, none lost, no dead letters, no per-conversation inversion',
       res == [str(total), str(total), '0', '0'] and inv == '0', EVIDENCE['gate3'])

# =====================================================================================================
# GATE 5 - lock-graph resilience under simulated advisory-key collisions
# =====================================================================================================
def gate5():
    db = 'g5'; fresh(db)
    d0 = int(val("SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();", db))
    ai, sysp = str(uuid.uuid4()), str(uuid.uuid4()); convs = []
    sql = [f"BEGIN; SET LOCAL app.space_id='{S1}'; INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{S1}','{ai}','ai','Mia (AI)'),('{S1}','{sysp}','system','Scheduler');"]
    for i in range(6):
        gg, c = str(uuid.uuid4()), str(uuid.uuid4()); convs.append(c)
        sql += [f"INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{S1}','{gg}','guest','G5 guest {i}');",
                f"INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{S1}','{c}','{gg}');"]
    sql.append('COMMIT;'); psql('\n'.join(sql), db)
    keys = [int(val(f"SELECT hashtextextended('{S1}'||':'||'{c}',0);", db)) for c in convs]      # App 1's exact conversation lock keys
    ex = json.loads((W / 'app3' / 'ops-contracts' / 'inbound.example.json').read_text())
    stats = {'app1_ok': 0, 'app3_ok': 0, 'app4_ok': 0, 'business_rejects': 0, 'deadlock_errors': 0, 'other_errors': []}
    lock = threading.Lock(); stop = time.time() + 25
    def rec(r):
        with lock:
            if r.returncode == 0: return True
            if '40P01' in r.stderr or 'deadlock' in r.stderr: stats['deadlock_errors'] += 1
            else: stats['business_rejects'] += 1; (len(stats['other_errors']) < 5 and stats['other_errors'].append(r.stderr.strip().splitlines()[0][:90]))
            return False
    def app1():
        v = {c: 0 for c in convs}
        while time.time() < stop:
            c = random.choice(convs)
            sqlx = (f"BEGIN; SET LOCAL app.space_id='{S1}'; SET LOCAL lock_timeout='5s'; SELECT contact_center.change_control('{S1}','{c}',{v[c]},'ESC_REQUESTED','{ai}',NULL,'load',now()+interval '5 minutes');"
                    f" SELECT contact_center.change_control('{S1}','{c}',{v[c] + 1},'AI_ACTIVE','{sysp}',NULL,'load'); COMMIT;")
            if rec(psql(sqlx, db, check=False)):
                v[c] += 2
                with lock: stats['app1_ok'] += 1
            else:
                v[c] = int(val(f"SELECT control_version FROM contact_center.conversations WHERE id='{c}';", db))
    def app3():
        while time.time() < stop:
            e = copy.deepcopy(ex); e['id'] = str(uuid.uuid4()); e['data']['request_id'] = str(uuid.uuid4()); e['space_id'] = S1; e['source'] = f'urn:smartstay:space:{S1}:contact-center'
            body = json.dumps(e); h = hashlib.sha256(body.encode()).hexdigest(); k = random.choice(keys)
            # simulated collision: this App 3 transaction also needs App 1's conversation key (as if its hash collided)
            sqlx = (f"BEGIN; SET LOCAL app.space_id='{S1}'; SET LOCAL app.staff_id='{STAFF}'; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock({k});"
                    f" SET LOCAL ROLE ops_integration; SELECT ops.ingest_request({lit(body)}::jsonb,'{h}','{POLICY}',false,'housekeeping'); COMMIT;")
            if rec(psql(sqlx, db, check=False)):
                with lock: stats['app3_ok'] += 1
    doc = str(uuid.uuid4()); fol = val(f"SELECT folder_id FROM kb.storage_folders WHERE space_id='{S1}' LIMIT 1;", db)
    psql(f"BEGIN; SET LOCAL app.space_id='{S1}'; INSERT INTO kb.storage_documents(space_id,document_id,folder_id,title,policy_key,locale,audience,document_kind) VALUES('{S1}','{doc}','{fol}','Cellar hours','cellar.hours','en','GUEST','POLICY'); COMMIT;", db)
    def app4():
        ver, prev = 0, None
        while time.time() < stop:
            ver += 1; text = f'Cellar open 10:00-{18 + ver % 4}:00 (rev {ver}).'; sha = hashlib.sha256(text.encode()).hexdigest()
            try:
                rid = q(f"SELECT kb.register_revision('{uuid.uuid4()}','{'a' * 64}','{doc}',{ver},'fixtures/{sha}','{sha}','text/plain',{len(text)},'fixture-parser-v1',tstzrange(now()-interval '1 hour', now()+interval '30 days'));", db, role='kb_ingest', space=S1, actor=EDITOR)
                ch = [{'ordinal': 0, 'start_char': 0, 'end_char': len(text), 'content': text, 'chunk_kind': 'POLICY_CLAUSE', 'locator': {'page': 1, 'table_id': None, 'row_id': None}, 'structured_data': {}, 'embedding': None, 'embedding_model': None}]
                q(f"SELECT kb.process_revision('{rid}', {lit(text)}, {lit(json.dumps(ch))}::jsonb, '[]'::jsonb);", db, role='kb_ingest', space=S1, actor=EDITOR)
                pid = val(f"SELECT knowledge_item_id FROM kb.knowledge_policies WHERE revision_id='{rid}';", db)
                man = val(f"SELECT manifest_sha256 FROM kb.document_revisions WHERE revision_id='{rid}';", db)
                k = random.choice(keys)
                sqlx = (f"BEGIN; SET LOCAL app.space_id='{S1}'; SET LOCAL app.actor_id='{REVIEWER}'; SET LOCAL lock_timeout='5s'; SELECT pg_advisory_xact_lock({k});"
                        f" SET LOCAL ROLE kb_reviewer; SELECT kb.approve_policy('{pid}', 3, '{man}', 'load test approval', {lit(prev) + '::uuid' if prev else 'NULL'}); COMMIT;")
                if rec(psql(sqlx, db, check=False)):
                    prev = pid
                    with lock: stats['app4_ok'] += 1
            except RuntimeError as e:
                with lock: stats['business_rejects'] += 1
    ths = [threading.Thread(target=f) for f in (app1, app1, app3, app3, app4)]
    rl = relay(db, ['cc', 'ops', 'kb'], cycles=40, worker='g5', background=True)
    for t in ths: t.start()
    for t in ths: t.join()
    rl.wait(timeout=300)
    d1 = int(val("SELECT deadlocks FROM pg_stat_database WHERE datname=current_database();", db))
    EVIDENCE['gate5'] = {**stats, 'pg_stat_deadlocks_delta': d1 - d0}
    ok('G5.1 25 s of concurrent App 1 control changes, App 3 ingests and App 4 publications (+ relay) where App 3/4 transactions also take App 1\'s exact conversation keys (simulated collisions): zero deadlocks',
       d1 - d0 == 0 and stats['deadlock_errors'] == 0 and stats['app1_ok'] > 20 and stats['app3_ok'] > 20 and stats['app4_ok'] > 3, EVIDENCE['gate5'])
    # negative control: a forbidden cross-app transaction ordering does deadlock
    c0 = convs[0]
    t1 = subprocess.Popen(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-Atq', '-c', f"BEGIN; SET LOCAL app.space_id='{S1}'; SELECT 1 FROM contact_center.conversations WHERE id='{c0}' FOR UPDATE; SELECT pg_sleep(1); SELECT 1 FROM kb.spaces WHERE space_id='{S1}' FOR UPDATE; COMMIT;"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    t2 = subprocess.Popen(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-Atq', '-c', f"BEGIN; SET LOCAL app.space_id='{S1}'; SELECT 1 FROM kb.spaces WHERE space_id='{S1}' FOR UPDATE; SELECT pg_sleep(1); SELECT 1 FROM contact_center.conversations WHERE id='{c0}' FOR UPDATE; COMMIT;"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    o1, o2 = t1.communicate(), t2.communicate()
    dl = 'deadlock detected' in (o1[1] + o2[1])
    ok('G5.2 NEGATIVE CONTROL: two transactions that each span App 1 and App 4 rows in opposite order deadlock immediately - the one-app-per-transaction rule (00 §3.3) is what G5.1 relies on', dl, [x[1].strip()[:70] for x in (o1, o2) if x[1]])

# =====================================================================================================
# GATE 7 - revocation latency across all app gateways
# =====================================================================================================
def gate7():
    db = 'g7'; fresh(db)
    psql('GRANT EXECUTE ON FUNCTION platform.project_member(uuid, uuid) TO platform_owner;', db)
    pid = str(uuid.uuid4())
    psql(f"INSERT INTO platform.principals VALUES('{pid}','oidc|kakheti|night-manager','Night manager (synthetic)');", db)
    m = q(f"INSERT INTO platform.members(space_id,principal_id) VALUES('{S1}','{pid}') RETURNING member_id;", db, role='platform_owner')
    q(f"""INSERT INTO platform.member_templates VALUES('{S1}','{m}','GENERAL_MANAGER'),('{S1}','{m}','FRONT_DESK_LEAD'),('{S1}','{m}','HOUSEKEEPING_SUPERVISOR');
      INSERT INTO platform.member_skills VALUES('{S1}','{m}','housekeeping'); SELECT platform.project_member('{S1}','{m}');""", db, role='platform_owner')
    psql(f"INSERT INTO ops.staff_roster(space_id,staff_id,shift_window,zone,capacity_minutes) VALUES('{S1}','{m}',tstzrange(now()-interval '1 hour',now()+interval '8 hours','[)'),'east',480);", db)
    g, c = str(uuid.uuid4()), str(uuid.uuid4())
    q(f"""INSERT INTO contact_center.participants(space_id,id,kind,display_name) VALUES('{S1}','{g}','guest','G7 guest');
      INSERT INTO contact_center.conversations(space_id,id,guest_id) VALUES('{S1}','{c}','{g}');""", db, space=S1)
    ex = json.loads((W / 'app3' / 'ops-contracts' / 'inbound.example.json').read_text()); ex['id'] = str(uuid.uuid4()); ex['data']['request_id'] = str(uuid.uuid4()); ex['space_id'] = S1; ex['source'] = f'urn:smartstay:space:{S1}:contact-center'
    body = json.dumps(ex); tid = q(f"SELECT ops.ingest_request({lit(body)}::jsonb,'{hashlib.sha256(body.encode()).hexdigest()}','{POLICY}',false,'housekeeping');", db, role='ops_integration', space=S1, staff=STAFF)
    pre = q(f"SELECT ops.issue_action_token('{tid}','ClaimTask',1);", db, role='ops_human', space=S1, staff=m)                  # token issued BEFORE revocation (5-minute TTL)
    pend = val(f"SELECT p.knowledge_item_id||'|'||r.manifest_sha256 FROM kb.knowledge_policies p JOIN kb.document_revisions r USING (space_id, revision_id) WHERE p.space_id='{S1}' AND p.state='REVIEW_REQUIRED' AND r.manifest_sha256 IS NOT NULL LIMIT 1;", db).split('|')
    before = {'gateway': q(f"SELECT platform.begin_request('{S1}','oidc|kakheti|night-manager','ops');", db, role='platform_gateway') == m}
    t0 = time.time()
    q(f"UPDATE platform.members SET enabled = false WHERE space_id='{S1}' AND member_id='{m}'; SELECT platform.project_member('{S1}','{m}');", db, role='platform_owner')
    t_commit = time.time()
    checks = {
      'kernel_gateway': q(f"SELECT platform.begin_request('{S1}','oidc|kakheti|night-manager','ops');", db, role='platform_gateway', fail=True),
      'app1_claim': q(f"SELECT contact_center.change_control('{S1}','{c}',0,'OPERATOR_LOCKED','{m}','{m}','claim');", db, space=S1, fail=True),
      'app3_pre_issued_token': q(f"SELECT ops.staff_action('{tid}','{uuid.uuid4()}',{lit(json.dumps({'action': 'ClaimTask', 'expected_version': '1', 'action_token': pre}))}::jsonb);", db, role='ops_human', space=S1, staff=m, fail=True),
      'app4_approve': q(f"SELECT kb.approve_policy('{pend[0]}', 3, '{pend[1]}', 'x', NULL);", db, role='kb_reviewer', space=S1, actor=m, fail=True),
      'app5_resume': q(f"SELECT workforce.resume_session('{uuid.uuid4()}', 1);", db, role='ai_config', space=S1, actor=m, fail=True)}
    t_all = time.time()
    ms = round((t_all - t_commit) * 1000)
    EVIDENCE['gate7'] = {'refusals': checks, 'ms_from_commit_to_all_checks_refused': ms}
    ok('G7.1 one revocation commit makes every path refuse at once: kernel gateway, App 1 claim (disabled operator), App 3 action with a token issued before revocation (5-min TTL not honoured), App 4 approval, App 5 resume',
       before['gateway'] and 'not an enabled member' in checks['kernel_gateway'] and 'is disabled' in checks['app1_claim']
       and 'independent human approver required' in checks['app4_approve'] and 'human resume required' in checks['app5_resume']
       and val(f"SELECT enabled FROM ops.staff_members WHERE staff_id='{m}';", db) == 'f' and 'ERROR' in checks['app3_pre_issued_token'], {'ms_all_refused_after_commit': ms, 'refusals': {k: v[-45:] for k, v in checks.items()}})

if __name__ == '__main__':
    only = sys.argv[1:] or ['saga', 'g2', 'g3', 'g5', 'g7']
    for n in only:
        {'saga': saga_and_restore, 'g2': gate2, 'g3': gate3, 'g5': gate5, 'g7': gate7}[n]()
    (W / 'saga' / ('results_' + '_'.join(only) + '.json')).write_text(json.dumps({'server': val('SHOW server_version;', 'postgres'), 'checks': RESULTS, 'evidence': EVIDENCE}, indent=2, default=str))
    print(json.dumps({'passed': sum(r['passed'] for r in RESULTS), 'failed': sum(not r['passed'] for r in RESULTS), 'total': len(RESULTS)}))
```

## Appendix E — end-to-end driver

End-to-end driver: build (locked + bridges + saga app layer; mesh_base), Gate 1 (locked + Sub-A/B/C suites), Sub-D suite.

<!-- artifact: run_all_d.sh -->
```bash
#!/usr/bin/env bash
# Sub-Component D end-to-end driver. Needs SW=<workdir> (prepare.py done, cluster on 55466, kernel_locked built) and PGBIN.
# Stage "build": kernel_clean = locked DDL + Sub-C bridges + Sub-D saga app layer; mesh_base via the Sub-B builder.
# Stage "gate1": locked app suites + Sub-A, Sub-B, Sub-C suites on that stack.  Stage "sagad": the Sub-D suite.
set -u
cd "${REPO:-$PWD}"
P="psql -X -q -h $SW/socket -p 55466 -v ON_ERROR_STOP=1"
STAGES="${*:-build gate1 sagad}"
if [[ " $STAGES " == *" build "* ]]; then
  python3 -c "import os; s=open(os.environ['SW']+'/bridges/bridges.sql').read(); open(os.environ['SW']+'/bridges/bridges_noenforce.sql','w').write(s.split('-- @@cr12_f3_enforce')[0])"
  python3 -c "import os; s=open(os.environ['SW']+'/saga/saga.sql').read(); i=s.index('-- @@platform_saga'); open(os.environ['SW']+'/saga/saga_apps.sql','w').write(s[:i]); open(os.environ['SW']+'/saga/saga_platform.sql','w').write(s[i:])"
  for d in kernel_clean kernel mesh_base; do $P -d postgres -c "DROP DATABASE IF EXISTS $d" >/dev/null 2>&1; done
  $P -d postgres -c 'CREATE DATABASE kernel_clean TEMPLATE kernel_locked' >/dev/null
  $P -d kernel_clean -f "$SW/bridges/bridges_noenforce.sql" >/dev/null 2>"$SW/saga/build.err" || { cat "$SW/saga/build.err"; exit 1; }
  $P -d kernel_clean -f "$SW/saga/saga_apps.sql" >/dev/null 2>"$SW/saga/build.err" || { grep -v NOTICE "$SW/saga/build.err"; exit 1; }
  $P -d postgres -c 'CREATE DATABASE kernel TEMPLATE kernel_clean' >/dev/null
  echo "BUILD kernel_clean = locked + bridges + saga app layer"
  python3 "$SW/mesh/build_base.py" > "$SW/saga/build_mesh.log" 2>&1; echo "BUILD mesh_base exit=$? $(grep suites "$SW/saga/build_mesh.log")"
fi
if [[ " $STAGES " == *" gate1 "* ]]; then
  echo "== GATE 1a: locked app suites on the full app-level stack"
  $P -d postgres -c 'DROP DATABASE IF EXISTS kernel' -c 'CREATE DATABASE kernel TEMPLATE kernel_clean' >/dev/null 2>&1
  for t in app3/verify.py app4/verify.py app4/extra.py app5/verify.py app5/verify_extra.py; do
    python3 "$SW/$t" > "$SW/saga/g1.log" 2>&1; echo "G1 $t exit=$? $(grep -o '"passed": [0-9]*' "$SW/saga/g1.log" | head -1)"; done
  echo "== GATE 1b: Sub-A suite (derived copy that tolerates the CR8-rejected divergence row), parts separately"
  cp "$SW/kernel/test_kernel.py" "$SW/kernel/test_kernel_bridgeaware.py"
  python3 -c "import os; p=os.environ['SW']+'/kernel/test_kernel_bridgeaware.py'; s=open(p).read(); open(p,'w').write(s.replace(\"rows['divergent']\",\"rows.get('divergent','<ERROR: divergence rejected>')\"))"
  for part in 1 2 3 4 5; do REPO=$PWD python3 "$SW/kernel/test_kernel_bridgeaware.py" $part > "$SW/saga/g1_subA_$part.log" 2>&1
    echo "G1 Sub-A part $part pass=$(grep -c '^PASS' "$SW/saga/g1_subA_$part.log") fail=$(grep -c '^FAIL' "$SW/saga/g1_subA_$part.log") $(grep -m1 -o 'RuntimeError: ERROR:.*' "$SW/saga/g1_subA_$part.log" | cut -c1-80)"; grep '^FAIL' "$SW/saga/g1_subA_$part.log" | cut -c1-40; done
  echo "== GATE 1c: Sub-B suite (rebuilds mesh_base first)"
  python3 "$SW/mesh/build_base.py" > "$SW/saga/g1_subB_build.log" 2>&1
  python3 "$SW/mesh/test_mesh.py" 1 2 3 4 > "$SW/saga/g1_subB.log" 2>&1; echo "G1 Sub-B exit=$? $(tail -1 "$SW/saga/g1_subB.log")"; grep '^FAIL' "$SW/saga/g1_subB.log" | cut -c1-100
  echo "== GATE 1d: Sub-C bridge suite"
  python3 "$SW/bridges/test_bridges.py" A B C D > "$SW/saga/g1_subC.log" 2>&1; echo "G1 Sub-C exit=$? $(tail -1 "$SW/saga/g1_subC.log")"; grep '^FAIL' "$SW/saga/g1_subC.log" | cut -c1-120
  $P -d postgres -c 'DROP DATABASE IF EXISTS kernel' -c 'CREATE DATABASE kernel TEMPLATE kernel_clean' >/dev/null 2>&1
fi
if [[ " $STAGES " == *" sagad "* ]]; then
  echo "== Sub-D suite: G6 journey, RTBF saga, restore, G2, G3, G5, G7"
  python3 "$SW/saga/test_saga.py" saga g2 g3 g5 g7 > "$SW/saga/sagad.log" 2>&1; echo "SUB-D exit=$? $(tail -1 "$SW/saga/sagad.log")"; grep -E '^FAIL' "$SW/saga/sagad.log" | cut -c1-160
fi
echo DONE
```
