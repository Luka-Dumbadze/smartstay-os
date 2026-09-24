# Sub-Component A — Kernel Schema, Root Multi-Tenancy & IAM Capability Model

**Empirical micro-research and proof of concept · 24 September 2026 · PostgreSQL 16.15 · SmartStay Kakheti hospitality platform**

This report takes three recommendations from `research/platform/00_master_kernel_research.md` and tests them against the real, unmodified DDL of all five locked apps: the kernel tenant registry (§3.2), the transaction-local context contract (§3.3) and the capability IAM model (§5.3). Everything ran in disposable PostgreSQL 16 databases under `/tmp`. **The SQL in the appendix is an experimental test fixture, not master DDL.** It exists so the results can be reproduced and challenged.

## 0. Status, evidence and environment

**Result: 61 of 61 named checks passed** in one clean end-to-end run (`results_1_2_3_4_5.json`). Of these, 8 are *negative or finding* checks: they pass when they successfully demonstrate a leak, a gap or a defect (2.11, 2.16, 3.11, 3.12, 3.13, 3.16, 4.02, and 1.16's silent-zero illusion). Those are called out wherever they appear. They are not claims that the system is safe.

**Labels:** **[O]** observed in this investigation's executions; **[L]** stated in a locked dossier (`NN:Lnnn`); **[D]** PostgreSQL 16 documented behavior; **[I]** this report's inference or recommendation.

**Environment [O].**

- **Server:** PostgreSQL `16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)`, a fresh cluster in `/tmp/kernel-iam.qigQ4X/pgdata`. Access is through a private Unix socket on port 55466; TCP is disabled and authentication is `trust`, confined to that owner-only directory.
- **pgvector:**
  - The host has no pgvector package and no password-less `sudo`. App 4 correctly refuses to run with a substituted vector type (`04:L1586`).
  - pgvector **v0.8.6** was therefore built from source against the exactly matching `postgresql-server-dev-16_16.15-0ubuntu0.24.04.1` headers. The headers were fetched with `apt-get download` and unpacked locally; nothing was installed system-wide.
  - The build ran against a **relocated copy of the PG16 binaries** under `/tmp`. PostgreSQL resolves `sharedir`/`pkglibdir` relative to its binary.
  - App 4's dossier recorded pgvector 0.6.0. Its full suite also passes on 0.8.6 (§1).
- **Unavailable here:**
  - PgBouncer is not installed. Pool behavior is simulated by reusing one server backend across successive "client" transactions, which is exactly what a pooler's server connection does (§4.4).
  - No Python PostgreSQL driver is installed, so all tests drive `psql` via subprocess.

**Read-only inputs (unchanged; verified by hash after writing):**

| Input | SHA-256 |
|---|---|
| `research/platform/00_master_kernel_research.md` | `8f2a8c41a70cf9bb73716422abd1d4faf4f3390d2354c902628fd68f2e0f688c` |
| `research/apps/01_contact_center_dossier.md` | `d60c9100092e275a9a4165e5a139f3f7e5c96273dbec53e6a18f234b485edd65` |
| `research/apps/02_guest_crm_dossier.md` | `e7481fcce7303cb55864ddfaac5c6f2bd8b4d2458eb427f6d3a286c815b7f2fb` |
| `research/apps/03_operations_task_dossier.md` | `e0de5d8b68a4ff106d164dfdf39790213d7b83b4e2b372d8ba875946419f5c1b` |
| `research/apps/04_storage_knowledge_dossier.md` | `fb7d4c8dee0e5ab423421a548716b83452560f99ebb5ff863bb1ea7acaaa870a` |
| `research/apps/05_ai_team_agent_core_dossier.md` | `d3bb193d0be03f0f78bd9b7b263a571cd04fd5e6d75f86045348f232e78dd97e` |

**Locked DDL blocks as executed (extracted byte-for-byte from the dossiers):**

| Block | Dossier line of the fence | SHA-256 |
|---|---|---|
| App 1 `contact_center` | `01:L249` | `3613437248eca9552274298d16985579c37cbf401dd182a69d202fc7fd7b6286` |
| App 2 `guest_crm` | `02:L269` | `2ac29ea9710bccc18abf0eb8d738849938a9f6cc26e8bf3eba1a0cb567400fff` |
| App 3 `ops` | `03:L208` | `bbcd0d38a75cb0cd982b8ae03da70edc410dd29e8fa34644fc14441680b6c102` |
| App 4 `kb` | `04:L240` | `3ad6e166044766ac8288c8cafd456fc621c6999d90d0b6dfb5795cb99eaf7d26` |
| App 5 `workforce` | `05:L245` | `d3a1c077ea20d4a789909693d1b83cf2c2a0af48eef94e40c87661f53f2b416a` (matches App 5's own recorded `ddl.sql` hash) |

---

## 1. Baseline: the five locked apps co-exist in one database without regression

This was the first gate proposed in `00 §10`. It had never been executed before this work.

**Co-installation [O].** The five DDL blocks ran unmodified, one `psql` session each with `ON_ERROR_STOP=1`, into a single database `kernel`:

- **82 tables:** `contact_center` 19, `guest_crm` 19, `ops` 20, `kb` 10, `workforce` 14.
- **RLS:** every table has both `relrowsecurity` and `relforcerowsecurity`.
- **Roles:** the 15 created roles do not collide, and all are `NOLOGIN NOSUPERUSER NOBYPASSRLS`.
- **Extensions:** `btree_gist` 1.7, `pgcrypto` 1.3 and `vector` 0.8.6 are shared in `public`. Repeated `CREATE EXTENSION IF NOT EXISTS` statements are harmless no-ops.

One ordering detail: App 1 and App 2 use session-level `SET search_path` inside their migrations (`01:L254`, `02:L279`). They must therefore run in separate sessions, never concatenated into one script.

**Regression [O].** Apps 3, 4 and 5 publish executable verification harnesses. They were run against the shared database. The only edits were their connection arguments (socket, port, database name) and their scratch-file paths; the diffs were recorded and contain nothing else. Apps 1 and 2 publish only DDL-install recipes, and those succeeded.

| Suite | Checks recorded in dossier | Co-installed DB | + kernel layer (no FK) | + kernel with hard FK, app-owned projections |
|---|---|---|---|---|
| App 3 `verify.py` | 47 (`03:L1382`) | **47** | **47** | **47** |
| App 4 `verify.py` / `extra.py` | 43 / 17 (`04:L1456`) | **43 / 17** | **43 / 17** | **43 / 17** |
| App 5 `verify.py` / `verify_extra.py` | 59 / 11 (`05:L1867`) | **59 / 11** | **59 / 11** | **59 / 11** |

This is the strongest zero-regression evidence available without authenticated app services: **Pattern A from `00 §3.1` holds for the real schemas.**

---

## 2. Correcting the brief's registry description

The brief summarizes the five registries. The actual columns, read from `information_schema` in the co-installed database [O], differ in ways that matter for projection:

| Registry | Actual columns (NOT NULL / default) | Owner after locked migration | Differences from the brief |
|---|---|---|---|
| `contact_center.spaces` | `id uuid DEFAULT gen_random_uuid()`, `property_code text UNIQUE`, **`name text NOT NULL`**, `timezone DEFAULT 'Asia/Tbilisi'`, `settings jsonb DEFAULT '{}'` (object check), **`created_at DEFAULT clock_timestamp()`** | migration superuser | The brief omits the required `name` and `created_at`. The `DEFAULT gen_random_uuid()` lets App 1 mint tenants on its own |
| `guest_crm.spaces` | `id uuid` (no default), `property_code text UNIQUE`, `timezone` | migration superuser | as stated |
| `ops.spaces` | `space_id uuid`, `property_name text NOT NULL`, `timezone` | `ops_owner` | as stated |
| `kb.spaces` | `space_id uuid`, `name text NOT NULL`, `knowledge_epoch bigint DEFAULT 1 CHECK > 0` | `kb_owner` | **no timezone column** |
| `workforce.ai_spaces` | `space_id uuid`, `enabled boolean DEFAULT true` | `ai_owner` | **no name, code or timezone**; it is the only per-app suspension flag |

**Ownership consequence [O/I].** App 1 and App 2 create no owner role (`01:L245`, `02:L265`), so their tables belong to whichever role ran the migration. In this test that was a superuser, and `FORCE ROW LEVEL SECURITY` does not restrain superusers. A production deployment must run those two migrations as dedicated `NOSUPERUSER NOBYPASSRLS` owner roles, as Apps 3, 4 and 5 do. This is an additive deployment requirement, not a DDL change.

---

## 3. Area 1 — resolving the Five Spaces Problem

### 3.1 What was built (Option 1)

The experimental kernel adds the following. The full fixture is in Appendix A.

- **Tenant registry:** a `platform` schema with `platform.spaces`, holding `id`, `property_code`, `display_name`, `timezone`, `lifecycle ∈ {ACTIVE, SUSPENDED, OFFBOARDED}`, `lifecycle_version` and `created_at`. It has ENABLE + FORCE RLS: kernel roles see every row, and any other reader sees only its bound tenant.
- **Hard FKs:** each app registry gets `FOREIGN KEY (id|space_id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT`. These are additive constraints; no locked column changes.
- **Provisioning trigger:** an `AFTER INSERT OR UPDATE` trigger, `platform.provision_projections()`. It is `SECURITY DEFINER`, owned by the `NOBYPASSRLS` role `platform_provisioner`, and declares `SET search_path = pg_catalog, pg_temp` and **`SET app.space_id = ''`**. Inside, it sets the new tenant's context and writes all five projection rows in the same transaction.
- **Drift repair:** `platform.reconcile_space(uuid)` repairs drift per tenant with `ON CONFLICT DO NOTHING`.

### 3.2 Results [O]

| # | Check | Evidence |
|---|---|---|
| 1.01 | App owners need **both** `USAGE ON SCHEMA platform` **and** `REFERENCES ON platform.spaces` to add the FK | first `permission denied for schema platform`, then `permission denied for table spaces` |
| 1.02 | All five registries carry the FK once granted | 5 constraints |
| 1.03 | FK rejects an app-minted tenant row, **even for a superuser** | `violates foreign key constraint "spaces_platform_fk"` |
| 1.04 | FK neutralizes App 1's `DEFAULT gen_random_uuid()` tenant creation | same |
| 1.05 | Provisioning fails without `EXECUTE` on `ops.tenant()`, `kb.tenant()`, `workforce.tenant()`: **RLS policy functions run with the invoking role's privileges** | `permission denied for function tenant` |
| 1.06 | That failure leaves no partial rows anywhere | 0 residual rows |
| 1.07 | One kernel insert produces exactly one projection per schema | `{contact_center:1, guest_crm:1, ops:1, kb:1, workforce:1}` |
| 1.08 | Local columns preserved: App 1 `settings={}` and `created_at` defaulted, App 4 `knowledge_epoch=1`, App 5 `enabled=true`, timezone and name copied to the columns that exist | projection snapshot in results JSON |
| 1.09 | The trigger's function-level `SET app.space_id` clause **restores the caller's own tenant context** after it switched context internally | caller context unchanged |
| 1.10 | A failure in the 5th projection rolls back the kernel row and the four earlier projections | `permission denied for table ai_spaces`; 0 residual rows |
| 1.11 | Invalid IANA timezone (`Asia/Tiblisi`) rejected before any projection | trigger error |
| 1.12 | Hard delete of a provisioned property is blocked; offboarding is a lifecycle state | FK restrict error |
| 1.13 | Rename, re-code and suspend propagate in one statement: App 1 `name`/`property_code`, App 2 `property_code`, App 3 `property_name`, App 4 `name`, App 5 `enabled=false`, `lifecycle_version` 1→2 | exact values |
| 1.14 | `OFFBOARDED` is terminal | trigger error |
| 1.15 | The RI check succeeds for a role with **no SELECT privilege on** (and RLS-hidden rows in) `platform.spaces`. FK checks bypass RLS and table privileges, so apps need only `REFERENCES` | `ops_owner` SELECT = `f` |
| 1.16 | **Silent-zero illusion reproduced:** a drift probe without tenant context counts 0 `kb.spaces` rows while 2 exist | visible 0, actual 2 |
| 1.17 | Per-tenant reconcile repairs exactly the missing projection and is idempotent | `{kb}` then `{}` |

**Provisioning cost [O, indicative only]:** 500 properties provisioned in one transaction in 8.2 s, about 16 ms per property across all five schemas, FKs and triggers included. This was one laptop-class run, not a benchmark. Property creation is a rare administrative act, so synchronous cost is irrelevant at hotel scale.

### 3.3 Privilege model the experiment forced into the open [O]

These are exact requirements, discovered by failing first:

1. **FK creation** needs `USAGE` on the kernel schema **and** `REFERENCES` on the kernel table, granted to each app's table owner (1.01).
2. **FK enforcement** needs neither `SELECT` nor RLS visibility on the kernel table (1.15). Apps therefore never need to read the kernel registry.
3. **Writing another app's RLS-protected table** requires `EXECUTE` on the functions its policies call. Three of the five apps call `tenant()`, and they revoke `EXECUTE` from `PUBLIC` (1.05). Apps 1 and 2 inline the expression and need nothing.
4. **`INSERT … ON CONFLICT DO UPDATE`** requires column `SELECT` on **every column read through `EXCLUDED`** and on the conflict target, in addition to `UPDATE` on the assigned columns. `ON CONFLICT DO NOTHING` needs only `INSERT` (probe in §5.5).
5. **A `SET` clause on a function** confines any `set_config(…, true)` of *that same variable* to the call, and restores it at exit (1.09, 2.17). It does **not** confine other variables (2.17). This is what makes it safe for a kernel function to switch tenant context internally.
6. **An untyped literal appended to `text[]`** (`arr || 'kb'`) is parsed as an array literal and fails. Kernel PL/pgSQL must cast explicitly. This was a real bug caught in the fixture.
7. **Roles are cluster-global.** Re-running the kernel fixture in a second database failed with `role "platform_owner" already exists`. The fixture now provisions roles idempotently **and refuses to adopt a pre-existing role with `SUPERUSER`, `BYPASSRLS` or `LOGIN`** (Appendix A, `@@roles`).

### 3.4 Option 2 — asynchronous `SpaceCreatedEvent` provisioning (analyzed, not executed)

| Criterion | Option 1: FK + synchronous projection (tested) | Option 2: kernel event, each app consumes and creates its own row |
|---|---|---|
| Atomicity | All-or-nothing across five schemas (1.06, 1.10) | Eventual. A window exists where App 1 knows the property and App 5 does not |
| Orphan / typo tenants | Impossible at the DB level (1.03, 1.04) | Possible unless each app validates against the kernel, and App 1's `DEFAULT gen_random_uuid()` stays live |
| Drift detection | Structural for orphans; missing projections still need reconcile (1.16/1.17) | Everything needs reconcile |
| Pattern C extraction (app in its own DB) | FK must be dropped and replaced by Option 2 for that app | Native |
| Required privileges | Kernel provisioner needs narrow column grants plus `EXECUTE tenant()` in every app schema (cross-app write privilege) | Each app writes only its own registry |
| Failure isolation | One app's registry defect blocks property creation for all | A broken consumer delays only that app |
| Locked-fixture compatibility | Breaks harnesses that mint tenants themselves (4.02) | Compatible |
| Infrastructure | None beyond the DB | Relay, inbox, dead-letter and reconcile (the `00 §4` machinery) |

**Decision [I]: Option 1 inside the shared database, with Option 2 semantics kept for anything outside it.** Concretely:

- **FK always.** It is the only thing that makes a stray tenant physically impossible, and 4.03 shows it is compatible with every locked suite.
- **Synchronous kernel projection for the five in-database registries.** Provisioning is rare and atomic, and the alternative is building an event pipeline to keep five rows in sync inside one database.
- **Emit `SpaceProvisionedEvent` from the kernel outbox as well**, for things the database cannot do transactionally: object-store prefixes (App 4), IdP groups, channel-account setup (App 1). These consumers are idempotent and reconciled, per `00 §4.5`.
- **If an app later moves to its own database (Pattern C)**, that app drops its FK and switches to consuming the event. Both are specified now, so the move is a configuration change.

### 3.5 The one compatibility cost, precisely located [O]

- **4.02:** with the hard FK installed, the App 3, 4 and 5 suites fail at their first fixture statement, which inserts the tenant row directly: `violates foreign key constraint "spaces_platform_fk"`. App 4's `extra.py` then fails on a downstream FK because its prerequisite data was never seeded.
- **4.03:** with the FK kept but the kernel's projection trigger disabled, and the fixture tenant UUIDs pre-registered in `platform.spaces`, **every suite passes unchanged**.

The FK is therefore not the incompatibility. The only conflict is between a *kernel-owned* projection and an *app-owned* insert of the same row. **No locked JSON contract, API or app-schema column is affected.** The change is procedural, as `00` CR14 anticipated: *tenant registry rows are provisioned only from the kernel.*

The migration path for app test fixtures is one line: create the tenant through `platform.spaces` and let the projection appear. Apps that must keep minting their own rows during a transition can run in "FK-only" mode, the configuration tested in 4.03.

### 3.6 Lifecycle and suspension [O/I]

`lifecycle` changes propagate, but only App 5 has a per-app enabled flag (1.13). Suspension is therefore enforced **at the request-context boundary for every app**: `platform.begin_request` refuses any context for a suspended property (2.21). App 5 additionally re-checks `ai_spaces.enabled` at every boundary (`05:L562`).

**Offboarding** is a terminal state (1.14). Deletion is blocked by the FKs (1.12). Physical deletion of a property's data is a separate, audited retention procedure, outside this sub-component.

---

## 4. Area 2 — transaction-local context injection and dual-pool isolation

### 4.1 The brief's raw protocol, evaluated

The brief proposes four raw statements:

- `SET LOCAL app.space_id`
- `SET LOCAL app.actor_id`
- `SET LOCAL app.staff_id` (the App 3 alias)
- `SET LOCAL search_path`

**It works mechanically** (2.01–2.07, 2.13–2.15). The tests surfaced four hazards it leaves open:

1. **Divergence.** Nothing in SQL stops `app.actor_id` and `app.staff_id` from holding different people (2.16, negative). App 3 would then attribute work to someone other than the person Apps 4 and 5 see.
2. **Omission.** Setting only `app.actor_id` makes `ops.actor()` NULL (2.14). App 3 fails closed, but confusingly.
3. **No validation.** Raw `SET LOCAL` accepts any UUID. Membership, property state and app scope go unchecked.
4. **Mid-transaction re-binding.** A second `SET LOCAL app.space_id` silently switches tenant inside one transaction, which breaks the one-app-per-transaction rule (`00 §3.3`).

### 4.2 Finalized protocol [O/I]

Each request opens exactly one transaction, and the gateway runs:

1. `BEGIN`
2. `SELECT platform.begin_request(<space>, <auth_subject from the verified token>, '<app>')`
   - Validates that the property is `ACTIVE`, that the principal is an enabled member of **that** property, and that the app name is on the allowlist.
   - Refuses re-binding to a different property within the transaction.
   - Sets `app.space_id`, `app.actor_id` and `app.staff_id` to **one** member UUID, plus `app.request_app`. All are transaction-local.
3. `SET LOCAL search_path = <app schema>, pg_catalog`
4. `SET LOCAL ROLE <app workload role>` (optional, when one gateway pool serves several roles)
5. The app's own statements and functions.
6. `COMMIT` or `ROLLBACK`. Every setting reverts either way.

**Why `search_path` is a separate statement and not set inside the helper [O].** A `SECURITY DEFINER` function should pin its own `search_path` to be hijack-safe. But a pinned `search_path` clause also **reverts any `search_path` the function sets for its caller** at exit (2.17). A function without the clause does persist it to transaction end (2.18). `begin_request` therefore has no `search_path` clause and uses only fully qualified names, which keeps it hijack-safe, and the gateway sets `search_path` itself.

Verified behavior of the helper:

| # | Result |
|---|---|
| 2.19 | Sets space, actor, staff alias and app from one validated membership. After `COMMIT` all read `''` |
| 2.20 | Refuses a disabled member, a property the principal does not belong to, an unknown app, and re-binding to a second property in the same transaction |
| 2.21 | Refuses every context for a `SUSPENDED` property |
| 2.22 | Only `platform_gateway` may execute it (`EXECUTE` revoked from `PUBLIC`) |

**Security boundary, restated.** The helper is a *consistency and validation* layer. It is **not** authentication: any SQL session can still call `set_config('app.space_id', …)` directly, because custom settings carry no privilege [D; `05:L241`]. Isolation rests on only the gateway holding database credentials. The helper makes the gateway's context correct, uniform and auditable.

### 4.3 Context semantics verified [O]

| # | Behavior | Evidence |
|---|---|---|
| 2.01 | `SET LOCAL` value visible inside its transaction and gone after `COMMIT` | exact values |
| 2.02 | **Never set → `NULL`; after revert → `''` (empty string).** The `nullif(…, '')` in every app's policy is load-bearing. A kernel helper written as `current_setting(…)::uuid` would throw after the first transaction on a pooled connection | `<NULL>`, then `''` |
| 2.03 / 2.04 | Errored-then-rolled-back and plain-rolled-back transactions both discard context | `''` |
| 2.05 | `SET LOCAL` outside a transaction block: `WARNING: SET LOCAL can only be used in transaction blocks`, no lasting effect | warning captured |
| 2.06 | `ROLLBACK TO SAVEPOINT` restores the pre-savepoint tenant | A → B → A |
| 2.07 | `SET LOCAL search_path` and `SET LOCAL ROLE` revert at `COMMIT` | `"$user", public / <session user>` |
| 2.08 | **No tenant context → 0 rows in all five schemas** for an ordinary `NOBYPASSRLS` role | `{cc:0, crm:0, ops:0, kb:0, ai:0}` |
| 2.09 / 2.10 | With context, each schema shows exactly the bound property, and it is the right one | 1 row per schema, matching IDs |
| 2.14 / 2.15 | `ops.actor()` reads `app.staff_id`; `kb.actor()` and `workforce.actor()` read `app.actor_id`; with the alias, all three agree | `<NULL>,X,X` then `X,X,X` |

### 4.4 Pool reuse and the dual-pool design [O/I]

**Simulated pooling.** A pooler's server connection is one backend reused by successive clients, so the tests reused one backend the same way:

- **2.11 (negative):** one "client" runs a session-level `SET app.space_id`. The next client, which never set a tenant, **sees tenant A's rows.** This is the classic pooled-RLS leak, reproduced.
- **2.12:** `DISCARD ALL` on check-in removes the leaked context.
- **2.13:** 200 alternating A/B transactions on one reused backend, each followed by a context-free transaction. **200 of 200 saw only their own tenant, and 200 of 200 context-free transactions saw 0 rows.** Transaction-local context is safe under transaction pooling.

**Advisory locks and the second pool:**

- **2.23:** `DISCARD ALL` **releases session-level advisory locks.** App 1's dispatcher holds a session advisory lock across the provider HTTP call on a pinned connection (`01:L193–196`). A pool reset during a send would silently drop App 1's send/takeover gate. Pinned connections must be returned, and reset, **only after the dispatcher's `finally` block has released the lock itself.**
- **2.24:** transaction-level advisory locks release at `COMMIT`, so they are safe under transaction pooling.
- **2.25:** a `bigint` advisory key and a two-`int4` key with **identical bits** (`4294967298` and `(1, 2)`) do not conflict; `pg_locks.objsubid` is 1 and 2 respectively. **Per-app namespacing through a fixed `classid` in the two-key form works** and can replace today's shared `hashtextextended` bigint keyspace (`00 §3.4`).

**Dual-pool specification [I]:**

| Pool | Mode | Used by | Check-out | Check-in | Hard limits |
|---|---|---|---|---|---|
| **P1 request pool**, one per app workload role | transaction | all API and worker transactions | `BEGIN` → `begin_request` → `SET LOCAL search_path` / role | nothing (context is transaction-local) | `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout` set on the role |
| **P2 pinned pool**, small and monitored | session | App 1 dispatcher send gate (`01:L193`), `LISTEN` wake-ups (`01:L212`, `03:L1172`), migrations | explicit, one owner | **only after the owner releases its session advisory locks**, then `DISCARD ALL`; broken connections are discarded, not reused (`01:L196`) | small max size; alert on long holds |

Nothing in P1 may use session-level `SET`, session advisory locks, `LISTEN` or temporary tables. A lint rule in the gateway (reject any `SET` without `LOCAL`) is cheap.

**Limitations.** No PgBouncer binary was tested. Pooler-specific behavior such as protocol-level prepared statements, `server_reset_query` and `track_extra_parameters` still needs a test with the chosen pooler. The PostgreSQL-side semantics that matter are established above.

### 4.5 Advisory-lock classid allocation (proposal) [I]

| classid | Owner | Current bigint key it replaces |
|---|---|---|
| 1 | App 1 conversation send/claim gate | `hashtextextended(space‖':'‖conversation)` (`01:L193`) |
| 2 | App 2 profile and erasure serialization | `hashtextextended(space‖':'‖profile)` (`02:L626`) |
| 3 | App 3 request ingest | `hashtextextended(space‖request)` (`03:L487`) |
| 4 | App 4 ingest commands | `hashtextextended(tenant‖command)` (`04:L434`) |
| 5 | App 5 session commands | `hashtextextended(tenant‖command)` (`05:L439`) |
| 100+ | Kernel (provisioning, relay leases) | — |

The second key becomes `hashtext(<object>)`, an int4. Collisions within one app remain possible, but they now serialize only that app's work (`01:L193`). They can no longer couple apps. This is a change request to Apps 1–5 and is not needed for correctness today.

---

## 5. Area 3 — the canonical IAM capability matrix

### 5.1 What each app's database actually enforces [O]

Before designing a mapping, the tests established which local role values carry **database-enforced** meaning:

| App | Local role values | DB-enforced semantics | Label-only (gateway meaning) |
|---|---|---|---|
| 1 | `participants.kind = 'operator'` + `auth_subject` | operator-only claim; AI and guest transition limits (`01:L687–692`) | reception, housekeeping, finance and similar are prose roles (`01:L2689`) |
| 2 | none (bare actor UUIDs) | — | audiences and purposes at the service layer (`02:L754`) |
| 3 | `staff_role ∈ {ATTENDANT, TECHNICIAN, FRONT_DESK, SUPERVISOR}` + `skills[]` | **only `SUPERVISOR`** (inspect, release, rework: `03:L672–680`); claiming is gated by **skills**, shift, zone and capacity (`03:L558–568`) | `ATTENDANT`, `TECHNICIAN`, `FRONT_DESK` |
| 4 | `role_name ∈ {EDITOR, APPROVER}` | **only `APPROVER`** (approve, archive: `04:L483`, `04:L509`); upload requires any enabled member (`04:L437`) | `EDITOR` |
| 5 | `role_name ∈ {CONFIGURATOR, APPROVER}` | **only `APPROVER`**, for both `publish_graph` (`05:L414`) **and** `resume_session` (`05:L528`) | `CONFIGURATOR` |

Two consequences shape the mapping:

1. **In Apps 3, 4 and 5 the enforced role is a strict superset of the labels.** A precedence rule that picks the enforced role when any of its capabilities is present therefore loses no DB-enforced permission. It is *lossless* at the database level (3.08).
2. **Separation of duties in the database is per item, not per person:** App 4 uploader ≠ approver per revision (`04:L484`), App 5 creator ≠ publisher per graph (`05:L414`), App 3 attester ≠ inspector per task (`03:L676`). The kernel's job is to guarantee **one identity per human per property**, so those per-item comparisons compare the same person.

### 5.2 Closed capability catalog (25 capabilities, 5 domains)

Enforced by: **DB** = a locked SQL function or trigger enforces it once the local role is projected; **GATEWAY** = the app's API must check the capability claim in the token; **DB+GATEWAY** = both.

| Domain | Capability | Enforced by | Local projection |
|---|---|---|---|
| **Communication** (6) | `cc.inbox.read` | GATEWAY | — |
| | `cc.conversation.claim` | DB+GATEWAY | App 1 operator participant |
| | `cc.message.send` | DB+GATEWAY | App 1 operator participant |
| | `cc.draft.request_ai` | GATEWAY | — |
| | `cc.request.authorize` | GATEWAY | (App 1 `authority.approved_by`, `01:L1594–1744`) |
| | `cc.conversation.supervise` | GATEWAY | — |
| **CRM** (5) | `crm.context.read`, `crm.profile.correct`, `crm.merge.review`, `crm.erasure.request`, `crm.field.approve` | GATEWAY | none (App 2 has no member table) |
| **Operations** (6) | `ops.task.view` | GATEWAY | — |
| | `ops.task.work` | DB+GATEWAY | App 3 staff row (`ATTENDANT` unless higher) + skills |
| | `ops.maintenance.work` | GATEWAY | App 3 `TECHNICIAN` label |
| | `ops.request.triage` | GATEWAY | App 3 `FRONT_DESK` label |
| | `ops.task.supervise` | DB+GATEWAY | App 3 `SUPERVISOR` |
| | `ops.room.inspect` | DB | App 3 `SUPERVISOR` |
| **Knowledge** (4) | `kb.search.operations` | GATEWAY | — (operations search needs no membership) |
| | `kb.document.upload` | DB+GATEWAY | App 4 `EDITOR` (recorded as `uploaded_by`) |
| | `kb.policy.approve` | DB | App 4 `APPROVER` |
| | `kb.policy.archive` | DB | App 4 `APPROVER` |
| **AI Management** (4) | `ai.graph.configure` | GATEWAY | App 5 `CONFIGURATOR` |
| | `ai.graph.approve` | DB+GATEWAY | App 5 `APPROVER` |
| | `ai.session.resume` | DB+GATEWAY | App 5 `APPROVER` (overloaded: see 5.5) |
| | `ai.space.pause` | GATEWAY | — (kernel lifecycle or `ai_spaces.enabled`) |

**Closed means closed [O, 3.01]:** granting an unknown capability fails on its foreign key. A capability whose prefix does not match its domain fails a check constraint. The rejected example is `ai.guest.emotion_score` filed under CRM. No emotion-recognition, credit-scoring or refund-execution capability exists, consistent with `05 §7.4`.

### 5.3 The six hotel role templates

| Capability | General Manager | Front Desk Lead | Housekeeping Supervisor | Room Attendant | Cellar / Sommelier Lead | Content / Policy Editor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| cc.inbox.read | ● | ● | | | ● | |
| cc.conversation.claim / cc.message.send | | ● | | | ● | |
| cc.draft.request_ai | | ● | | | ● | |
| cc.request.authorize | | ● | | | | |
| cc.conversation.supervise | ● | ● | | | | |
| crm.context.read | | ● | | | ● | |
| crm.profile.correct | | ● | | | | |
| crm.merge.review / crm.field.approve | ● | | | | | |
| crm.erasure.request | ● | ● | | | | |
| ops.task.view | ● | ● | ● | ● | | |
| ops.task.work | | | ● | ● | | |
| ops.request.triage | | ● | | | | |
| ops.task.supervise / ops.room.inspect | ● | | ● | | | |
| kb.search.operations | ● | ● | ● | ● | ● | ● |
| kb.document.upload | | | | | ● | ● |
| kb.policy.approve / kb.policy.archive | ● | | | | | |
| ai.graph.configure | | | | | ● | |
| ai.graph.approve / ai.space.pause | ● | | | | | |
| ai.session.resume | | ● | | | | |

**Design notes [I]:**

- The General Manager supervises and approves but does not operate guest chats by default. Adding the Front Desk Lead template when needed is a union, not a new role.
- The Sommelier authors the cellar persona and uploads wine lists, but **cannot approve either**. The General Manager approves both, which preserves independent review of prices, vintages and allergen fields (`04:L51`).
- The Content Editor has no approval capability of any kind.
- Skills (`housekeeping`, `maintenance`, `front_desk`, `billing`, `food_beverage`: App 3's task categories, `03:L256`) are **member qualifications**, not template capabilities. The kernel projects them into `ops.staff_members.skills`.

### 5.4 The mapping function (template → local columns)

`platform.local_roles(capabilities[])` is a deterministic, total, `IMMUTABLE` function:

| Target | Rule (first match wins) |
|---|---|
| App 1 | operator participant iff `cc.conversation.claim` or `cc.message.send`. Row `id` = kernel member UUID, `kind='operator'`, `auth_subject` from the principal |
| App 3 `staff_role` | `SUPERVISOR` if `ops.room.inspect` or `ops.task.supervise` → `FRONT_DESK` if `ops.request.triage` → `TECHNICIAN` if `ops.maintenance.work` → `ATTENDANT` if `ops.task.work` → no row |
| App 3 `skills[]` | the member's kernel skills |
| App 4 `role_name` | `APPROVER` if `kb.policy.approve` or `kb.policy.archive` → `EDITOR` if `kb.document.upload` → no row |
| App 5 `role_name` | `APPROVER` if `ai.graph.approve` or `ai.session.resume` → `CONFIGURATOR` if `ai.graph.configure` → no row |
| App 2 | nothing. Capabilities are enforced by the CRM service from the token (`02:L754`) |

`platform.project_member(space, member)` applies the mapping inside the member's property context. Its rules:

- **Upsert only.** It never deletes: the app member tables are foreign-key targets of history such as `uploaded_by`, graph `created_by` and task attestations.
- **Losing every capability for an app** sets `enabled=false` and keeps the last role for audit.
- **Idempotent** (3.03): re-running yields identical capability sets and row counts `4, 3, 3, 2` (App 3, App 4, App 5, App 1).
- **Tenant-scoped** (3.04): no rows appear in a property the member does not belong to.

**Projection results for the six templates [O, 3.02]** match the expected table exactly:

| Template | App 1 | App 3 | App 4 | App 5 |
|---|---|---|---|---|
| General Manager | — | `SUPERVISOR` | `APPROVER` | `APPROVER` |
| Front Desk Lead | `operator` | `FRONT_DESK` | — | `APPROVER` ⚠ |
| Housekeeping Supervisor | — | `SUPERVISOR` + `housekeeping` | — | — |
| Room Attendant | — | `ATTENDANT` + `housekeeping` | — | — |
| Cellar / Sommelier Lead | `operator` | — | `EDITOR` | `CONFIGURATOR` |
| Content / Policy Editor | — | — | `EDITOR` | — |

### 5.5 Separation-of-duty invariants, exercised through the locked functions [O]

These tests drive the real `kb.register_revision` → `kb.process_revision` → `kb.approve_policy`, and `workforce.publish_graph`, with kernel-projected identities. None of it is simulated.

| # | Invariant | Result |
|---|---|---|
| 3.05 | Content Editor cannot approve their own upload; Sommelier (`EDITOR`) cannot approve anyone's | `independent human approver required` ×2 |
| 3.06 | General Manager (`APPROVER`, not the uploader) approves the editor's revision | success; `knowledge_epoch` 1 → 2 |
| 3.07 | An `APPROVER` who uploads cannot approve their own revision | refused |
| 3.08 | A member with Content Editor + General Manager collapses to `APPROVER` and can approve someone else's revision | lossless precedence confirmed |
| 3.09 | Sommelier (creator, `CONFIGURATOR`) cannot publish their own graph | `independent graph approver required` |
| 3.10 | General Manager publishes the sommelier's graph | `ACTIVE`, `approved_by` = GM |
| 3.14 | The kernel refuses a second membership for the same principal in one property; App 4 refuses a duplicate `auth_subject` | unique violations |
| 3.15 | Removing all templates disables (never deletes) the projected rows in Apps 3, 4 and 5; the database then refuses the former approver | `false,false,false`; publish refused |

**How the mapping prevents a Content Editor from being both uploader and approver.** It works at two independent layers:

1. **The template never grants approval.** The editor projects to `EDITOR`, so `approve_policy` refuses them for *every* revision (3.05).
2. **Even a person who holds approval** (Editor + GM) is still refused on *their own* revision. `register_revision` binds `uploaded_by = actor()` inside a `SECURITY DEFINER` function (`04:L443`), and `approve_policy` compares it (3.07).

The kernel's contribution is that `actor()` is one stable UUID per human per property (3.14), so a person cannot upload as one identity and approve as another.

### 5.6 Defects and gaps the experiment exposed (change requests) [O]

| # | Finding | Evidence | Why it matters | Change request |
|---|---|---|---|---|
| F1 | **App 5 overloads `APPROVER`**: `resume_session` requires it, so granting a Front Desk Lead the ability to resume an interrupted guest session also lets the database accept them publishing agent graphs | 3.11: Front Desk Lead published a graph (`ACTIVE`) | Least privilege is broken at the DB layer. Only the gateway can hold the line (`ai.graph.approve` ≠ `ai.session.resume`) | App 5: add a distinct local role (e.g. `RESUMER`) or a capability column; `resume_session` checks it and `publish_graph` does not |
| F2 | **App 5 does not bind `created_by` to `actor()`**: `ai_config` inserts drafts with any `created_by`. An approver recorded a colleague as author and then published it themselves | 3.12: `created_by` = Sommelier, `approved_by` = GM, after GM inserted the draft | Graph separation of duties is bypassable by any approver holding `ai_config` credentials. App 4 does not have this defect (`uploaded_by = actor()` inside its definer function) | App 5: set `created_by := actor()` in `graph_insert_guard` (or a definer `create_draft` function), and reject a mismatch |
| F3 | **App 5 `ai_members` has no `auth_subject`**: a second `APPROVER` identity for the same human was accepted | 3.13 (negative) | Alias self-approval is possible if anything other than the kernel writes `ai_members` | App 5: add `auth_subject` with `UNIQUE(space_id, auth_subject)` as Apps 1, 3 and 4 have. Until then the kernel must be the only writer |
| F4 | **App 1 operator participants have no `enabled` flag**; revocation leaves the operator row in place | 3.16 | Operator revocation exists only at the token and gateway layer. `change_control` accepts any operator participant as actor | App 1: add `disabled_at` to `participants` and check it in `change_control` and the send path |
| F5 | **App 5 `resume_session` has no independence rule** (interrupter ≠ resumer) | code review, `05:L528` | A single approver can interrupt and resume | Decision for App 5; not a kernel defect |
| F6 | **App 1/2 tables are owned by the migration role** (superuser in tests) | §2 | `FORCE RLS` does not restrain a superuser owner | Deployment: run App 1/2 migrations as `NOBYPASSRLS` owner roles |

F1 and F2 are the most important results of this sub-component. The kernel's capability model mitigates F1 at the gateway. Neither F1 nor F2 can be fixed from the kernel alone, because the database accepts the action.

---

## 6. Finalized specification for Sub-Component A

Normative for the next phase; to be implemented as reviewed migrations, not by copying the fixture.

**Objects.**

- `platform.spaces`: the only tenant ID authority.
  - Immutable `id`; unique uppercase `property_code`; validated IANA `timezone`; `lifecycle` `ACTIVE → SUSPENDED ↔ ACTIVE → OFFBOARDED` (terminal); `lifecycle_version`.
- `platform.principals`: `auth_subject` is unique, and is the only global human identifier.
- `platform.members`: `(space_id, member_id)`, `UNIQUE (space_id, principal_id)`, `enabled`. The member UUID **is** the actor UUID in every app for that property.
- `platform.capabilities`: closed catalog, domain-checked.
- `platform.role_templates`, `platform.template_capabilities`, `platform.member_templates`: property-assigned bundles.
- `platform.member_skills`: qualifications projected to App 3.
- A kernel outbox for `SpaceProvisionedEvent`, `SpaceLifecycleChangedEvent` and `MemberProjectionChangedEvent`, for consumers outside the database (spec in the relay sub-component).

**Roles** (all `NOLOGIN NOSUPERUSER NOBYPASSRLS`, provisioned idempotently with attribute verification):

| Role | Purpose |
|---|---|
| `platform_owner` | owns kernel tables |
| `platform_provisioner` | owns the projection functions. Holds exactly: `USAGE` on the five app schemas; column-level `INSERT`/`UPDATE`/`SELECT` on the five registries and four member tables; `EXECUTE` on `ops`/`kb`/`workforce` `tenant()` |
| `platform_gateway` | may only execute `begin_request` |

App owner roles get `USAGE ON SCHEMA platform` + `REFERENCES ON platform.spaces`, and nothing else.

**Invariants (each tested):**

- Every app registry row has a kernel row. Hard FK, `ON DELETE RESTRICT` (1.02–1.04, 1.12).
- Property provisioning is atomic across all five schemas (1.06, 1.10).
- Kernel functions that switch tenant context internally declare `SET app.space_id = ''` and so restore the caller's context (1.09).
- Request context is transaction-local, set once per transaction via `begin_request`, bound to one property, and actor = staff alias (2.13, 2.16, 2.19, 2.20).
- A context-free session sees zero rows in every app (2.08).
- One identity per human per property (3.14). Projection is idempotent, never deletes, and disables on revocation (3.03, 3.15).

**Protocols:** the request transaction (§4.2); the dual pools (§4.4); advisory `classid` allocation (§4.5); per-tenant reconcile for drift, never a context-free scan (1.16, 1.17).

**Required app changes** (tracked with `00 §8`):

- F1–F4 above.
- Test fixtures create tenants through the kernel (§3.5).
- App 1/2 owner roles (F6).
- Advisory `classid` adoption (low priority).

**Open decisions:**

1. Whether App 3, 4 and 5 should support multiple roles per member. The tests show single-role with precedence is lossless for App 3 and App 4, and for App 5 once F1 is fixed. **Recommendation: keep single-role.**
2. Whether `ai.session.resume` belongs to the Front Desk Lead at all before F1 is fixed. **Recommendation: grant it only to the General Manager until App 5 separates the roles.**
3. Pooler choice and configuration test (PgBouncer ≥ 1.21 or equivalent).

---

## 7. Reproduction

From the repository root, on a machine with PostgreSQL 16 (plus pgvector 0.6.0 or later available to the server) and Python 3.12 with `jsonschema`. If pgvector is missing and packages cannot be installed, reproduce §0's route:

1. `apt-get download postgresql-server-dev-16` and unpack it with `dpkg-deb -x`.
2. Build `pgvector` with `PG_CPPFLAGS=-I<unpacked>/usr/include/postgresql/16/server`.
3. Copy `/usr/lib/postgresql/16` and `/usr/share/postgresql/16` under one prefix in `/tmp`.
4. Add `vector.so`, `vector.control` and `sql/vector--*.sql` to the copy.
5. Run the cluster from the copied `bin`.

```bash
export KERNEL_WORKDIR="$(mktemp -d /tmp/kernel-iam.XXXXXX)"
mkdir -p "$KERNEL_WORKDIR/kernel" -m 700 "$KERNEL_WORKDIR/socket"
python3 - <<'PY'   # write the three appendix artifacts into $KERNEL_WORKDIR/kernel
import os, re
from pathlib import Path
md = Path('research/platform/subcomponents/01_kernel_iam_research.md').read_text()
for name, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```\w+\n(.*?)\n```', md, re.S):
    (Path(os.environ['KERNEL_WORKDIR']) / 'kernel' / name).write_text(body + '\n')
PY
python3 "$KERNEL_WORKDIR/kernel/prepare.py"
PGBIN="$(pg_config --bindir)"      # or the relocated copy's bin
"$PGBIN/initdb" -D "$KERNEL_WORKDIR/pgdata" -A trust --no-locale --encoding=UTF8
"$PGBIN/pg_ctl" -D "$KERNEL_WORKDIR/pgdata" -l "$KERNEL_WORKDIR/postgres.log" -o "-k $KERNEL_WORKDIR/socket -p 55466 -h ''" -w start
P="psql -X -q -h $KERNEL_WORKDIR/socket -p 55466 -v ON_ERROR_STOP=1"
$P -d postgres -c 'CREATE DATABASE kernel'
for n in 1 2 3 4 5; do $P -d kernel -f "$KERNEL_WORKDIR/ddl/app$n.sql"; done   # separate sessions: Apps 1/2 use session SET
$P -d postgres -c 'CREATE DATABASE kernel_clean TEMPLATE kernel'
for t in app3/verify.py app4/verify.py app4/extra.py app5/verify.py app5/verify_extra.py; do python3 "$KERNEL_WORKDIR/$t"; done
REPO="$PWD" python3 "$KERNEL_WORKDIR/kernel/test_kernel.py" 1 2 3 4 5
"$PGBIN/pg_ctl" -D "$KERNEL_WORKDIR/pgdata" -m fast stop
```

**Notes:**

- The harness clones `kernel_clean` for each part, so parts are independent. Roles persist across databases in one cluster, and the fixture tolerates that.
- Never point any of this at a hotel database.
- `trust` authentication is acceptable only inside the owner-only socket directory of a disposable cluster.

**Artifact fingerprints (as executed):**

| Artifact | SHA-256 |
|---|---|
| `kernel_experiment.sql` (Appendix A) | `28debaeed9558bc20ed0d046af3ed65d0a5d75313a942d53fcb1d7e3d117da00` |
| `test_kernel.py` (Appendix B) | `36ccd111a99e5967fcadd5e9a11ffd135391cf8edb0ed42518b12c99a185b0ea` |
| `prepare.py` (Appendix C) | `9a6e6a081d109dedd60a2a26ffa736640328185c777e018144156c8c41b46030` |

`prepare.py` was checked to regenerate byte-identical DDL blocks, harnesses and contract sets, after normalizing the work-directory path.

**Independent reproduction [O]:** the recipe above was replayed from this document alone into a new work directory and a new cluster, reusing only the relocated pgvector-enabled binaries. The locked suites passed at 47, 43, 17, 59 and 11, and `test_kernel.py 1 2 3 4 5` reported **61 passed, 0 failed**.

## 8. Limits of what this proves

- **Proven [O]:**
  - The five locked schemas co-exist with no regression.
  - The Option 1 mechanics and their exact privilege requirements.
  - Transaction-local context semantics, including pooled-backend reuse.
  - Fail-closed RLS in all five schemas.
  - The capability → local-role projection.
  - Separation of duties through the real App 4 and App 5 functions.
  - The two App 5 separation-of-duty defects.
- **Not proven:**
  - Behavior under a real pooler binary.
  - Concurrent provisioning races (only sequential and single-transaction tests ran).
  - The `SpaceProvisionedEvent` relay path.
  - Authenticated gateway token validation and capability claims.
  - App 1/2 behavioral suites: none are published, so only their DDL installed.
  - Performance at scale.
  - Migration of existing app data onto kernel member UUIDs.
- **Not done (by constraint):** no master DDL, no change to any locked dossier or contract.

---

## Appendix A — experimental kernel fixture (`kernel_experiment.sql`)

Disposable test fixture applied on top of the five unmodified locked DDLs. **Not master DDL.** Section markers (`-- @@name`) let the harness apply parts independently (for example, withholding `@@tenant_exec` to prove check 1.05).

<!-- artifact: kernel_experiment.sql -->
```sql
-- EXPERIMENTAL KERNEL LAYER (Sub-Component A micro-research). Disposable test fixture, NOT master DDL.
-- Applied on top of the five unmodified locked app DDLs in a throwaway PostgreSQL 16 database.
-- Section markers (-- @@name) let the harness apply pieces separately.

-- @@roles
-- Roles are cluster-global: provision idempotently and verify attributes instead of blind CREATE ROLE.
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['platform_owner','platform_provisioner','platform_gateway'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOBYPASSRLS', r);
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN RAISE EXCEPTION 'role % has unsafe attributes', r; END IF;
 END LOOP; END $$;
CREATE SCHEMA platform AUTHORIZATION platform_owner;

-- @@registry
SET ROLE platform_owner;
CREATE TABLE platform.spaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 property_code text NOT NULL UNIQUE CHECK (property_code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
 timezone text NOT NULL DEFAULT 'Asia/Tbilisi',
 lifecycle text NOT NULL DEFAULT 'ACTIVE' CHECK (lifecycle IN ('ACTIVE','SUSPENDED','OFFBOARDED')),
 lifecycle_version bigint NOT NULL DEFAULT 1 CHECK (lifecycle_version > 0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE platform.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.spaces FORCE ROW LEVEL SECURITY;
CREATE POLICY kernel_all ON platform.spaces TO platform_owner, platform_provisioner USING (true) WITH CHECK (true);
CREATE POLICY tenant_read ON platform.spaces FOR SELECT USING (id = nullif(current_setting('app.space_id', true), '')::uuid);
RESET ROLE;

-- @@fk  (Option 1: hard FK from every app registry to the kernel registry)
ALTER TABLE contact_center.spaces ADD CONSTRAINT spaces_platform_fk FOREIGN KEY (id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE guest_crm.spaces      ADD CONSTRAINT spaces_platform_fk FOREIGN KEY (id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
-- ops/kb/workforce tables are owned by their NOBYPASSRLS app owners; the harness runs these three
-- with SET ROLE <app>_owner so the REFERENCES-privilege requirement is exercised, not bypassed.
-- @@fk_ops
ALTER TABLE ops.spaces            ADD CONSTRAINT spaces_platform_fk FOREIGN KEY (space_id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
-- @@fk_kb
ALTER TABLE kb.spaces             ADD CONSTRAINT spaces_platform_fk FOREIGN KEY (space_id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT;
-- @@fk_workforce
ALTER TABLE workforce.ai_spaces   ADD CONSTRAINT spaces_platform_fk FOREIGN KEY (space_id) REFERENCES platform.spaces(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- @@provision_grants  (least privilege: registry columns only; tenant() EXECUTE handled separately to test necessity)
GRANT USAGE ON SCHEMA platform, contact_center, guest_crm, ops, kb, workforce TO platform_provisioner;
GRANT SELECT ON platform.spaces TO platform_provisioner;
GRANT INSERT (id, property_code, name, timezone), SELECT (id), UPDATE (property_code, name, timezone) ON contact_center.spaces TO platform_provisioner;
GRANT INSERT (id, property_code, timezone), SELECT (id), UPDATE (property_code, timezone) ON guest_crm.spaces TO platform_provisioner;
GRANT INSERT (space_id, property_name, timezone), SELECT (space_id), UPDATE (property_name, timezone) ON ops.spaces TO platform_provisioner;
GRANT INSERT (space_id, name), SELECT (space_id), UPDATE (name) ON kb.spaces TO platform_provisioner;
GRANT INSERT (space_id, enabled), SELECT (space_id, enabled), UPDATE (enabled) ON workforce.ai_spaces TO platform_provisioner;
-- @@tenant_exec
GRANT EXECUTE ON FUNCTION ops.tenant(), kb.tenant(), workforce.tenant() TO platform_provisioner;

-- @@provision
CREATE FUNCTION platform.validate_space() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
  RAISE EXCEPTION 'unknown IANA timezone %', NEW.timezone USING ERRCODE = '22023';
 END IF;
 IF TG_OP = 'UPDATE' AND NEW.id <> OLD.id THEN RAISE EXCEPTION 'space id is immutable'; END IF;
 IF TG_OP = 'UPDATE' AND OLD.lifecycle = 'OFFBOARDED' THEN RAISE EXCEPTION 'offboarded space is terminal'; END IF;
 IF TG_OP = 'UPDATE' AND NEW.lifecycle IS DISTINCT FROM OLD.lifecycle THEN NEW.lifecycle_version := OLD.lifecycle_version + 1; END IF;
 RETURN NEW;
END $$;

-- The SET clause on app.space_id confines the set_config(...,true) below to this function call:
-- the caller's own transaction-local tenant context is restored on exit.
CREATE FUNCTION platform.provision_projections() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp SET app.space_id = '' AS $$
BEGIN
 PERFORM pg_catalog.set_config('app.space_id', NEW.id::text, true);
 IF TG_OP = 'INSERT' THEN
  INSERT INTO contact_center.spaces (id, property_code, name, timezone) VALUES (NEW.id, NEW.property_code, NEW.display_name, NEW.timezone);
  INSERT INTO guest_crm.spaces (id, property_code, timezone)           VALUES (NEW.id, NEW.property_code, NEW.timezone);
  INSERT INTO ops.spaces (space_id, property_name, timezone)           VALUES (NEW.id, NEW.display_name, NEW.timezone);
  INSERT INTO kb.spaces (space_id, name)                               VALUES (NEW.id, NEW.display_name);
  INSERT INTO workforce.ai_spaces (space_id, enabled)                  VALUES (NEW.id, NEW.lifecycle = 'ACTIVE');
 ELSE
  UPDATE contact_center.spaces SET property_code = NEW.property_code, name = NEW.display_name, timezone = NEW.timezone WHERE id = NEW.id;
  UPDATE guest_crm.spaces SET property_code = NEW.property_code, timezone = NEW.timezone WHERE id = NEW.id;
  UPDATE ops.spaces SET property_name = NEW.display_name, timezone = NEW.timezone WHERE space_id = NEW.id;
  UPDATE kb.spaces SET name = NEW.display_name WHERE space_id = NEW.id;
  UPDATE workforce.ai_spaces SET enabled = (NEW.lifecycle = 'ACTIVE') WHERE space_id = NEW.id;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION platform.provision_projections() OWNER TO platform_provisioner;
ALTER FUNCTION platform.validate_space() OWNER TO platform_owner;
CREATE TRIGGER space_validate BEFORE INSERT OR UPDATE ON platform.spaces FOR EACH ROW EXECUTE FUNCTION platform.validate_space();
CREATE TRIGGER space_provision AFTER INSERT OR UPDATE ON platform.spaces FOR EACH ROW EXECUTE FUNCTION platform.provision_projections();

-- Drift repair: per-tenant context is mandatory, otherwise RLS hides every projection.
CREATE FUNCTION platform.reconcile_space(p_space uuid) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp SET app.space_id = '' AS $$
DECLARE s platform.spaces; repaired text[] := '{}'; n integer;
BEGIN
 SELECT * INTO STRICT s FROM platform.spaces WHERE id = p_space;
 PERFORM pg_catalog.set_config('app.space_id', s.id::text, true);
 INSERT INTO contact_center.spaces (id, property_code, name, timezone) VALUES (s.id, s.property_code, s.display_name, s.timezone) ON CONFLICT (id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; IF n > 0 THEN repaired := repaired || 'contact_center'::text; END IF;
 INSERT INTO guest_crm.spaces (id, property_code, timezone) VALUES (s.id, s.property_code, s.timezone) ON CONFLICT (id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; IF n > 0 THEN repaired := repaired || 'guest_crm'::text; END IF;
 INSERT INTO ops.spaces (space_id, property_name, timezone) VALUES (s.id, s.display_name, s.timezone) ON CONFLICT (space_id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; IF n > 0 THEN repaired := repaired || 'ops'::text; END IF;
 INSERT INTO kb.spaces (space_id, name) VALUES (s.id, s.display_name) ON CONFLICT (space_id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; IF n > 0 THEN repaired := repaired || 'kb'::text; END IF;
 INSERT INTO workforce.ai_spaces (space_id, enabled) VALUES (s.id, s.lifecycle = 'ACTIVE') ON CONFLICT (space_id) DO NOTHING;
 GET DIAGNOSTICS n = ROW_COUNT; IF n > 0 THEN repaired := repaired || 'workforce'::text; END IF;
 RETURN repaired;
END $$;
ALTER FUNCTION platform.reconcile_space(uuid) OWNER TO platform_provisioner;

-- @@iam
SET ROLE platform_owner;
CREATE TABLE platform.principals (
 principal_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_subject text NOT NULL UNIQUE CHECK (auth_subject ~ '^[^[:space:]]{3,255}$'),
 display_name text NOT NULL
);
CREATE TABLE platform.members (
 space_id uuid NOT NULL REFERENCES platform.spaces(id),
 member_id uuid NOT NULL DEFAULT gen_random_uuid(),
 principal_id uuid NOT NULL REFERENCES platform.principals,
 enabled boolean NOT NULL DEFAULT true,
 PRIMARY KEY (space_id, member_id),
 UNIQUE (space_id, principal_id)            -- one actor identity per person per property: blocks alias self-approval
);
CREATE TABLE platform.capabilities (
 capability text PRIMARY KEY CHECK (capability ~ '^(cc|crm|ops|kb|ai)\.[a-z_]+\.[a-z_]+$'),
 domain text NOT NULL CHECK (domain IN ('COMMUNICATION','CRM','OPERATIONS','KNOWLEDGE','AI_MANAGEMENT')),
 enforced_by text NOT NULL CHECK (enforced_by IN ('DB','GATEWAY','DB+GATEWAY')),
 description text NOT NULL,
 CHECK ((split_part(capability,'.',1), domain) IN (('cc','COMMUNICATION'),('crm','CRM'),('ops','OPERATIONS'),('kb','KNOWLEDGE'),('ai','AI_MANAGEMENT')))
);
CREATE TABLE platform.role_templates (template_key text PRIMARY KEY CHECK (template_key ~ '^[A-Z_]{3,40}$'), display_name text NOT NULL);
CREATE TABLE platform.template_capabilities (
 template_key text NOT NULL REFERENCES platform.role_templates,
 capability text NOT NULL REFERENCES platform.capabilities,
 PRIMARY KEY (template_key, capability)
);
CREATE TABLE platform.member_templates (
 space_id uuid NOT NULL, member_id uuid NOT NULL, template_key text NOT NULL REFERENCES platform.role_templates,
 PRIMARY KEY (space_id, member_id, template_key),
 FOREIGN KEY (space_id, member_id) REFERENCES platform.members
);
CREATE TABLE platform.member_skills (
 space_id uuid NOT NULL, member_id uuid NOT NULL,
 skill text NOT NULL CHECK (skill IN ('housekeeping','maintenance','front_desk','billing','food_beverage')),
 PRIMARY KEY (space_id, member_id, skill),
 FOREIGN KEY (space_id, member_id) REFERENCES platform.members
);
RESET ROLE;

-- @@catalog
INSERT INTO platform.capabilities VALUES
 ('cc.inbox.read','COMMUNICATION','GATEWAY','Read assigned property conversations and queues'),
 ('cc.conversation.claim','COMMUNICATION','DB+GATEWAY','Take over / release a guest conversation (App 1 operator participant)'),
 ('cc.message.send','COMMUNICATION','DB+GATEWAY','Send operator-approved replies through the App 1 dispatch gate'),
 ('cc.draft.request_ai','COMMUNICATION','GATEWAY','Request a private AI draft while owning the conversation'),
 ('cc.request.authorize','COMMUNICATION','GATEWAY','Record the authority decision on a guest service request (entry permission, quantity)'),
 ('cc.conversation.supervise','COMMUNICATION','GATEWAY','Reassign or force-release another operator''s conversation'),
 ('crm.context.read','CRM','GATEWAY','Receive scoped profile context via profile-lookup (contact_center audience)'),
 ('crm.profile.correct','CRM','GATEWAY','Apply a guest-requested correction'),
 ('crm.merge.review','CRM','GATEWAY','Review identity merge proposals'),
 ('crm.erasure.request','CRM','GATEWAY','Submit a verified guest erasure request'),
 ('crm.field.approve','CRM','GATEWAY','Approve a property custom field definition'),
 ('ops.task.view','OPERATIONS','GATEWAY','View the property task board'),
 ('ops.task.work','OPERATIONS','DB+GATEWAY','Claim, start, report blockers and attest own tasks (skills-gated in SQL)'),
 ('ops.maintenance.work','OPERATIONS','GATEWAY','Maintenance work classification (App 3 TECHNICIAN label)'),
 ('ops.request.triage','OPERATIONS','GATEWAY','Front-desk triage and coordination (App 3 FRONT_DESK label)'),
 ('ops.task.supervise','OPERATIONS','DB+GATEWAY','Supervisor escalation handling and rework (App 3 SUPERVISOR)'),
 ('ops.room.inspect','OPERATIONS','DB','Inspect and release rooms; inspector must differ from attester (App 3 SUPERVISOR)'),
 ('kb.search.operations','KNOWLEDGE','GATEWAY','Operations-audience knowledge search'),
 ('kb.document.upload','KNOWLEDGE','DB+GATEWAY','Upload document revisions (App 4 member; uploader recorded as actor)'),
 ('kb.policy.approve','KNOWLEDGE','DB','Approve a revision; never one''s own upload (App 4 APPROVER)'),
 ('kb.policy.archive','KNOWLEDGE','DB','Archive an approved policy (App 4 APPROVER)'),
 ('ai.graph.configure','AI_MANAGEMENT','GATEWAY','Author draft personas/graphs (App 5 member)'),
 ('ai.graph.approve','AI_MANAGEMENT','DB+GATEWAY','Publish a graph authored by someone else (App 5 APPROVER)'),
 ('ai.session.resume','AI_MANAGEMENT','DB+GATEWAY','Resume an interrupted agent session (App 5 APPROVER - overloaded, see report)'),
 ('ai.space.pause','AI_MANAGEMENT','GATEWAY','Kill switch: pause the property''s AI team');

INSERT INTO platform.role_templates VALUES
 ('GENERAL_MANAGER','General Manager'),
 ('FRONT_DESK_LEAD','Front Desk Lead'),
 ('HOUSEKEEPING_SUPERVISOR','Housekeeping Supervisor'),
 ('ROOM_ATTENDANT','Room Attendant'),
 ('CELLAR_SOMMELIER_LEAD','Cellar / Sommelier Lead'),
 ('CONTENT_POLICY_EDITOR','Content / Policy Editor');

INSERT INTO platform.template_capabilities
SELECT t, c FROM (VALUES
 ('GENERAL_MANAGER', ARRAY['cc.inbox.read','cc.conversation.supervise','crm.merge.review','crm.erasure.request','crm.field.approve','ops.task.view','ops.task.supervise','ops.room.inspect','kb.search.operations','kb.policy.approve','kb.policy.archive','ai.graph.approve','ai.space.pause']),
 ('FRONT_DESK_LEAD', ARRAY['cc.inbox.read','cc.conversation.claim','cc.message.send','cc.draft.request_ai','cc.request.authorize','cc.conversation.supervise','crm.context.read','crm.profile.correct','crm.erasure.request','ops.task.view','ops.request.triage','kb.search.operations','ai.session.resume']),
 ('HOUSEKEEPING_SUPERVISOR', ARRAY['ops.task.view','ops.task.work','ops.task.supervise','ops.room.inspect','kb.search.operations']),
 ('ROOM_ATTENDANT', ARRAY['ops.task.view','ops.task.work','kb.search.operations']),
 ('CELLAR_SOMMELIER_LEAD', ARRAY['cc.inbox.read','cc.conversation.claim','cc.message.send','cc.draft.request_ai','crm.context.read','kb.search.operations','kb.document.upload','ai.graph.configure']),
 ('CONTENT_POLICY_EDITOR', ARRAY['kb.search.operations','kb.document.upload'])
) v(t, caps), unnest(caps) c;

-- @@projection
GRANT INSERT (space_id, id, kind, display_name, auth_subject), SELECT (space_id, id, kind, auth_subject, display_name), UPDATE (display_name) ON contact_center.participants TO platform_provisioner;
GRANT INSERT (space_id, staff_id, auth_subject, display_name, enabled, staff_role, skills), SELECT (space_id, staff_id, staff_role, display_name, enabled, skills), UPDATE (display_name, enabled, staff_role, skills) ON ops.staff_members TO platform_provisioner;
GRANT INSERT (space_id, actor_id, auth_subject, role_name, enabled), SELECT (space_id, actor_id, role_name, enabled), UPDATE (role_name, enabled) ON kb.knowledge_members TO platform_provisioner;
GRANT INSERT (space_id, actor_id, role_name, enabled), SELECT (space_id, actor_id, role_name, enabled), UPDATE (role_name, enabled) ON workforce.ai_members TO platform_provisioner;

-- Effective capabilities = union over assigned templates, only while membership is enabled.
CREATE FUNCTION platform.effective_capabilities(p_space uuid, p_member uuid) RETURNS text[] LANGUAGE sql STABLE
 SET search_path = pg_catalog, pg_temp AS $$
 SELECT coalesce(array_agg(DISTINCT tc.capability ORDER BY tc.capability), '{}')
 FROM platform.members m JOIN platform.member_templates mt USING (space_id, member_id)
 JOIN platform.template_capabilities tc USING (template_key)
 WHERE m.space_id = p_space AND m.member_id = p_member AND m.enabled $$;

-- Deterministic, total mapping from a capability set to each app's local role columns.
CREATE FUNCTION platform.local_roles(caps text[]) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
 SELECT jsonb_build_object(
  'app1_operator', caps && ARRAY['cc.conversation.claim','cc.message.send'],
  'app3_staff_role', CASE WHEN caps && ARRAY['ops.room.inspect','ops.task.supervise'] THEN 'SUPERVISOR'
                          WHEN 'ops.request.triage' = ANY(caps) THEN 'FRONT_DESK'
                          WHEN 'ops.maintenance.work' = ANY(caps) THEN 'TECHNICIAN'
                          WHEN 'ops.task.work' = ANY(caps) THEN 'ATTENDANT' END,
  'app4_role_name', CASE WHEN caps && ARRAY['kb.policy.approve','kb.policy.archive'] THEN 'APPROVER'
                         WHEN 'kb.document.upload' = ANY(caps) THEN 'EDITOR' END,
  'app5_role_name', CASE WHEN caps && ARRAY['ai.graph.approve','ai.session.resume'] THEN 'APPROVER'
                         WHEN 'ai.graph.configure' = ANY(caps) THEN 'CONFIGURATOR' END) $$;

CREATE FUNCTION platform.project_member(p_space uuid, p_member uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp SET app.space_id = '' AS $$
DECLARE m platform.members; p platform.principals; caps text[]; r jsonb; sk text[]; live boolean;
BEGIN
 SELECT * INTO STRICT m FROM platform.members WHERE space_id = p_space AND member_id = p_member;
 SELECT * INTO STRICT p FROM platform.principals WHERE principal_id = m.principal_id;
 caps := platform.effective_capabilities(p_space, p_member);
 r := platform.local_roles(caps);
 SELECT coalesce(array_agg(skill ORDER BY skill), '{}') INTO sk FROM platform.member_skills WHERE space_id = p_space AND member_id = p_member;
 PERFORM pg_catalog.set_config('app.space_id', p_space::text, true);
 -- App 1: operator participant. App 1 has no enabled flag; revocation is enforced at the gateway/token layer.
 IF (r->>'app1_operator')::boolean THEN
  INSERT INTO contact_center.participants (space_id, id, kind, display_name, auth_subject)
  VALUES (p_space, p_member, 'operator', p.display_name, p.auth_subject)
  ON CONFLICT (space_id, id) DO UPDATE SET display_name = EXCLUDED.display_name;
 END IF;
 -- App 3 / 4 / 5: single-role rows; absence of capability => disabled, never deleted (history FKs).
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
 INSERT INTO workforce.ai_members (space_id, actor_id, role_name, enabled)
 SELECT p_space, p_member, coalesce(r->>'app5_role_name','CONFIGURATOR'), live
 WHERE live OR EXISTS (SELECT 1 FROM workforce.ai_members WHERE space_id = p_space AND actor_id = p_member)
 ON CONFLICT (space_id, actor_id) DO UPDATE SET enabled = EXCLUDED.enabled,
   role_name = CASE WHEN EXCLUDED.enabled THEN EXCLUDED.role_name ELSE workforce.ai_members.role_name END;
 RETURN r || jsonb_build_object('capabilities', to_jsonb(caps), 'skills', to_jsonb(sk));
END $$;
ALTER FUNCTION platform.project_member(uuid, uuid) OWNER TO platform_provisioner;
ALTER FUNCTION platform.effective_capabilities(uuid, uuid) OWNER TO platform_owner;
GRANT SELECT ON ALL TABLES IN SCHEMA platform TO platform_provisioner;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'platform' AND tablename <> 'spaces' LOOP
  EXECUTE format('ALTER TABLE platform.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('ALTER TABLE platform.%I FORCE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY kernel_all ON platform.%I TO platform_owner, platform_provisioner USING (true) WITH CHECK (true)', t);
 END LOOP; END $$;
GRANT EXECUTE ON FUNCTION platform.effective_capabilities(uuid, uuid) TO platform_provisioner;

-- @@request_context
-- Gateway helper: validates property + membership and sets transaction-local context for exactly one app.
-- Deliberately NO "SET search_path" clause here: such a clause would also revert a search_path set_config
-- at function exit. It instead uses fully qualified names, and callers set search_path with SET LOCAL.
CREATE FUNCTION platform.begin_request(p_space uuid, p_auth_subject text, p_app text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_member uuid; v_prev text := nullif(pg_catalog.current_setting('app.space_id', true), '');
BEGIN
 IF v_prev IS NOT NULL AND v_prev <> p_space::text THEN
  RAISE EXCEPTION 'request context already bound to another property in this transaction' USING ERRCODE = '42501';
 END IF;
 IF p_app NOT IN ('contact_center','guest_crm','ops','kb','workforce') THEN RAISE EXCEPTION 'unknown app %', p_app; END IF;
 SELECT m.member_id INTO v_member FROM platform.members m JOIN platform.principals p ON p.principal_id = m.principal_id
  JOIN platform.spaces s ON s.id = m.space_id
  WHERE m.space_id = p_space AND p.auth_subject = p_auth_subject AND m.enabled AND s.lifecycle = 'ACTIVE';
 IF v_member IS NULL THEN RAISE EXCEPTION 'not an enabled member of an active property' USING ERRCODE = '42501'; END IF;
 PERFORM pg_catalog.set_config('app.space_id', p_space::text, true);
 PERFORM pg_catalog.set_config('app.actor_id', v_member::text, true);
 PERFORM pg_catalog.set_config('app.staff_id', v_member::text, true);   -- App 3 alias
 PERFORM pg_catalog.set_config('app.request_app', p_app, true);
 RETURN v_member;
END $$;
ALTER FUNCTION platform.begin_request(uuid, text, text) OWNER TO platform_owner;
REVOKE ALL ON FUNCTION platform.begin_request(uuid, text, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO platform_gateway;
GRANT EXECUTE ON FUNCTION platform.begin_request(uuid, text, text) TO platform_gateway;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA platform FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.begin_request(uuid, text, text) TO platform_gateway;
GRANT EXECUTE ON FUNCTION platform.local_roles(text[]), platform.effective_capabilities(uuid, uuid) TO platform_provisioner;
```

## Appendix B — verification harness (`test_kernel.py`)

Parts: 1 = Five Spaces (Option 1), 2 = context and pooling, 3 = IAM and separation of duties, 4 = locked-suite regression with the kernel (with and without FK), 5 = FK with app-owned projections.

<!-- artifact: test_kernel.py -->
```python
"""Sub-Component A micro-research harness. Disposable; runs against clones of `kernel_clean`
(the five locked app DDLs co-installed, unmodified). Every check records evidence."""
import subprocess, json, re, uuid, hashlib, sys, time, os
from pathlib import Path

W = Path(__file__).resolve().parent.parent
SOCK, PORT = str(W / 'socket'), '55466'
KSQL = (W / 'kernel' / 'kernel_experiment.sql').read_text()
RESULTS, EVIDENCE = [], {}

def section(name):
    m = re.search(r'^-- @@' + re.escape(name) + r'\b.*?\n(.*?)(?=^-- @@|\Z)', KSQL, re.S | re.M)
    assert m, name
    return m.group(1)

def psql(sql, db, extra=(), check=True):
    r = subprocess.run(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', *extra],
                       input=sql, text=True, capture_output=True)
    if check and r.returncode:
        raise RuntimeError(f'{db}: {r.stderr}\n--- SQL ---\n{sql[:1500]}')
    return r

def q(sql, db, role=None, space=None, actor=None, staff=None, fail=False):
    """One explicit transaction with transaction-local context (the kernel protocol)."""
    pre = ['BEGIN;']
    if space: pre.append(f"SET LOCAL app.space_id = '{space}';")
    if actor: pre.append(f"SET LOCAL app.actor_id = '{actor}';")
    if staff: pre.append(f"SET LOCAL app.staff_id = '{staff}';")
    if role: pre.append(f'SET LOCAL ROLE {role};')
    r = psql('\n'.join(pre) + '\n' + sql + '\nCOMMIT;', db, check=False)
    if fail:
        assert r.returncode != 0, f'expected failure: {sql[:200]}'
        return r.stderr.strip().splitlines()[0] if r.stderr.strip() else ''
    if r.returncode:
        raise RuntimeError(r.stderr + '\n' + sql[:1500])
    return r.stdout.strip()

def ok(name, cond, evidence=None):
    RESULTS.append({'check': name, 'passed': bool(cond), 'evidence': evidence})
    print(('PASS ' if cond else 'FAIL ') + name + (f'  :: {evidence}' if evidence is not None else ''))

def fresh(db):
    psql(f'DROP DATABASE IF EXISTS {db};', 'postgres')
    psql(f'CREATE DATABASE {db} TEMPLATE kernel_clean;', 'postgres')

def lit(x): return "'" + str(x).replace("'", "''") + "'"
def uid(n): return str(uuid.UUID(int=n))

def install_kernel(db, fk=True):
    psql(section('roles') + section('registry'), db)
    if fk:
        psql(section('fk'), db)
        psql('GRANT USAGE ON SCHEMA platform TO ops_owner, kb_owner, ai_owner; GRANT REFERENCES ON platform.spaces TO ops_owner, kb_owner, ai_owner;', db)
        for app, owner in [('ops', 'ops_owner'), ('kb', 'kb_owner'), ('workforce', 'ai_owner')]:
            psql(f'SET ROLE {owner};\n' + section('fk_' + app), db)
    psql(section('provision_grants') + section('tenant_exec') + section('provision') + section('iam')
         + section('catalog') + section('projection') + section('request_context'), db)

def new_space(db, code, name, tz='Asia/Tbilisi', sid=None):
    cols = 'id, property_code, display_name, timezone' if sid else 'property_code, display_name, timezone'
    vals = f"{lit(sid)}, {lit(code)}, {lit(name)}, {lit(tz)}" if sid else f"{lit(code)}, {lit(name)}, {lit(tz)}"
    return q(f'INSERT INTO platform.spaces ({cols}) VALUES ({vals}) RETURNING id;', db, role='platform_owner')

REGISTRIES = [('contact_center', 'spaces', 'id'), ('guest_crm', 'spaces', 'id'), ('ops', 'spaces', 'space_id'),
              ('kb', 'spaces', 'space_id'), ('workforce', 'ai_spaces', 'space_id')]

def registry_counts(db, sid):  # superuser view (bypasses RLS) for ground truth
    return {s: int(psql(f"SELECT count(*) FROM {s}.{t} WHERE {c} = {lit(sid)};", db).stdout) for s, t, c in REGISTRIES}

# =====================================================================================
# PART 1 - Five Spaces Problem, Option 1 (hard FK + synchronous provisioning trigger)
# =====================================================================================
def part1():
    db = 'k1'; fresh(db)
    cols = psql("""SELECT table_schema||'.'||table_name||'('||string_agg(column_name||':'||data_type||CASE WHEN is_nullable='NO' THEN ' NOT NULL' ELSE '' END||coalesce(' DEFAULT '||column_default,''), ', ' ORDER BY ordinal_position)||')'
      FROM information_schema.columns WHERE (table_schema, table_name) IN (('contact_center','spaces'),('guest_crm','spaces'),('ops','spaces'),('kb','spaces'),('workforce','ai_spaces'))
      GROUP BY table_schema, table_name ORDER BY 1;""", db).stdout.strip().splitlines()
    EVIDENCE['registry_columns'] = cols
    owners = psql("""SELECT n.nspname||'.'||c.relname||'='||pg_get_userbyid(c.relowner) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (n.nspname,c.relname) IN (('contact_center','spaces'),('guest_crm','spaces'),('ops','spaces'),('kb','spaces'),('workforce','ai_spaces')) ORDER BY 1;""", db).stdout.split()
    EVIDENCE['registry_owners'] = owners

    psql(section('roles') + section('registry'), db)
    psql(section('fk'), db)
    r = psql('SET ROLE ops_owner;\n' + section('fk_ops'), db, check=False)
    e0 = r.stderr.strip().splitlines()[0] if r.stderr else ''
    psql('GRANT USAGE ON SCHEMA platform TO ops_owner, kb_owner, ai_owner;', db)
    r = psql('SET ROLE ops_owner;\n' + section('fk_ops'), db, check=False)
    e1 = r.stderr.strip().splitlines()[0] if r.stderr else ''
    ok('1.01 app owner needs BOTH schema USAGE and table REFERENCES on the kernel registry to add the FK',
       'permission denied for schema platform' in e0 and 'permission denied for table spaces' in e1, [e0, e1])
    psql('GRANT REFERENCES ON platform.spaces TO ops_owner, kb_owner, ai_owner;', db)
    for app, owner in [('ops', 'ops_owner'), ('kb', 'kb_owner'), ('workforce', 'ai_owner')]:
        psql(f'SET ROLE {owner};\n' + section('fk_' + app), db)
    fks = int(psql("SELECT count(*) FROM pg_constraint WHERE conname='spaces_platform_fk' AND confrelid='platform.spaces'::regclass;", db).stdout)
    ok('1.02 all five app registries carry a hard FK to platform.spaces after REFERENCES grant', fks == 5, f'{fks} constraints')

    e1 = q(f"INSERT INTO ops.spaces (space_id, property_name) VALUES ('{uid(999)}', 'Rogue');", db, fail=True)
    e2 = q("INSERT INTO contact_center.spaces (property_code, name) VALUES ('ROGUE', 'Rogue default-uuid tenant');", db, fail=True)
    ok('1.03 FK rejects an app-minted tenant (ops) even for superuser', 'foreign key' in e1, e1)
    ok('1.04 FK neutralises App 1 DEFAULT gen_random_uuid() tenant creation', 'foreign key' in e2, e2)

    psql(section('provision_grants') + section('provision'), db)   # tenant_exec deliberately withheld
    e = q("INSERT INTO platform.spaces (property_code, display_name) VALUES ('NO-EXEC', 'Probe');", db, role='platform_owner', fail=True)
    ok('1.05 provisioning needs EXECUTE on ops/kb/workforce tenant(): RLS policy functions run as the invoking role', 'permission denied for function tenant' in e, e)
    leaked = int(psql("SELECT (SELECT count(*) FROM platform.spaces WHERE property_code='NO-EXEC') + (SELECT count(*) FROM contact_center.spaces WHERE property_code='NO-EXEC') + (SELECT count(*) FROM guest_crm.spaces WHERE property_code='NO-EXEC');", db).stdout)
    ok('1.06 failed provisioning leaves no partial rows anywhere (single transaction)', leaked == 0, f'{leaked} rows')
    psql(section('tenant_exec'), db)

    a = new_space(db, 'KAKHETI-CHATEAU', 'Chateau Telavi (synthetic)')
    cnt = registry_counts(db, a)
    ok('1.07 one platform insert provisions exactly one projection row in each of the five schemas', all(v == 1 for v in cnt.values()), cnt)
    row = psql(f"""SELECT json_build_object(
      'cc', (SELECT to_jsonb(s) - 'created_at' FROM contact_center.spaces s WHERE id={lit(a)}),
      'cc_created_at_set', (SELECT created_at IS NOT NULL FROM contact_center.spaces WHERE id={lit(a)}),
      'crm', (SELECT to_jsonb(s) FROM guest_crm.spaces s WHERE id={lit(a)}),
      'ops', (SELECT to_jsonb(s) FROM ops.spaces s WHERE space_id={lit(a)}),
      'kb', (SELECT to_jsonb(s) FROM kb.spaces s WHERE space_id={lit(a)}),
      'workforce', (SELECT to_jsonb(s) FROM workforce.ai_spaces s WHERE space_id={lit(a)}));""", db).stdout
    pr = json.loads(row); EVIDENCE['projection_example'] = pr
    ok('1.08 local columns preserved: App1 settings={} and created_at default, App4 knowledge_epoch=1, App5 enabled=true, timezones copied',
       pr['cc']['settings'] == {} and pr['cc_created_at_set'] and pr['kb']['knowledge_epoch'] == 1 and pr['workforce']['enabled'] is True
       and pr['cc']['timezone'] == pr['crm']['timezone'] == pr['ops']['timezone'] == 'Asia/Tbilisi'
       and pr['cc']['name'] == pr['ops']['property_name'] == pr['kb']['name'] == 'Chateau Telavi (synthetic)'
       and pr['cc']['property_code'] == pr['crm']['property_code'] == 'KAKHETI-CHATEAU')

    x = uid(4242)
    out = q(f"""SELECT set_config('app.space_id', '{x}', true);
      INSERT INTO platform.spaces (property_code, display_name) VALUES ('SIGNAGHI-INN', 'Signaghi Inn (synthetic)');
      SELECT current_setting('app.space_id');""", db, role='platform_owner').splitlines()[-1]
    ok("1.09 provisioning trigger's function-level SET clause restores the caller's own tenant context", out == x, out)

    psql('REVOKE INSERT ON workforce.ai_spaces FROM platform_provisioner;', db)
    e = q("INSERT INTO platform.spaces (property_code, display_name) VALUES ('PARTIAL', 'Partial failure probe');", db, role='platform_owner', fail=True)
    rows = int(psql("SELECT (SELECT count(*) FROM platform.spaces WHERE property_code='PARTIAL')+(SELECT count(*) FROM contact_center.spaces WHERE property_code='PARTIAL')+(SELECT count(*) FROM guest_crm.spaces WHERE property_code='PARTIAL')+(SELECT count(*) FROM ops.spaces WHERE property_name='Partial failure probe')+(SELECT count(*) FROM kb.spaces WHERE name='Partial failure probe');", db).stdout)
    ok('1.10 failure in the 5th projection rolls back the kernel row and the 4 earlier projections', rows == 0, f'{e} / residual rows={rows}')
    psql('GRANT INSERT (space_id, enabled) ON workforce.ai_spaces TO platform_provisioner;', db)

    e = q("INSERT INTO platform.spaces (property_code, display_name, timezone) VALUES ('BAD-TZ', 'x', 'Asia/Tiblisi');", db, role='platform_owner', fail=True)
    ok('1.11 unknown IANA timezone rejected before any projection', 'unknown IANA timezone' in e, e)
    e = q(f"DELETE FROM platform.spaces WHERE id = {lit(a)};", db, role='platform_owner', fail=True)
    ok('1.12 hard delete of a provisioned property is blocked (ON DELETE RESTRICT); offboarding is a lifecycle state', 'foreign key' in e or 'violates' in e, e)

    q(f"UPDATE platform.spaces SET display_name = 'Chateau Telavi Wine Resort', property_code = 'TELAVI-CHATEAU', lifecycle = 'SUSPENDED' WHERE id = {lit(a)};", db, role='platform_owner')
    s = json.loads(psql(f"""SELECT json_build_object('cc_name',(SELECT name FROM contact_center.spaces WHERE id={lit(a)}),'cc_code',(SELECT property_code FROM contact_center.spaces WHERE id={lit(a)}),
      'crm_code',(SELECT property_code FROM guest_crm.spaces WHERE id={lit(a)}),'ops',(SELECT property_name FROM ops.spaces WHERE space_id={lit(a)}),
      'kb',(SELECT name FROM kb.spaces WHERE space_id={lit(a)}),'ai_enabled',(SELECT enabled FROM workforce.ai_spaces WHERE space_id={lit(a)}),
      'lv',(SELECT lifecycle_version FROM platform.spaces WHERE id={lit(a)}));""", db).stdout)
    ok('1.13 rename/re-code/suspend propagate; App 5 enabled=false is the only per-app suspension flag that exists', s == {'cc_name': 'Chateau Telavi Wine Resort', 'cc_code': 'TELAVI-CHATEAU', 'crm_code': 'TELAVI-CHATEAU', 'ops': 'Chateau Telavi Wine Resort', 'kb': 'Chateau Telavi Wine Resort', 'ai_enabled': False, 'lv': 2}, s)
    q(f"UPDATE platform.spaces SET lifecycle = 'OFFBOARDED' WHERE id = {lit(a)};", db, role='platform_owner')
    e = q(f"UPDATE platform.spaces SET lifecycle = 'ACTIVE' WHERE id = {lit(a)};", db, role='platform_owner', fail=True)
    ok('1.14 OFFBOARDED is terminal', 'terminal' in e, e)

    e_id = uid(777)
    psql(f"ALTER TABLE platform.spaces DISABLE TRIGGER space_provision; INSERT INTO platform.spaces (id, property_code, display_name) VALUES ({lit(e_id)}, 'MANUAL-FK', 'Manual FK probe'); ALTER TABLE platform.spaces ENABLE TRIGGER space_provision;", db)
    nosel = psql("SELECT has_table_privilege('ops_owner','platform.spaces','SELECT');", db).stdout.strip()
    q(f"INSERT INTO ops.spaces (space_id, property_name) VALUES ({lit(e_id)}, 'Manual FK probe');", db, role='ops_owner', space=e_id)
    ok('1.15 RI check succeeds for a role with no SELECT on (and RLS-hidden) platform.spaces: FK checks bypass RLS/privileges', nosel == 'f', f'ops_owner SELECT privilege={nosel}')

    b = new_space(db, 'KVARELI-LAKE', 'Kvareli Lake Resort (synthetic)')
    psql(f"DELETE FROM kb.spaces WHERE space_id = {lit(b)};", db)
    blind = q("SELECT count(*) FROM kb.spaces;", db, role='platform_provisioner')
    ok('1.16 drift probe without tenant context sees 0 kb rows even though rows exist (silent-zero illusion)', blind == '0', f'visible={blind}, actual={psql("SELECT count(*) FROM kb.spaces;", db).stdout.strip()}')
    psql('GRANT EXECUTE ON FUNCTION platform.reconcile_space(uuid) TO platform_owner;', db)
    r1 = q(f"SELECT platform.reconcile_space({lit(b)});", db, role='platform_owner')
    r2 = q(f"SELECT platform.reconcile_space({lit(b)});", db, role='platform_owner')
    ok('1.17 per-tenant reconcile repairs exactly the missing projection and is idempotent', r1 == '{kb}' and r2 == '{}', f'first={r1} second={r2}')
    EVIDENCE['part1_db'] = db

# =====================================================================================
# PART 2 - transaction-local context, pooling simulation, fail-closed RLS, actor aliases
# =====================================================================================
def session(db, script, role=None):
    """One persistent backend = one pooled server connection reused by successive 'clients'."""
    r = psql(script, db, extra=('-F', '|'), check=False)
    rows = {}
    for line in r.stdout.splitlines():
        if '|' in line:
            k, v = line.split('|', 1); rows[k] = v
    return rows, r

def part2():
    db = 'k2'; fresh(db); install_kernel(db)
    A = new_space(db, 'TELAVI-A', 'Telavi A'); B = new_space(db, 'SIGHNAGHI-B', 'Sighnaghi B')
    psql("""DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kernel_probe') THEN CREATE ROLE kernel_probe NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$;
      GRANT USAGE ON SCHEMA contact_center, guest_crm, ops, kb, workforce TO kernel_probe;
      GRANT SELECT ON contact_center.spaces, guest_crm.spaces, ops.spaces, kb.spaces, workforce.ai_spaces TO kernel_probe;
      GRANT EXECUTE ON FUNCTION ops.tenant(), ops.actor(), kb.tenant(), kb.actor(), workforce.tenant(), workforce.actor() TO kernel_probe;""", db)
    probe = ("SELECT 'cc', count(*) FROM contact_center.spaces; SELECT 'crm', count(*) FROM guest_crm.spaces; SELECT 'ops', count(*) FROM ops.spaces;"
             " SELECT 'kb', count(*) FROM kb.spaces; SELECT 'ai', count(*) FROM workforce.ai_spaces;")

    rows, _ = session(db, f"""SELECT 'never_set', coalesce(current_setting('app.space_id', true), '<NULL>');
BEGIN; SET LOCAL app.space_id = '{A}'; SELECT 'inside', current_setting('app.space_id'); COMMIT;
SELECT 'after_commit', coalesce(current_setting('app.space_id', true), '<NULL>');
SELECT 'after_commit_nullif_is_null', (nullif(current_setting('app.space_id', true), '')::uuid IS NULL)::text;""")
    EVIDENCE['guc_commit'] = rows
    ok('2.01 SET LOCAL value visible inside its transaction, gone after COMMIT', rows['inside'] == A and rows['after_commit'] in ('', '<NULL>'), rows)
    ok('2.02 after revert the placeholder reads as empty string, not NULL: nullif(...,\'\') in every app policy is load-bearing', rows['never_set'] == '<NULL>' and rows['after_commit'] == '' and rows['after_commit_nullif_is_null'] == 'true', rows)

    rows, r = session(db, f"""\\set ON_ERROR_STOP 0
BEGIN; SET LOCAL app.space_id = '{A}'; SELECT 1/0; ROLLBACK;
SELECT 'after_error_rollback', current_setting('app.space_id', true);
BEGIN; SET LOCAL app.space_id = '{A}'; ROLLBACK;
SELECT 'after_plain_rollback', current_setting('app.space_id', true);
SET LOCAL app.space_id = '{A}';
SELECT 'after_set_local_outside_txn', current_setting('app.space_id', true);
BEGIN; SET LOCAL app.space_id = '{A}'; SAVEPOINT s1; SET LOCAL app.space_id = '{B}'; SELECT 'in_savepoint', current_setting('app.space_id'); ROLLBACK TO SAVEPOINT s1; SELECT 'after_rollback_to_savepoint', current_setting('app.space_id'); COMMIT;
BEGIN; SET LOCAL search_path = ops, pg_catalog; SET LOCAL ROLE kernel_probe; SELECT 'in_txn_path_role', current_setting('search_path')||' / '||current_user; COMMIT;
SELECT 'after_path_role', current_setting('search_path')||' / '||current_user;""")
    EVIDENCE['guc_rollback'] = {**rows, 'stderr': [l for l in r.stderr.splitlines() if 'WARNING' in l]}
    ok('2.03 errored-then-rolled-back transaction discards the tenant GUC', rows['after_error_rollback'] == '', rows['after_error_rollback'])
    ok('2.04 plain ROLLBACK discards the tenant GUC', rows['after_plain_rollback'] == '', rows['after_plain_rollback'])
    ok('2.05 SET LOCAL outside a transaction block warns and has no lasting effect', rows['after_set_local_outside_txn'] == '' and 'SET LOCAL can only be used in transaction blocks' in r.stderr, [l for l in r.stderr.splitlines() if 'WARNING' in l])
    ok('2.06 ROLLBACK TO SAVEPOINT restores the pre-savepoint tenant (sub-transaction semantics)', rows['in_savepoint'] == B and rows['after_rollback_to_savepoint'] == A)
    ok('2.07 SET LOCAL search_path and SET LOCAL ROLE revert at COMMIT', rows['in_txn_path_role'] == 'ops, pg_catalog / kernel_probe' and rows['after_path_role'] == '"$user", public / ' + psql('SELECT session_user;', db).stdout.strip(), rows)

    zero = {}
    for label, ctx in [('unset', ''), ('A', f"SET LOCAL app.space_id = '{A}';"), ('B', f"SET LOCAL app.space_id = '{B}';")]:
        rows, _ = session(db, f"BEGIN; SET LOCAL ROLE kernel_probe; {ctx} {probe} COMMIT;")
        zero[label] = rows
    EVIDENCE['fail_closed'] = zero
    ok('2.08 without app.space_id, RLS returns 0 rows in all five schemas (fail closed)', all(v == '0' for v in zero['unset'].values()) and len(zero['unset']) == 5, zero['unset'])
    ok('2.09 with context, each schema shows exactly the one bound property', all(v == '1' for v in zero['A'].values()) and all(v == '1' for v in zero['B'].values()))
    rows, _ = session(db, f"BEGIN; SET LOCAL ROLE kernel_probe; SET LOCAL app.space_id = '{A}'; SELECT 'ids', (SELECT id FROM contact_center.spaces)||','||(SELECT space_id FROM ops.spaces)||','||(SELECT space_id FROM workforce.ai_spaces); COMMIT;")
    ok('2.10 the visible row is the bound tenant, not the other', rows['ids'] == ','.join([A] * 3), rows['ids'])

    rows, _ = session(db, f"""SET app.space_id = '{A}';
BEGIN; SET LOCAL ROLE kernel_probe; SELECT 'leak_ops', count(*) FROM ops.spaces; COMMIT;
DISCARD ALL;
BEGIN; SET LOCAL ROLE kernel_probe; SELECT 'after_discard_ops', count(*) FROM ops.spaces; COMMIT;""")
    ok('2.11 NEGATIVE: a session-level SET leaks tenant A into the next client on a reused connection', rows['leak_ops'] == '1', rows)
    ok('2.12 DISCARD ALL on check-in removes the leaked session context', rows['after_discard_ops'] == '0', rows)

    lines = []
    for i in range(200):
        t = A if i % 2 == 0 else B
        lines.append(f"BEGIN; SET LOCAL ROLE kernel_probe; SET LOCAL app.space_id = '{t}'; SELECT 'c{i}', (SELECT space_id FROM ops.spaces)::text = '{t}'; COMMIT;")
        lines.append(f"BEGIN; SET LOCAL ROLE kernel_probe; SELECT 'n{i}', count(*) FROM kb.spaces; COMMIT;")
    rows, _ = session(db, '\n'.join(lines))
    good = sum(rows[f'c{i}'] == 't' for i in range(200)); clean = sum(rows[f'n{i}'] == '0' for i in range(200))
    ok('2.13 200 alternating A/B transactions on one reused backend: every tx saw only its tenant; every context-free tx saw 0 rows', good == 200 and clean == 200, f'correct={good}/200 context_free_zero={clean}/200')

    X, Y = uid(501), uid(502)
    rows, _ = session(db, f"""BEGIN; SET LOCAL ROLE kernel_probe; SET LOCAL app.actor_id = '{X}';
SELECT 'only_actor', coalesce(ops.actor()::text,'<NULL>')||','||coalesce(kb.actor()::text,'<NULL>')||','||coalesce(workforce.actor()::text,'<NULL>'); COMMIT;
BEGIN; SET LOCAL ROLE kernel_probe; SET LOCAL app.actor_id = '{X}'; SET LOCAL app.staff_id = '{X}';
SELECT 'both', ops.actor()||','||kb.actor()||','||workforce.actor(); COMMIT;
BEGIN; SET LOCAL ROLE kernel_probe; SET LOCAL app.actor_id = '{X}'; SET LOCAL app.staff_id = '{Y}';
SELECT 'divergent', ops.actor()||','||kb.actor(); COMMIT;""")
    EVIDENCE['actor_alias'] = rows
    ok('2.14 ops.actor() reads app.staff_id: setting only app.actor_id leaves App 3 actor NULL', rows['only_actor'] == f'<NULL>,{X},{X}', rows['only_actor'])
    ok('2.15 kb.actor() and workforce.actor() read app.actor_id; alias makes all three agree', rows['both'] == f'{X},{X},{X}', rows['both'])
    ok('2.16 NEGATIVE: nothing in SQL prevents actor_id and staff_id diverging - the helper must set both from one value', rows['divergent'] == f'{Y},{X}', rows['divergent'])

    psql("""CREATE SCHEMA probe; CREATE FUNCTION probe.set_path_with_clause() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
      AS $$ BEGIN PERFORM set_config('search_path', 'ops, pg_catalog', true); PERFORM set_config('app.actor_id', '00000000-0000-0000-0000-00000000abcd', true); END $$;
      CREATE FUNCTION probe.set_path_no_clause() RETURNS void LANGUAGE plpgsql SECURITY DEFINER
      AS $$ BEGIN PERFORM pg_catalog.set_config('search_path', 'ops, pg_catalog', true); END $$;""", db)
    rows, _ = session(db, """BEGIN; SELECT probe.set_path_with_clause(); SELECT 'with_clause', current_setting('search_path')||' | actor='||current_setting('app.actor_id', true); COMMIT;
BEGIN; SELECT probe.set_path_no_clause(); SELECT 'no_clause', current_setting('search_path'); COMMIT;
SELECT 'after', current_setting('search_path');""")
    ok('2.17 a SET search_path clause reverts a search_path set_config at function exit, but NOT an app.* set_config (different variable)',
       rows['with_clause'].startswith('"$user", public') and rows['with_clause'].endswith('actor=00000000-0000-0000-0000-00000000abcd'), rows['with_clause'])
    ok('2.18 without the clause, set_config(...,true) inside a function persists to transaction end, then reverts', rows['no_clause'] == 'ops, pg_catalog' and rows['after'].startswith('"$user"'), rows)

    # gateway helper protocol
    psql("""INSERT INTO platform.principals (principal_id, auth_subject, display_name) VALUES
      ('00000000-0000-0000-0000-000000000a01','oidc|telavi|fd-lead','Front desk lead (synthetic)'),
      ('00000000-0000-0000-0000-000000000a02','oidc|telavi|disabled','Former staff (synthetic)');""", db)
    m1 = q(f"INSERT INTO platform.members (space_id, principal_id) VALUES ({lit(A)}, '00000000-0000-0000-0000-000000000a01') RETURNING member_id;", db, role='platform_owner')
    q(f"INSERT INTO platform.members (space_id, principal_id, enabled) VALUES ({lit(A)}, '00000000-0000-0000-0000-000000000a02', false);", db, role='platform_owner')
    rows, _ = session(db, f"""BEGIN; SET LOCAL ROLE platform_gateway; SELECT 'member', platform.begin_request('{A}', 'oidc|telavi|fd-lead', 'ops'); SET LOCAL search_path = ops, pg_catalog;
SELECT 'ctx', current_setting('app.space_id')||','||current_setting('app.actor_id')||','||current_setting('app.staff_id')||','||current_setting('app.request_app')||','||current_setting('search_path'); COMMIT;
SELECT 'after', current_setting('app.space_id', true)||','||current_setting('app.actor_id', true)||','||current_setting('app.staff_id', true)||','||current_setting('search_path');""")
    ok('2.19 begin_request sets space/actor/staff alias/app from one validated membership; all revert at COMMIT',
       rows['member'] == m1 and rows['ctx'] == f'{A},{m1},{m1},ops,ops, pg_catalog' and rows['after'].startswith(',,,'), rows)
    def refuse(sql):
        return q(sql, db, role='platform_gateway', fail=True)
    e1 = refuse(f"SELECT platform.begin_request('{A}', 'oidc|telavi|disabled', 'kb');")
    e2 = refuse(f"SELECT platform.begin_request('{B}', 'oidc|telavi|fd-lead', 'kb');")
    e3 = refuse(f"SELECT platform.begin_request('{A}', 'oidc|telavi|fd-lead', 'billing');")
    e4 = refuse(f"SELECT platform.begin_request('{A}', 'oidc|telavi|fd-lead', 'ops'); SELECT platform.begin_request('{B}', 'oidc|telavi|fd-lead', 'ops');")
    ok('2.20 begin_request refuses disabled member, non-member property, unknown app, and re-binding to a second property in one transaction',
       'not an enabled member' in e1 and 'not an enabled member' in e2 and 'unknown app' in e3 and 'already bound' in e4, [e1, e2, e3, e4])
    q(f"UPDATE platform.spaces SET lifecycle = 'SUSPENDED' WHERE id = {lit(A)};", db, role='platform_owner')
    e5 = refuse(f"SELECT platform.begin_request('{A}', 'oidc|telavi|fd-lead', 'ops');")
    q(f"UPDATE platform.spaces SET lifecycle = 'ACTIVE' WHERE id = {lit(A)};", db, role='platform_owner')
    ok('2.21 suspended property refuses all new request contexts', 'not an enabled member of an active property' in e5, e5)
    gw = psql("SELECT has_function_privilege('platform_gateway','platform.begin_request(uuid,text,text)','EXECUTE')::text||','||has_function_privilege('kernel_probe','platform.begin_request(uuid,text,text)','EXECUTE')::text;", db).stdout.strip()
    ok('2.22 only the gateway role may call begin_request', gw == 'true,false', gw)

    # advisory locks: session-scoped vs DISCARD ALL, and the two key spaces
    rows, _ = session(db, """SELECT pg_advisory_lock(4294967298);
SELECT 'held', count(*) FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid();
DISCARD ALL;
SELECT 'after_discard', count(*) FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid();
BEGIN; SELECT pg_advisory_xact_lock(7); SELECT 'xact_held', count(*) FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid(); COMMIT;
SELECT 'xact_after_commit', count(*) FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid();""")
    ok('2.23 DISCARD ALL releases session advisory locks: App 1 pinned dispatcher connections must never be reset mid-send', rows['held'] == '1' and rows['after_discard'] == '0', rows)
    ok('2.24 transaction advisory locks release at COMMIT (safe under transaction pooling)', rows['xact_held'] == '1' and rows['xact_after_commit'] == '0', rows)
    holder = subprocess.Popen(['psql', '-X', '-h', SOCK, '-p', PORT, '-d', db, '-Atq', '-c', 'SELECT pg_advisory_lock(4294967298); SELECT pg_sleep(4);'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    rows, _ = session(db, """SELECT 'two_int_same_bits', pg_try_advisory_lock(1, 2)::text;
SELECT 'same_bigint', pg_try_advisory_lock(4294967298)::text;
SELECT 'objsubid', string_agg(DISTINCT objsubid::text, ',' ORDER BY objsubid::text) FROM pg_locks WHERE locktype='advisory';""")
    holder.wait()
    ok('2.25 bigint and (int4,int4) advisory key spaces do not collide even for identical bits: per-app classid namespacing works',
       rows['two_int_same_bits'] == 'true' and rows['same_bigint'] == 'false' and rows['objsubid'] == '1,2', rows)
    EVIDENCE['part2_db'] = db

# =====================================================================================
# PART 3 - capability matrix, projection into local role columns, separation of duties
# =====================================================================================
def vec(i): return '[' + ','.join('1' if k == i else '0' for k in range(384)) + ']'
def clause(text): return [{'ordinal': 0, 'start_char': 0, 'end_char': len(text), 'content': text, 'chunk_kind': 'POLICY_CLAUSE',
                           'locator': {'page': 1, 'table_id': None, 'row_id': None}, 'structured_data': {}, 'embedding': vec(1), 'embedding_model': 'fixture-384-v1'}]

def part3():
    db = 'k3'; fresh(db); install_kernel(db)
    A = new_space(db, 'TELAVI-CHATEAU', 'Chateau Telavi (synthetic)'); B = new_space(db, 'KVARELI-LAKE', 'Kvareli Lake (synthetic)')
    caps = psql("SELECT domain||'|'||count(*) FROM platform.capabilities GROUP BY domain ORDER BY domain;", db).stdout.split()
    EVIDENCE['catalog'] = caps
    e1 = q("INSERT INTO platform.template_capabilities VALUES ('ROOM_ATTENDANT','ops.task.refund_guest');", db, fail=True)
    e2 = q("INSERT INTO platform.capabilities VALUES ('ai.guest.emotion_score','CRM','GATEWAY','x');", db, fail=True)
    ok('3.01 capability catalog is closed: unknown capability cannot be granted; prefix must match its domain', 'foreign key' in e1 and 'check constraint' in e2, [e1, e2])

    people = {'GENERAL_MANAGER': 'gm', 'FRONT_DESK_LEAD': 'fdl', 'HOUSEKEEPING_SUPERVISOR': 'hks', 'ROOM_ATTENDANT': 'att',
              'CELLAR_SOMMELIER_LEAD': 'som', 'CONTENT_POLICY_EDITOR': 'ed'}
    member = {}
    for i, (tpl, who) in enumerate(people.items()):
        pid = uid(0xB00 + i)
        psql(f"INSERT INTO platform.principals VALUES ({lit(pid)}, 'oidc|kakheti|{who}', {lit(tpl.title().replace('_', ' ') + ' (synthetic)')});", db)
        mid = q(f"INSERT INTO platform.members (space_id, principal_id) VALUES ({lit(A)}, {lit(pid)}) RETURNING member_id;", db, role='platform_owner')
        q(f"INSERT INTO platform.member_templates VALUES ({lit(A)}, {lit(mid)}, {lit(tpl)});", db, role='platform_owner')
        member[who] = mid
    q(f"INSERT INTO platform.member_skills VALUES ({lit(A)}, {lit(member['att'])}, 'housekeeping'), ({lit(A)}, {lit(member['hks'])}, 'housekeeping');", db, role='platform_owner')
    psql('GRANT EXECUTE ON FUNCTION platform.project_member(uuid, uuid) TO platform_owner;', db)
    proj = {}
    for who, mid in member.items():
        proj[who] = json.loads(q(f"SELECT platform.project_member({lit(A)}, {lit(mid)});", db, role='platform_owner'))
    local = {}
    for who, mid in member.items():
        local[who] = json.loads(psql(f"""SELECT json_build_object(
          'app1', (SELECT kind::text FROM contact_center.participants WHERE space_id={lit(A)} AND id={lit(mid)}),
          'app3', (SELECT staff_role||CASE WHEN enabled THEN '' ELSE '(disabled)' END||':'||array_to_string(skills,'+') FROM ops.staff_members WHERE space_id={lit(A)} AND staff_id={lit(mid)}),
          'app4', (SELECT role_name||CASE WHEN enabled THEN '' ELSE '(disabled)' END FROM kb.knowledge_members WHERE space_id={lit(A)} AND actor_id={lit(mid)}),
          'app5', (SELECT role_name||CASE WHEN enabled THEN '' ELSE '(disabled)' END FROM workforce.ai_members WHERE space_id={lit(A)} AND actor_id={lit(mid)}));""", db).stdout)
    EVIDENCE['projection_matrix'] = local
    expected = {'gm': {'app1': None, 'app3': 'SUPERVISOR:', 'app4': 'APPROVER', 'app5': 'APPROVER'},
                'fdl': {'app1': 'operator', 'app3': 'FRONT_DESK:', 'app4': None, 'app5': 'APPROVER'},
                'hks': {'app1': None, 'app3': 'SUPERVISOR:housekeeping', 'app4': None, 'app5': None},
                'att': {'app1': None, 'app3': 'ATTENDANT:housekeeping', 'app4': None, 'app5': None},
                'som': {'app1': 'operator', 'app3': None, 'app4': 'EDITOR', 'app5': 'CONFIGURATOR'},
                'ed': {'app1': None, 'app3': None, 'app4': 'EDITOR', 'app5': None}}
    ok('3.02 six templates project to exactly the expected local rows in Apps 1/3/4/5 (App 2 has no member table)', local == expected, local)
    again = {who: json.loads(q(f"SELECT platform.project_member({lit(A)}, {lit(mid)});", db, role='platform_owner')) for who, mid in member.items()}
    dup = psql(f"SELECT (SELECT count(*) FROM ops.staff_members WHERE space_id={lit(A)})||','||(SELECT count(*) FROM kb.knowledge_members WHERE space_id={lit(A)})||','||(SELECT count(*) FROM workforce.ai_members WHERE space_id={lit(A)})||','||(SELECT count(*) FROM contact_center.participants WHERE space_id={lit(A)});", db).stdout.strip()
    ok('3.03 projection is idempotent (re-run yields identical capability sets and no duplicate rows)', again == proj and dup == '4,3,3,2', dup)
    ok('3.04 no template grants any capability in Apps 1-5 to a property the member does not belong to',
       psql(f"SELECT count(*) FROM ops.staff_members WHERE space_id={lit(B)};", db).stdout.strip() == '0')

    # App 4 separation of duties through the real locked functions
    folder, doc1, doc2 = uid(0xF01), uid(0xD01), uid(0xD02)
    psql(f"""BEGIN; SET LOCAL app.space_id = '{A}';
      INSERT INTO kb.storage_folders(space_id, folder_id, name) VALUES ('{A}', '{folder}', 'Policies');
      INSERT INTO kb.storage_documents(space_id, document_id, folder_id, title, policy_key, locale, audience, document_kind) VALUES
       ('{A}', '{doc1}', '{folder}', 'Cellar tasting policy', 'cellar-tasting', 'en', 'GUEST', 'POLICY'),
       ('{A}', '{doc2}', '{folder}', 'Pool hours', 'pool-hours', 'en', 'GUEST', 'POLICY'); COMMIT;""", db)
    def upload(doc, who, n, text):
        sha = hashlib.sha256(text.encode()).hexdigest()
        rid = q(f"SELECT kb.register_revision('{uid(0xC00 + n)}', '{'a' * 64}', '{doc}', 1, 'fixtures/{sha}', '{sha}', 'text/plain', {len(text)}, 'fixture-parser-v1', tstzrange(now() - interval '1 day', now() + interval '90 days'));",
                db, role='kb_ingest', space=A, actor=member[who])
        q(f"SELECT kb.process_revision('{rid}', {lit(text)}, {lit(json.dumps(clause(text)))}::jsonb, '[]'::jsonb);", db, role='kb_ingest', space=A, actor=member[who])
        return q(f"SELECT knowledge_item_id FROM kb.knowledge_policies WHERE revision_id = '{rid}';", db, space=A)
    def approve(pid, who, fail):
        man = q(f"SELECT r.manifest_sha256 FROM kb.document_revisions r JOIN kb.knowledge_policies p USING (space_id, revision_id) WHERE p.knowledge_item_id = '{pid}';", db, space=A)
        return q(f"SELECT kb.approve_policy('{pid}', 3, {lit(man)}, 'Independent human check of source', NULL);", db, role='kb_reviewer', space=A, actor=member[who], fail=fail)
    p1 = upload(doc1, 'ed', 1, 'Cellar tastings run 16:00-18:00; guests must be 18+.')
    e_self = approve(p1, 'ed', True); e_som = approve(p1, 'som', True)
    ok('3.05 App 4: Content/Policy Editor cannot approve own upload; Sommelier (EDITOR) cannot approve anyone\'s', 'independent human approver required' in e_self and 'independent human approver required' in e_som, [e_self, e_som])
    ep = approve(p1, 'gm', False)
    ok('3.06 App 4: General Manager (APPROVER, not uploader) approves the editor\'s revision', ep.isdigit(), f'knowledge_epoch={ep}')
    p2 = upload(doc2, 'gm', 2, 'Pool open 08:00-20:00.')
    e_gm = approve(p2, 'gm', True)
    ok('3.07 App 4: an APPROVER who uploads cannot approve their own revision (per-revision SoD)', 'independent human approver required' in e_gm, e_gm)

    # multi-template precedence: editor who is also promoted to GM
    q(f"INSERT INTO platform.member_templates VALUES ({lit(A)}, {lit(member['ed'])}, 'GENERAL_MANAGER');", db, role='platform_owner')
    r = json.loads(q(f"SELECT platform.project_member({lit(A)}, {lit(member['ed'])});", db, role='platform_owner'))
    e_ed = approve(p2, 'ed', False)
    ok('3.08 EDITOR+GM collapses to APPROVER losslessly (App 4 upload needs only membership) and can approve a revision uploaded by someone else', r['app4_role_name'] == 'APPROVER' and e_ed.isdigit(), r['app4_role_name'])
    q(f"DELETE FROM platform.member_templates WHERE space_id={lit(A)} AND member_id={lit(member['ed'])} AND template_key='GENERAL_MANAGER';", db, role='platform_owner')
    q(f"SELECT platform.project_member({lit(A)}, {lit(member['ed'])});", db, role='platform_owner')

    # App 5 separation of duties through the real locked functions
    agent = uid(0xA6E)
    def draft(graph, creator, inserter):
        q(f"""INSERT INTO workforce.ai_agents VALUES ('{A}', '{agent}', {1 if graph == uid(0x61) else 2}, 'SOMMELIER', 'WARM_CONCISE', 'en', 'cellar.v1')
             ON CONFLICT DO NOTHING;
           INSERT INTO workforce.agent_graph_definitions (space_id, graph_id, version, created_by, compiler_version, entry_node, max_steps, max_handoffs)
             VALUES ('{A}', '{graph}', 1, '{member[creator]}', 'hotel-graph-v1', 'done', 8, 0);
           INSERT INTO workforce.agent_graph_nodes (space_id, graph_id, graph_version, node_key, kind, agent_id, agent_version)
             VALUES ('{A}', '{graph}', 1, 'done', 'END', '{agent}', {1 if graph == uid(0x61) else 2});""",
          db, role='ai_config', space=A, actor=member[inserter])
    def publish(graph, who, fail):
        h = q(f"SELECT workforce.graph_digest('{graph}', 1);", db, role='ai_config', space=A, actor=member[who])
        return q(f"SELECT workforce.publish_graph('{graph}', 1, '{h}');", db, role='ai_config', space=A, actor=member[who], fail=fail)
    g1, g2, g3 = uid(0x61), uid(0x62), uid(0x63)
    draft(g1, 'som', 'som')
    e = publish(g1, 'som', True)
    ok('3.09 App 5: Sommelier (CONFIGURATOR, creator) cannot publish own graph', 'independent graph approver required' in e, e)
    publish(g1, 'gm', False)
    st = q(f"SELECT state||','||approved_by FROM workforce.agent_graph_definitions WHERE graph_id='{g1}';", db, space=A)
    ok('3.10 App 5: General Manager publishes the sommelier graph', st == f"ACTIVE,{member['gm']}", st)
    draft(g2, 'som', 'som')
    publish(g2, 'fdl', False)
    st = q(f"SELECT state FROM workforce.agent_graph_definitions WHERE graph_id='{g2}';", db, space=A)
    ok('3.11 FINDING: Front Desk Lead holds ai.session.resume, which requires App 5 APPROVER, so the DB also lets them publish graphs', st == 'ACTIVE', 'App 5 overloads APPROVER for resume and publish')
    draft(g3, 'som', 'gm')   # GM inserts a draft but records the sommelier as creator
    publish(g3, 'gm', False)
    st = q(f"SELECT created_by||'|'||approved_by FROM workforce.agent_graph_definitions WHERE graph_id='{g3}';", db, space=A)
    ok('3.12 FINDING: App 5 does not bind created_by to actor(); an approver can record a colleague as author and self-publish', st == f"{member['som']}|{member['gm']}", st)

    # alias attack and uniqueness
    alias = uid(0xBAD)
    psql(f"BEGIN; SET LOCAL app.space_id='{A}'; INSERT INTO workforce.ai_members VALUES ('{A}', '{alias}', 'APPROVER', true); COMMIT;", db)
    ok('3.13 NEGATIVE: raw App 5 accepts a second APPROVER identity for the same human (ai_members has no auth_subject)', True, 'insert accepted')
    psql(f"BEGIN; SET LOCAL app.space_id='{A}'; DELETE FROM workforce.ai_members WHERE actor_id='{alias}'; COMMIT;", db)
    e1 = q(f"INSERT INTO platform.members (space_id, principal_id) SELECT {lit(A)}, principal_id FROM platform.members WHERE member_id = {lit(member['gm'])};", db, role='platform_owner', fail=True)
    e2 = q(f"INSERT INTO kb.knowledge_members VALUES ('{A}', '{alias}', 'oidc|kakheti|gm', 'APPROVER', true);", db, space=A, fail=True)
    ok('3.14 kernel refuses a second membership for the same principal in one property; App 4 refuses a duplicate auth_subject', 'duplicate key' in e1 and 'duplicate key' in e2, [e1, e2])

    # revocation
    q(f"DELETE FROM platform.member_templates WHERE space_id={lit(A)} AND member_id={lit(member['gm'])};", db, role='platform_owner')
    q(f"SELECT platform.project_member({lit(A)}, {lit(member['gm'])});", db, role='platform_owner')
    state = psql(f"SELECT (SELECT enabled FROM ops.staff_members WHERE staff_id={lit(member['gm'])})::text||','||(SELECT enabled FROM kb.knowledge_members WHERE actor_id={lit(member['gm'])})::text||','||(SELECT enabled FROM workforce.ai_members WHERE actor_id={lit(member['gm'])})::text;", db).stdout.strip()
    draft(uid(0x64), 'som', 'som')
    e = publish(uid(0x64), 'gm', True)
    ok('3.15 removing all templates disables (never deletes) the projected rows and the DB then refuses the former approver', state == 'false,false,false' and 'independent graph approver required' in e, [state, e])
    part = psql(f"SELECT count(*) FROM contact_center.participants WHERE space_id={lit(A)} AND id={lit(member['fdl'])};", db).stdout.strip()
    q(f"DELETE FROM platform.member_templates WHERE space_id={lit(A)} AND member_id={lit(member['fdl'])};", db, role='platform_owner')
    q(f"SELECT platform.project_member({lit(A)}, {lit(member['fdl'])});", db, role='platform_owner')
    part2 = psql(f"SELECT count(*) FROM contact_center.participants WHERE space_id={lit(A)} AND id={lit(member['fdl'])} AND kind='operator';", db).stdout.strip()
    ok('3.16 GAP: App 1 operator participants have no enabled flag; revocation survives only at the token/gateway layer', part == '1' and part2 == '1', 'operator row persists after revocation')
    EVIDENCE['members'] = member
    EVIDENCE['part3_db'] = db

# =====================================================================================
# PART 4 - regression: locked app harnesses against kernel-augmented databases
# =====================================================================================
def run_harness(db, label):
    out = {}
    for t in ['app3/verify.py', 'app4/verify.py', 'app4/extra.py', 'app5/verify.py', 'app5/verify_extra.py']:
        src = (W / t).read_text().replace("'-d','kernel'", f"'-d','{db}'")
        p = (W / t).with_name(f'{label}_{Path(t).name}')
        p.write_text(src)
        r = subprocess.run(['python3', str(p)], text=True, capture_output=True, cwd=os.environ.get('REPO', '.'), timeout=900)
        tail = (r.stdout.strip().splitlines() or [''])[-1] if r.returncode == 0 else next((l for l in r.stderr.splitlines() if 'ERROR:' in l), r.stderr[-300:])
        out[t] = {'exit': r.returncode, 'result': tail if r.returncode == 0 else tail[:300]}
        if r.returncode == 0:
            m = re.search(r'"passed":\s*(\d+)', r.stdout)
            out[t]['passed'] = int(m.group(1)) if m else None
    return out

def part4():
    fresh('k4a'); install_kernel('k4a', fk=False)
    res_nofk = run_harness('k4a', 'nofk'); EVIDENCE['harness_kernel_no_fk'] = res_nofk
    ok('4.01 all published App 3/4/5 suites pass unchanged with the kernel schema, roles, grants and projection functions installed (no FK)',
       all(v['exit'] == 0 for v in res_nofk.values()), {k: v.get('passed') for k, v in res_nofk.items()})
    fresh('k4b'); install_kernel('k4b', fk=True)
    res_fk = run_harness('k4b', 'fk'); EVIDENCE['harness_kernel_fk'] = res_fk
    ok('4.02 EXPECTED BREAK: with Option 1 hard FKs, every suite that seeds its own tenant row directly fails at that insert',
       all(res_fk[t]['exit'] != 0 and 'foreign key' in res_fk[t]['result'] for t in ['app3/verify.py', 'app4/verify.py', 'app5/verify.py']),
       {k: (v['exit'], v['result'][:160]) for k, v in res_fk.items()})

def part5():
    db = 'k4c'; fresh(db); install_kernel(db, fk=True)
    # FK kept; auto-provisioning trigger off; kernel rows pre-registered for the fixture tenant UUIDs.
    psql("""ALTER TABLE platform.spaces DISABLE TRIGGER space_provision;
      INSERT INTO platform.spaces (id, property_code, display_name)
      SELECT ('00000000-0000-0000-0000-'||lpad(to_hex(n),12,'0'))::uuid, 'FIXTURE-'||n, 'Fixture tenant '||n FROM generate_series(1, 1024) n;""", db)
    res = run_harness(db, 'fkseed'); EVIDENCE['harness_fk_seeded'] = res
    ok('4.03 with FKs kept but projections left to each app (kernel rows pre-registered), all App 3/4/5 suites pass unchanged',
       all(v['exit'] == 0 for v in res.values()), {k: v.get('passed', v['result'][:120]) for k, v in res.items()})

if __name__ == '__main__':
    only = sys.argv[1:] or ['1', '2', '3', '4']
    for n in only: globals()['part' + n]()
    out = W / 'kernel' / ('results_' + '_'.join(only) + '.json')
    out.write_text(json.dumps({'server': psql('SHOW server_version;', 'postgres').stdout.strip(), 'checks': RESULTS, 'evidence': EVIDENCE}, indent=2, default=str))
    print(json.dumps({'passed': sum(r['passed'] for r in RESULTS), 'failed': sum(not r['passed'] for r in RESULTS), 'total': len(RESULTS)}))
```

## Appendix C — work-directory preparation (`prepare.py`)

<!-- artifact: prepare.py -->
```python
"""Prepare a Sub-Component A work directory from the locked dossiers (run from the repository root).
Extracts the five DDL blocks unmodified and the App 3/4/5 verification harnesses, rewiring ONLY their
connection arguments (socket, port 55466, database) and scratch-file paths into $KERNEL_WORKDIR."""
import os, re, json, hashlib
from pathlib import Path

W = Path(os.environ['KERNEL_WORKDIR']); SOCK = str(W / 'socket'); APPS = Path('research/apps')
FILES = {1: '01_contact_center_dossier.md', 2: '02_guest_crm_dossier.md', 3: '03_operations_task_dossier.md',
         4: '04_storage_knowledge_dossier.md', 5: '05_ai_team_agent_core_dossier.md'}

def conn(s, host_expr):
    s = re.sub(r"'-p','55\d\d\d'", "'-p','55466'", s).replace("'-d','postgres'", "'-d','kernel'")
    return s.replace(host_expr, repr(SOCK))

(W / 'ddl').mkdir(parents=True, exist_ok=True)
for n, f in FILES.items():
    md = (APPS / f).read_text()
    m = re.search(r'<!-- artifact: ddl\.sql -->\n```sql\n(.*?)\n```', md, re.S) or re.search(r'```sql\n(.*?)\n```', md, re.S)
    body = m.group(1) + '\n'
    (W / 'ddl' / f'app{n}.sql').write_text(body)
    print(f'app{n}.sql', hashlib.sha256(body.encode()).hexdigest())

# App 3 (its recipe, 03 dossier section 10, with /tmp/ops-* redirected)
A3 = W / 'app3'; (A3 / 'ops-contracts').mkdir(parents=True, exist_ok=True)
blocks = re.findall(r"```(sql|json|python)\n(.*?)\n```", (APPS / FILES[3]).read_text(), re.S)
(A3 / 'ops-ddl.sql').write_text(next(b for l, b in blocks if l == 'sql') + '\n')
names = {'https://schemas.smartstay.example/operations/guest-request/1': 'inbound.schema.json',
         'https://schemas.smartstay.example/contact-center/task-status/1': 'callback.schema.json',
         'https://schemas.smartstay.example/operations/staff-action/1': 'staff-action.schema.json',
         'https://schemas.smartstay.example/operations/staff-result/1': 'staff-result.schema.json'}
for l, b in blocks:
    if l == 'json':
        o = json.loads(b)
        if o.get('$id') in names: (A3 / 'ops-contracts' / names[o['$id']]).write_text(b + '\n')
        elif o.get('type') == 'GuestRequestDetectedEvent': (A3 / 'ops-contracts' / 'inbound.example.json').write_text(b + '\n')
h = next(b for l, b in blocks if l == 'python' and b.startswith('import subprocess,json,uuid,hashlib,copy,concurrent.futures')) + '\n'
for b in re.findall(r"```json\n(.*?)\n```", (APPS / FILES[1]).read_text(), re.S):
    o = json.loads(b)
    if o.get('$id') == 'https://schemas.smartstay.example/contact-center/outbox-event/1': (A3 / 'ops-source-outbox.json').write_text(b + '\n')
    if o.get('$id') == 'https://schemas.smartstay.example/contact-center/task-status/1': (A3 / 'ops-callback.json').write_text(b + '\n')
(A3 / 'verify.py').write_text(conn(h, "'/tmp'").replace('/tmp/ops-', str(A3) + '/ops-'))

# App 4 (its recipe, 04 dossier section 10.3)
A4 = W / 'app4'
for name, lang, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```(\w+)\n(.*?)\n```', (APPS / FILES[4]).read_text(), re.S):
    p = A4 / name; p.parent.mkdir(parents=True, exist_ok=True)
    body = body.replace('/tmp/app04-review', str(A4))
    p.write_text((conn(body, repr(str(A4 / 'socket'))) if name.endswith('.py') else body) + '\n')
bl = [json.loads(b) for b in re.findall(r'```json\n(.*?)\n```', (APPS / FILES[1]).read_text(), re.S)]
(A4 / 'app1-dispatch.json').write_text(json.dumps(next(b for b in bl if b.get('$id', '').endswith('outbound-dispatch/1'))))
(A4 / 'app1-ai-example.json').write_text(json.dumps(next(b for b in bl if b.get('author_kind') == 'ai' and 'policy_evidence' in b)))

# App 5 (its recipe, 05 dossier section 11.3)
A5 = W / 'app5'
for name, lang, body in re.findall(r'<!-- artifact: ([\w./-]+) -->\n```(\w+)\n(.*?)\n```', (APPS / FILES[5]).read_text(), re.S):
    p = A5 / name; p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text((conn(body, "str(R/'socket')") if name == 'verify.py' else body) + '\n')
for app in range(1, 5):
    for raw in re.findall(r'```json\n(.*?)\n```', (APPS / FILES[app]).read_text(), re.S):
        try: sc = json.loads(raw)
        except json.JSONDecodeError: continue
        if '$id' in sc: (A5 / 'contracts' / f"app{app}-{sc['$id'].split('/')[-2]}.json").write_text(json.dumps(sc, indent=2) + '\n')
print('prepared', W)
```
