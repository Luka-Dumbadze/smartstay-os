# Mom Test simulation 001: execution and audit

**SYNTHETIC REHEARSAL.** This is an authentic record of model-to-model dialogue, not an authentic real-world hotel incident.
No hotel was interviewed and no guest record, payment, staff time, consent, or commitment was independently verified.
The private persona and all incident numbers are fictional. The user specified an 18-room hotel, 85%+ weekend occupancy,
Cloudbeds/WhatsApp/notebook workflow and seasonal churn; the harvested market findings support only broader
staffing/cost/reporting concerns and do not establish those property-specific assumptions.

## Execution and isolation

- Both agents requested **`gpt-6-astra`** on every call; no alternative model fallback. CLI: `codex-cli 0.155.1`.
- Interviewer session: `01a0ccb5-7075-7a32-8211-97ebf44e18a6`; respondent session: `01a0ccb4-04b9-71e2-b64f-04f1572a3831`.
- Two separate working directories and role-specific developer instructions; tools disabled where configurable and forbidden in prompts.
- Only the respondent received the private dossier. The interviewer received the field guide and subsequently the respondent's delivered answers.
- **12 exchanges / 24 speaker messages**, covering seven stages; minute labels simulate the 40-minute agenda, not wall-clock duration.
- **27 completed/attempted role calls**, accumulated subprocess wall time **545.2 seconds**.
- Nonfatal model-catalog parsing warnings occurred in **27 calls**; outputs required exit zero and `turn.completed`.
- Model identity is evidenced by pinned CLI invocation/configuration; the provider's backend identity is not independently attested by model self-report.

[Verbatim delivered transcript](../research/cases/interview_transcript_001.md) ·
[Case card](../research/cases/case_simulated_001.json) ·
[Execution state and input hashes](../research/cases/simulation_001/state.json) ·
[Evaluation JSON](../research/cases/simulation_001/evaluation.json).
Raw prompts, instructions, stdout events, stderr, and response text are in `research/cases/simulation_001/calls/`.
The respondent-only preparation is retained separately for reproducibility and was excluded from interviewer inputs.

## Fidelity checks and their limits

The deterministic forbidden-word/hypothetical/leading-phrase screening result is:

```json
{
  "1": [],
  "2": [],
  "3": [],
  "4": [],
  "5": [],
  "6": [],
  "7": [],
  "8": [],
  "9": [],
  "10": [],
  "11": [],
  "12": []
}
```

This lexical screen is not a proof that every question is non-leading. The substantive audit below examines premises,
stacked questions, narrowing, missed counterevidence, and what the respondent actually supplied. Rejected undelivered
question drafts, if any, are preserved in raw call logs and are not substituted into the delivered transcript.

## Incident and formal gate evaluation

**Case:** SYNTHETIC episode: On 19 September, nine departures and nine arriving room bookings coincided with an experienced attendant's absence. Reception confirmed early access for A at 13:30 and B at 14:00 without housekeeping confirmation. The manager approved B's 13:00 late checkout without checking the incoming promise. Housekeeping warned at 11:56 that neither early time could be confirmed; reception requested A first, but guest corrections and handover acknowledgement remain undocumented. A arrived at 13:32 and received keys at 14:20; B arrived at 14:00 and received keys at 15:26. B received a 60 GEL cash refund and a separate 30 GEL waiver for wine service supplied. The relative contributions of staffing, later room access, cleaning condition, interruptions and unsupported promises remain unresolved.

**Root classification:** `ARRIVAL_READINESS`. Cash leakage field: **60 GEL**;
rework field: **not verified**. These are values extracted from fictional testimony;
null means not established and must not be converted to zero. Distinct traced operational roles: **4**.

The ordinary evaluator result is **rejected**, preserving the synthetic-data rejection.
The equivalent synthetic-enabled call uses the existing read-only API:

```python
result = evaluate_candidate.evaluate(case_card, synthetic_test=True)
```

This enables only the existing synthetic provenance exception; it does not force a gate or supply missing evidence.
The resulting formal status is **rejected**. Formal weighted selection score: **unavailable**
(`null`/`None` means scoring was not reached or eligible ratings are incomplete, not a zero score).

| Gate | Outcome | Evaluator explanation |
|---|---|---|
| G1 | FAIL | Need reviewed operator record/direct observation; press or analyst opinion alone is insufficient.; Need a recorded consequence confirmation or direct observation.; Every trace step needs reviewed primary episode evidence. |
| G2 | FAIL | Need a closed observation period, counted incidents, positive eligible-opportunity denominator, unit, and primary evidence. |
| G3 | FAIL | Need evidenced asynchronous cross-role state/constraint dependencies, not an asserted flag alone.; Single-database CRUD or an unknown CRUD assessment does not establish A2A fit.; Identify the consequential negotiation/ownership/acknowledgement failure and its trace steps. |
| G4 | FAIL | Binding physical/hardware, labor-economics, external-demand, or unknown constraint cannot pass as software leverage.; Specify an evidenced permitted software action and the information available to change the failure path. |
| G5 | FAIL | Need available/redacted inputs and reviewed access evidence.; Need a usable adapter/import or explicitly honest simulator; assumed integration is insufficient.; Need explicit write limits and evidenced authority of a role able to approve trial actions. |
| G6 | FAIL | Need an explicit bounded estimate within 115 hours.; Need an end-to-end boundary, deterministic state oracle, baseline comparison, and recovery test.; Need available reviewed replay-case artifacts.; Feasibility needs supporting artifacts, not only an optimistic estimate. |
| G7 | FAIL | A simple rule/task-list baseline must be tested and shown insufficient; unknown or sufficient fails.; Describe the tested simple control, its observed failure, and why dependency negotiation/adaptation matters.; Need reviewed evidence of the baseline comparison. |

**Evaluator implementation observation [O]:** `supported()` requires every referenced artifact to be reviewed,
labelled D or O, and of an allowed kind. `has_kind()` first applies that entire-list check. Consequently,
mixed D/I reference lists fail even when they contain fictional operator-record excerpts marked D. This explains
the broad G1/G3 diagnostics; it does not mean the case lacks all record excerpts. The read-only evaluator and
the agent's evidence labels were preserved. D labels here describe records within the fiction, never real-world verification.

## Weighted dimensions: diagnostic only when gates fail

Exact weights and `sum(weight × rating / 4)` are taken from the read-only evaluator. The table below exposes the
ratings rather than manufacturing a passing score. It is not the evaluator's formal selection result.

| Dimension | Weight | Rating / 4 | Diagnostic contribution | Interviewer assessment |
|---|---:|---:|---:|---|
| severity | 20 | 2 | 10.0 | Reviewer assessment within the synthetic exercise: recorded guest delays and a reconciled 60 GEL cash refund plus 30 GEL waived revenue were meaningful to the manager. Large or recurring financial harm and measured staff labor were not established. |
| a2a_fit | 20 | 2 | 10.0 | Reviewer assessment within the synthetic exercise: housekeeping readiness and reception commitments depend on distinct responsibilities, with a separate manager decision affecting room access. Asynchronous exchanges are present, but adaptive coordination advantages over explicit ownership and simple confirmation rules are untested; single-database sufficiency remains unknown. |
| feasibility | 15 | unknown | unscored | No engineering estimate, verified adapter, bounded implementation, replay set, deterministic oracle or recovery test was elicited. Narrative timestamps do not establish build feasibility. |
| evidence | 15 | 2 | 7.5 | Reviewer assessment of narrative completeness within the synthetic exercise only: supplied fictional excerpts reconstruct promises, warning, releases, key handovers and cash reconciliation, with a confounded smooth comparator. Independent staff confirmation, inspected weekly counting records and replay evidence are absent. This rating does not imply real operational evidence; the synthetic case cannot pass the real-problem gate. |
| frequency | 15 | 1 | 3.75 | Two affected room bookings were identified on one day within a reported seven-day cohort of 34 arrivals. The underlying weekly register and denominator of all early confirmations were not supplied. The 8.571428571428571 figure is only a 30-day-equivalent normalization of two misses in seven days, not demonstrated monthly recurrence. |
| preventable_share | 10 | unknown | unscored | The manager identified unsupported promises but could not separate their consequences from reduced staffing, later room access and cleaning work. No permitted intervention or measured preventable share was established. |
| adoption | 5 | 0 | 0.0 | The closing account explicitly states no agreed next step or date, no wider sharing authorization and no authorized trial. Anonymous interview notes and a proposed internal review do not establish adoption or staff consent. |

Diagnostic total if all ratings are known: **unavailable (incomplete ratings)**.
With unknown ratings, the mathematical bounds are **31.25–56.25 / 100**;
these are bounds, not imputed ratings, a predicted result, or authorization to proceed. Failed gates still reject.

## Interviewer agent's substantive audit and event trace

**Fidelity outcome:** The audit identifies a leading assignment premise in Turn 04 and overloaded questions.
The strict no-leading requirement was therefore not fully met in this recorded run, despite the lexical screen.
The original dialogue is retained verbatim, with neutral replacements below; it is not retrospectively rewritten.

The interview maintained a neutral, factual approach and handled several measurement traps well. Its main weaknesses were compound questions, incomplete operating context, reliance on the manager’s account of other people’s actions, and insufficient examination of what reception knew when making the promises. The respondent supplied many of the strongest qualifications without being explicitly asked.

Everything below concerns **a synthetic rehearsal**. The quoted records are fictional narrative excerpts, not genuine operational evidence or market validation.

**Interviewer fidelity**

| Turn and verbatim question fragment | Assessment |
|---|---|
| 01: “May we take notes?” | Appropriate separation of notes from recording and attributable quotation. Asking about responsibilities before receiving consent slightly compressed the sequence. No real consent resulted from this simulation. |
| 02: “the last occasion when the shift did not go as planned” | Neutral incident discovery consistent with the guide. It mildly presupposes an occasion exists; explicitly allowing none would improve it. |
| 03: “through both parties receiving their keys” | Grounded in the respondent’s account, but requests two complete timelines at once. “Which of those times come from records” was a strong uncertainty probe. |
| 04: “who was responsible for updating each guest” | The clearest leading premise: it assumes an assigned responsibility existed. “Where, if anywhere” qualifies the record’s existence, not the assignment. The respondent correctly separated managerial expectation from actual assignment. |
| 05: “each say they saw and did” | Seeks distinct perspectives, but through the manager, producing potential hearsay. “If you’ve heard their accounts” appropriately permits missing information. |
| 06: “what you personally saw and what you learned from others” | Strong distinction between firsthand knowledge and reported accounts. Still combines records, two guest journeys and provenance in one turn. |
| 07: “how many arriving parties” | Introduces a counting unit without establishing it. The respondent corrected this to room bookings. Frequency and compensation are also separate investigative tasks bundled together. |
| 08: “staff time … from the guests’ waiting time” | Strong measurement discipline. The materiality question allowed the respondent to decline a ranking, although it followed an already complex time question. |
| 09: “Can you show a case after that change” | Asked before establishing whether a change existed. It also left “after” ambiguous: after the incident or after an earlier process change. The respondent resolved this. |
| 10: “introducing and running” and “on what occasions” | Two grammatical questions contain setup cost, recurring effort, measurement provenance, historical execution and outcomes. Too much for one turn. “If any” usefully avoids assuming earlier misses. |
| 11: “available rooms, staff time and cleaning work” | Appropriate competing-cause probe, but broad. Separate questions would better isolate room access, staffing and cleaning work. |
| 12: “What have I missed or misstated?” | Balanced correction request that preserved uncertainty. The next question bundles commitment, date, authority and scope. “If any” appropriately permits no commitment. |

There were **no interviewer pitches, willingness-to-pay questions, prohibited product references, or hypothetical/counterfactual questions**. Requests such as “Can you show…” concern present access to records. Conditional phrases such as “if one exists” permit absence rather than create hypothetical scenarios. The respondent’s counterfactual comments do not constitute interviewer violations.

The interview generally stayed within two question marks per turn, but often exceeded two substantive requests and did not consistently follow the guide’s one-question-at-a-time discipline.

**Event trace**

All dates below are **19 September 2026**, with times expressed in **+04:00**. “Excerpt” means text supplied within the fiction. “Reported” means the respondent described a record that was not displayed.

| Time | Event | Basis and limitation |
|---|---|---|
| 07:12 | Experienced attendant reports sickness and absence. | Fictional WhatsApp excerpt, Turn 04. |
| 08:05 | A requests 13:30; B requests 14:00; both conditional on housekeeping. | Fictional notebook excerpt, Turn 04. |
| 09:10 | Manager approves B’s 13:00 late checkout without checking incoming request. | Reported PMS timestamp, Turn 03; underlying entry not shown. |
| 10:42 | Reception tells B that 14:00 access is available. | Fictional notebook excerpt, Turn 04; no call recording. |
| 10:48 | Reception confirms A’s 13:30 access. | Fictional notebook excerpt, Turn 04. |
| 11:56 | Housekeeping reports reduced staffing and B’s late checkout; cannot confirm either early time. | Fictional WhatsApp excerpt, Turn 04. |
| 12:03 | Morning reception requests A first. | Fictional WhatsApp excerpt, Turn 04; establishes a reply about priority, not completed guest updates. |
| Scheduled 12:30 | Paper arrival review reportedly missed. | Manager’s account, Turns 09–10; no measured event time. |
| 13:07 | B’s previous checkout is processed. | Reported PMS timestamp, Turn 03; physical departure remains unknown. |
| Around 13:25 | Seasonal attendant reportedly starts cleaning A. | Recollection, Turn 06; estimated. |
| 13:30–14:00 | Reception shifts reportedly overlap. | Rota described in Turn 05; discussion and warning receipt unknown. |
| 13:32 | A arrives and waits in courtyard. | Fictional notebook excerpt, Turn 05. |
| 14:00 | B arrives and cites the 14:00 promise. | Fictional notebook excerpt, Turn 05. PMS reportedly still says dirty, Turn 12. |
| Roughly 14:12–15:15 | Lead reportedly cleans B, including extra bathroom work and an interruption. | Recollection, Turns 06 and 11; not continuous measured labor. |
| 14:18 | Housekeeping releases A after inspection. | Fictional WhatsApp excerpt, Turn 06. |
| 14:20 | A receives keys. | Fictional notebook excerpt, Turn 06. |
| Around 14:40–14:48 | Manager handles B’s complaint and agrees compensation. | Manager’s reconstruction, Turn 06; estimated. |
| 15:24 | Housekeeping releases B after inspection. | Fictional WhatsApp excerpt, Turn 06. |
| 15:26 | B receives keys. | Fictional notebook excerpt, Turn 06. |
| 15:31 | Room charge reduced by 60 GEL. | Fictional folio excerpt, Turn 07. |
| 15:32 | Unpaid 30 GEL wine charge waived. | Fictional folio excerpt, Turn 07; service was supplied. |
| 15:34 | 60 GEL cash refund recorded. | Fictional folio and cashbook excerpts, Turn 07. |

The supplied case needs several qualifications:

- Its exact `occurred_at` for the manager’s 09:10 approval is stronger than the guide’s verified-timestamp rule permits: the PMS entry was described, not inspected. Preserve the reported exact time in the note without presenting it as verified.
- Its financial steps attribute postings to reception. The respondent supports reception involvement in compensation processing, but the individual posting actors were redacted.
- Four distinct roles appear as trace actors or recipients; five are listed overall. That count is internally consistent because the seasonal attendant has no separate trace step. It does not establish four-role coordination complexity.
- Combining morning and incoming reception under one responsibility avoids inventing departments, but obscures the person-to-person transition. Their separate knowledge and actions must remain unresolved.

**Money, time and exposure**

The money reconciliation is sound within the fictional account:

- Original charges: **320 + 30 = 350 GEL**.
- Final charges: **350 − 60 − 30 = 260 GEL**.
- Net payments retained: **320 − 60 = 260 GEL**.
- Cash refunded: **60 GEL**.
- Separately waived revenue: **30 GEL**.
- Total charge reduction: **90 GEL**.

The 60 GEL adjustment and refund are one concession. Neither 90 GEL nor 120 GEL is the cash refund. No incremental cost of supplying the wine was established.

A’s **48-minute arrival wait** differs from its **50-minute miss against the promise**. B’s wait and promise miss are both **86 minutes**, including **26 minutes beyond normal check-in**. Neither is staff labor. The **43 staff minutes** remain reconstructed estimates, including the seven minutes attributed to compensation processing. Posting timestamps do not measure active work. Keeping verified staff rework null was appropriate.

The count is **two affected room bookings among 34 reported arrivals**, not two failed early confirmations out of 34 early confirmations. The latter denominator is unknown. The underlying weekly register was not supplied. **2 × 30 ÷ 7 ≈ 8.57** is an arithmetic normalization, not observed monthly recurrence or a forecast. Two affected bookings on one disrupted day also do not demonstrate repeated independent episodes.

**Causes and the simple-rule comparison**

The account supports an unsupported-promise problem alongside physical readiness constraints. It does **not** establish that a clean room remained hidden behind stale status:

- The manager said B still showed dirty at arrival.
- Both recorded key handovers followed inspection release by two minutes.
- One experienced attendant was absent.
- B had later potential room access, extra cleaning and an interruption.
- Eight stayovers added unmeasured work.
- The spare single was unsuitable.

The missing knowledge is especially important at **10:42 and 10:48**, when reception made the assurances. I did not adequately inspect what information each receptionist actually consulted then. Missing guest-correction records and missing handover acknowledgement cannot prove that no conversations occurred.

The paper-review baseline remains uncertain because **nonexecution is different from demonstrated insufficiency when executed**. The review reportedly occurred on 12 September, when conditions also included three housekeeping workers and no checkout beyond noon. Equal turnover counts do not control those differences.

A further missed probe concerns timing: **the assurances preceded the scheduled 12:30 review**. The separate instruction to obtain housekeeping confirmation before promising early access was therefore central. A later review might identify outstanding commitments, but its existence alone does not explain how the earlier confirmation rule operated. No further change or controlled comparison was tested.

**Gates and the attached evaluation**

Both supplied evaluations report **rejected**, **no structural errors**, **all G1–G7 failed**, and **no weighted score**. Allowing synthetic provenance removes only the explicit synthetic exclusion; it does not supply missing evidence or waive other requirements.

| Gate | Interpretation |
|---|---|
| G1 | Normal evaluation necessarily rejects synthetic provenance. Reported PMS facts, estimated work and manager-mediated accounts also leave trace support incomplete. Fictional confirmation is not real-world verification. |
| G2 | Dates and counts are populated, but the complete denominator lacks inspected primary support. |
| G3 | Asynchronous exchanges exist in the story. However, role counts and message timestamps alone do not establish a consequential coordination failure requiring A2A. The release-to-key dependencies actually succeeded. Guest-update ownership and completion remain unresolved, and `single_database_crud` is null. |
| G4 | Binding constraints and preventable consequences remain unknown. No evidenced permitted action is established. Potentially improving promises does not establish the ability to make B physically ready sooner. |
| G5 | No established adapter, usable import, write limits or trial authority. A fictional transcript is not an implemented simulator. |
| G6 | No engineering estimate, bounded implementation, replay artifacts, oracle, comparative test or recovery test. |
| G7 | No demonstrated failure of a consistently executed simple baseline and no evidence that adaptive coordination outperforms it. |

Some evaluator messages are broader than the visible field-level facts. For example, the case contains fictional `operator_record` entries marked D and reviewed, yet the result still reports missing reviewed primary evidence. The attached output alone does not explain that exact eligibility decision. It would be inaccurate to claim the case contains no such entries—or to claim those flags establish genuine evidence.

The diagnostic **31.25–56.25 bounds are not a selection score**. Even the upper bound is below 70 under the supplied ratings, but rejection already follows from failed gates. Unknown ratings must remain unknown.

**Neutral replacements for the Human Director**

Use these individually, with follow-ups only after the answer:

| Gap | Replacement question |
|---|---|
| Operating context | “Of the 18 rooms, how many are currently offered to guests?” |
| Services and seasonality | “Which services are operating now, and during which months?” |
| Assignment premise, Turn 04 | “What, if anything, was agreed about contacting the guests after the warning?” |
| Information behind the promise | “What did morning reception consult before confirming B’s 14:00 access?” |
| Original timestamp support | “Can you show the 09:10 late-checkout entry with private details hidden?” |
| Independent perspective | “Starting with the 11:56 message, what did you personally see and do next?” |
| Exposure unit and count | “Can you show how the 34 arriving room bookings were counted for 14–20 September?” |
| Early-confirmation denominator | “Which bookings in that week had a confirmed early time, including those completed on time?” |
| Duplicate financial entries | “Which entries refer to the same concession?” |
| Rework measurement | “For the compensation processing, what marks the start and end of active work, if anything?” |
| Capacity and interruptions | “What interrupted B’s cleaning, and what record or firsthand account describes it?” |
| Baseline execution | “On 12 September, what happened between the early requests and each confirmation?” |
| Earlier confirmation rule | “What instruction applied to early requests received before the 12:30 review?” |
| Commitment without assumption | “What follow-up, if any, has already been agreed?” |
| Authority, separately | “Who currently authorizes sharing these operational records outside the hotel?” |

The principal rehearsal lesson is to obtain the qualifications through short, targeted questions instead of relying on an unusually careful respondent to volunteer them.

## Reproduce and verify

```bash
./scripts/simulate_mom_test.py run             # fresh run only; refuses to overwrite existing state
./scripts/simulate_mom_test.py run --resume    # resume this run from its persisted checkpoint
./scripts/simulate_mom_test.py evaluate        # offline synthetic/ordinary evaluation, no source edits
./scripts/simulate_mom_test.py verify          # schema, references, provenance, transcript and input hashes
```

Run requires authenticated `codex exec` access to `gpt-6-astra`; it may incur model usage. Evaluate/verify are offline.
A missing model, failed call, persistent policy violation or schema failure stops with saved logs; there is no fabricated
conversation fallback. Files marked read-only by the task are hashed before and after the run and never edited.

Official execution reference consulted: https://developers.openai.com/codex/noninteractive/ .
A model-catalog warning is documented, not treated as permission to substitute a model.
