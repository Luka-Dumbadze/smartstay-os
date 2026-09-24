# Candidate #3: multi-channel overbooking and relocation-cost hedging

## Executive verdict

**DOES NOT QUALIFY as the hackathon core engine on the evidence currently available.**
[O] The unchanged evaluator returned **rejected** with synthetic provenance enabled.
Ordinary evaluation returned **rejected**. Formal weighted score:
**unavailable (null; incomplete eligibility is not a zero score)**.

**This is an executed synthetic discovery rehearsal, not empirical hotel validation.** All incident records,
quotes, quantities, commitments and personnel below are invented roleplay. [O] The execution and gate results
were actually observed locally. [I] Architecture interpretations are engineering judgments. [U] Real hotel
prevalence, recoverable revenue, causal effect and A2A superiority remain unestablished. D/O labels in the
synthetic case describe evidence within the fiction only; they never establish genuine operator records.

**Simulated incident:** SYNTHETIC rehearsal: with one room remaining, Booking.com, Expedia and Direct remained open against shared inventory. Booking.com and Expedia accepted reservations nominally 65 seconds apart, producing 29 commitments for 28 rooms. Direct took no additional booking. The Expedia guest stayed at the hotel; the earlier Booking.com guest was relocated for one night with transport. The selection rationale is undocumented. A GEL 1,143 relocation invoice was deducted once from the payout; GEL 360 remains disputed without credit. Missing distribution records prevent a definitive causal finding. The later exclusive Direct control had one successful use, with only a summary available.

The 28-room hotel, 35–40% cancellation churn, booking separation within 90 seconds, two-minute update
interval, USD 260 replacement night, USD 30 taxi and EUR 120 claimed handling line are imposed fictional
premises. The [market corpus](../research/derived/market_findings.md) does not establish these quantities,
API timings or tariffs. Any conversion rate below belongs to a mock settlement, not real market FX.

## Retrieved policy versus scenario assumptions

[D] The public [Booking.com General Delivery Terms](https://admin.booking.com/hotelreg/terms-and-conditions.html)
snapshot displays `v2601_nE_i`. Clause **2.6.1** addresses relocation and reasonable associated costs; section
**6** covers indemnification/liability. Clause 2.6.1 refers to sums payable within 14 days after invoice receipt.
Its relocation response windows are not channel synchronization SLAs.
[O] No literal `120` or `handling fee` appears in the retrieved text. [U] This source does not establish a
universal EUR 120 tariff, the specific property's applicable signed terms, or an automatic monthly payout
deduction for that disputed charge. A fictional statement can show an offset without proving a universal policy.

[D] The same retrieved text, **2.3.3**, says commission is charged for overbooking irrespective of waiver
of the room price. [I] The commission reversal in the mock Turn 07 settlement is therefore a specific
fictional credit, not evidence of an automatic contractual entitlement. Its assumed economic benefit must
not be carried into a real relocation-cost model without the applicable settlement and agreement.

[Policy check and verbatim extracts](../research/cases/overbooking_001/policy/policy_check.md) ·
[Raw HTML](../research/cases/overbooking_001/policy/booking_general_terms.html) ·
[Extracted text](../research/cases/overbooking_001/policy/booking_general_terms.txt) ·
[Source URL, retrieval time and SHA-256](../research/cases/overbooking_001/policy/source.json).

## Actual execution and provenance

- [O] Both roles pinned to **`gpt-6-astra`** on every call; no alternative-model fallback.
- [O] Interviewer session: `01a0ccf8-31ee-7803-ab25-062e27d35869`.
- [O] Respondent session: `01a0ccf6-e5e1-7421-be2a-1c8893eb9a0e`.
- [O] **12 Q/A exchanges**, **24 delivered speaker messages**, seven chronological stages.
- [O] **39 calls** including private preparation, pre-delivery reviews, synthesis and audit;
  cumulative subprocess time **708.7 seconds**.
- Minute labels represent the simulated 40-minute agenda, not 40 elapsed minutes with a person.
- Separate sessions/directories, tools disabled/forbidden; the respondent dossier was not sent to the interviewer.
- [O] CLI `codex-cli 0.155.1`; 39 calls recorded the known nonfatal
  model-catalog refresh warning. Successful calls required exit zero and a completed turn. Model identity is
  supported by invocation/configuration, not independent attestation of provider internals.

[Verbatim transcript](../research/cases/transcript_overbooking_hedging.md) ·
[Strict case card](../research/cases/case_overbooking_hedging.json) ·
[Evaluation JSON](../research/cases/overbooking_001/evaluation.json) ·
[State, commands and input SHA-256 hashes](../research/cases/overbooking_001/state.json) ·
[Verification](../research/cases/overbooking_001/verification.json).
Raw prompts, drafts, reviews, responses, events and stderr are retained under `research/cases/overbooking_001/calls/`.

## G1–G7 exact evaluator audit

| Gate | Outcome | Unmodified evaluator explanation |
|---|---|---|
| G1 | FAIL | Need reviewed operator record/direct observation; press or analyst opinion alone is insufficient.; Need a recorded consequence confirmation or direct observation.; Every trace step needs reviewed primary episode evidence. |
| G2 | FAIL | Need a closed observation period, counted incidents, positive eligible-opportunity denominator, unit, and primary evidence.; Need repeated incidents or an operator-confirmed sufficiently serious consequence with evidence. |
| G3 | FAIL | Need evidenced asynchronous cross-role state/constraint dependencies, not an asserted flag alone.; Single-database CRUD or an unknown CRUD assessment does not establish A2A fit.; Identify the consequential negotiation/ownership/acknowledgement failure and its trace steps. |
| G4 | FAIL | Binding physical/hardware, labor-economics, external-demand, or unknown constraint cannot pass as software leverage.; Specify an evidenced permitted software action and the information available to change the failure path. |
| G5 | FAIL | Need available/redacted inputs and reviewed access evidence.; Need a usable adapter/import or explicitly honest simulator; assumed integration is insufficient.; Need explicit write limits and evidenced authority of a role able to approve trial actions. |
| G6 | FAIL | Need an explicit bounded estimate within 115 hours.; Need an end-to-end boundary, deterministic state oracle, baseline comparison, and recovery test.; Need available reviewed replay-case artifacts.; Feasibility needs supporting artifacts, not only an optimistic estimate. |
| G7 | FAIL | A simple rule/task-list baseline must be tested and shown insufficient; unknown or sufficient fails.; Describe the tested simple control, its observed failure, and why dependency negotiation/adaptation matters.; Need reviewed evidence of the baseline comparison. |

[O] The read-only evaluator is called as `evaluate(card, synthetic_test=True)`; this is its existing synthetic
qualification exception, not a gate waiver. It still applies all other gates, evidence eligibility and threshold checks.
Its `supported()` requires **every** referenced artifact to be reviewed, D/O and an allowed kind. A list mixing
D/O records with I/U or unreviewed references can fail even with a fictional primary excerpt present.
No artifact labels were upgraded to force a pass.

## Weighted score and contributions

[O] Exact weights: Severity 20, A2A fit 20, Feasibility 15, Evidence 15, Frequency 15,
Preventable share 10, Adoption 5. Formula: `sum(weight * rating / 4)`. Selection requires all gates,
score ≥70, eligible evidence and no zero in the core dimensions defined by the evaluator.

| Dimension | Weight | Rating / 4 | Diagnostic contribution / 100 | Rationale from case synthesis |
|---|---:|---:|---:|---|
| severity | 20 | 2 | 10.0 | Reviewer assessment within the fiction: a completed relocation and settled GEL 1,143 expense substantiate a consequence. No recurrence, measured labor or operator-confirmed relative materiality supports a higher assessment. |
| a2a_fit | 20 | unknown | unscored | Actual responsibilities and a recovery escalation are described, but no consequential failed cross-role dependency or advantage over simple allocation is established. |
| feasibility | 15 | unknown | unscored | No bounded implementation, estimate, adapter, oracle, replay or failure-recovery test was elicited. |
| evidence | 15 | 2 | 7.5 | Within-fiction assessment only: shown incident and settlement excerpts plus a plausible comparator summary support partial reconstruction. Missing logs, absent independent confirmation and no conflict denominator prevent a stronger rating; none constitutes real field evidence. |
| frequency | 15 | 0 | 0.0 | One isolated conflict is described; a closed count of affected opportunities and its denominator are unavailable. This score does not mean zero incidents. The cancellation cohort cannot supply conflict frequency. |
| preventable_share | 10 | unknown | unscored | One successful exclusive Direct use does not quantify preventable share. The causal mechanism, external application timing and permitted engineering action remain unresolved. |
| adoption | 5 | unknown | unscored | The sole commitment is a written rehearsal summary. It does not establish product adoption, real access, a trial owner or a supervised test window. |

[O] Diagnostic total if all ratings exist: **unavailable**.
Diagnostic mathematical bounds with unknown dimensions ranging from 0 to 4:
**17.5–67.5 / 100**.
These bounds do not impute ratings, satisfy evidence eligibility or override rejected gates.

## Question review and interview fidelity

[O] Each draft was reviewed in the same interviewer session before delivery. This adds no third persona and
exposes no private respondent dossier. Lexical checks and model self-review reduce errors; neither proves
non-leading fidelity. The substantive audit below assesses the delivered transcript candidly.

[O] The public-policy check was supplied to the respondent during private preparation. Its Turn 06
reference to a check “you supplied” comes from that preparation, not an exchange in which the interviewer
provided it or an independent hotelier source. The transcript retains this rehearsal artifact verbatim.

| Turn | Review action | Review reason |
|---|---|---|
| 01 | Retained | Neutral opening consent and one operating-context question; no assumed fault, cause, or specific assignment. |
| 02 | Retained | Uses topics the respondent introduced, permits no incident, and offers a normal booking without assuming failure or cause. |
| 03 | Retained | Checks the respondent’s stated sequence through timestamp sources and meanings without assuming acceptance times, causation, or record availability. |
| 04 | Retained | Examines the reported update trail without assuming payload contents, effective closure times, or a cause; the record request is conditional. |
| 05 | Revised | Removed stacked prompts about participants, options, and authority; retained one concrete process question and a conditional record request. |
| 06 | Retained | Examines the charge already reported without endorsing its contractual basis; the related record request is conditional. |
| 07 | Retained | One reconciliation question with a related conditional record request; it does not assume guest funds were received or treat the invoiced amount as additional loss. |
| 08 | Retained | Requests a closed-period count and denominator without presuming recurrence or cause; the conditional record request checks inclusion and outcome definitions. |
| 09 | Retained | Asks about actual changes and their timing, explicitly permits none, and does not presume a failed workaround or causal link. |
| 10 | Retained | Follows the reported use of the control without presuming failure or broader effectiveness; the related request to inspect entries is conditional. |
| 11 | Retained | Invites other differences without assigning causation to the control, and explicitly permits none or unknown. |
| 12 | Retained | Briefly invites correction and an optional concrete next step without presuming commitment, access, approval, or a trial. |

## Incident trace, G3/G7 analysis, risks and next evidence

[I] “Sub-second hedging” is a hypothesis, not a measured runtime result. The audit separates deterministic
inventory allocation and prevention from relocation recovery, and compares the two earlier rehearsals.
The [raw model audit](../research/cases/overbooking_001/interviewer_audit.md) is preserved verbatim.

**[I] The overbooking rehearsal does not currently qualify as the core engine.** [O] Both supplied evaluations reject it, with `errors: []`, G1–G7 all failing, and `weighted_score: null`. Allowing synthetic provenance removes only that provenance objection; it does not make any gate pass.

All hotel incidents, people, transactions and quantities below remain **SYNTHETIC**. [O] identifies supplied evaluator/tool results, not a fresh execution. [D] identifies the separately supplied retrieved policy text. [I] identifies analysis; [U] identifies unestablished claims.

**[I] The delivered interview was generally neutral, but self-review was too permissive about compression and evidentiary premises.**

| Delivered turns | Audit |
|---|---|
| **01–02** | Appropriate consent, responsibility question and optional difficult-episode invitation. The normal-booking fallback avoided requiring failure. Consent and discovery appeared together, although rehearsal consent was explicitly granted. |
| **03** | Timestamp sources and meanings were essential. However, “support the booking order” slightly favors confirmation of the account. “What timestamps are available for these bookings?” would leave contradictory evidence more open. |
| **04** | Correctly distinguished export contents from acknowledgement meaning. “Inventory sent” risks treating ledger intentions as transmitted payloads; the respondent supplied that correction. Two related technical tasks plus retrieval could overwhelm a less prepared participant. |
| **05** | Focused decision walkthrough with a conditional record request. It did not presume the selection rule or a failed escalation. |
| **06** | Strong challenge to the claimed fee’s basis without endorsing it. Invoice and applicable terms were appropriately distinguished. |
| **07** | Financially useful but dense: invoice, offset, bank receipts, guest funds, currencies and conversions. These belong to one reconciliation, yet would benefit from sequential inspection. |
| **08** | Correct numerator/denominator direction. “Conflict like this” and “relevant bookings” leave the counted failure and eligible cohort underspecified. Outcome classification was requested but never completed. |
| **09** | Allowed no change and asked a closely related timing question. Its post-incident focus could miss earlier controls or failed attempts. |
| **10** | Grounded in the reported control, but “entries through the two Direct confirmations” suggested detailed entries existed. The conditional request helped; the respondent’s correction exposed the limitation. |
| **11** | Appropriately invited competing differences and allowed unknowns. It did not claim the allocation change caused success. |
| **12** | Correction and commitment are two separate tasks. “Do you agree to now?” adds mild pressure, mitigated by “if any.” No access or trial was presumed. |

[I] No delivered question pitched a product, asked willingness to pay, or proposed a hypothetical intervention. Requests such as “could you show” concerned existing records. The rejected draft for Turn 05 is not part of this audit.

[I] Independent accounts were missed: no separate Night Auditor, Channel Operations or Front Desk interview was requested. Staff rework and operator-relative materiality were also not elicited. The respondent volunteered much of the unusually careful differentiation between records, knowledge, causation, cash and legal basis; that precision cannot be credited entirely to the questions.

**SYNTHETIC chronology**

All clock times below use **UTC+04:00**. Quoted excerpts are fictional records, not real observations.

| Date/time | Event and source | Clock meaning and limitation |
|---|---|---|
| Before acceptances | GM leaves Booking.com, Expedia and Direct open against the last room (**T01–02**). | Decision time unknown; exposure accepted, a 29th sale not deliberately authorized. |
| 12 Sep 00:10:00 | Export **U-8421**, version **8421**, availability **1**, both OTA targets (**T04**). | Local dispatch record; first-job acknowledgement absent. |
| 00:10:15 | Booking.com **B-ACC-01** accepts F-BKG-912-A (**T03**). | External acceptance; whole-second resolution, assumed ±5 seconds. |
| 00:10:25 | **B-IN-01** arrives locally (**T03**). | Callback receipt, not staff awareness. |
| 00:10:28 | Local commit **8422**, availability zero (**T03**). | Local processing; approximately ±2-second clock uncertainty. |
| 00:11:20 | Expedia **E-ACC-01** accepts F-EXP-912-B (**T03**). | External acceptance; assumed ±5 seconds. |
| 00:11:30 / 00:11:34 | **E-IN-01** received; local commit **8423**, one-room deficit (**T03**). | Receipt and processing are separate; 29 commitments against 28 rooms. |
| 00:12:00 | **U-8423**, intended availability zero, requests **B-OUT-02/E-OUT-02** (**T04**). | Dispatch intention; Expedia payload bodies missing. Internal deficit retained. |
| 00:12:06 / 00:12:09 | **B-ACK-02/E-ACK-02** accept receipt (**T04**). | Neither establishes applied closure or consumer sellability. |
| Reported 00:14 | Both listings unavailable for the search checked (**T03–04**). | Minute resolution; underlying observation and search scope unavailable. |
| Reported 00:19 | Night Auditor reads exception and escalates (**T05**). | Narrative read time; underlying read log absent. |
| 00:23 | GM notified; no internal room (**T05**). | Shown recovery entry, minute resolution. |
| 09:10 / 09:25 | Alternative confirmed; guest accepts accommodation and transport (**T05**). | Minute-resolution recovery entries. Reason for choosing the earlier booking remains unknown. |
| 13 Sep 11:00 | Relocated stay completed (**T05**). | Recorded minute. Original USD 200 refund occurred that date; intraday order unknown (**T07**). |
| 14 Sep | Relocation invoice issued/received (**T06–07**). | Date only. |
| 18 Sep | Invoice offset and GEL 3,957 bank receipt (**T07**); exclusive Direct control initiated (**T09–10**). | Same-date order unknown. |
| 19–20 Sep | Comparator: two Direct rooms sold, 28 parties stayed, no recorded conflict or relocation (**T10**). | Summary only; individual confirmation and closure-check times absent. |
| 20 / 21 Sep | Expedia settlement / GEL 453.60 bank receipt (**T07**). | Dates only. |
| 23 Sep | No handling-charge credit; commitment limited to a written rehearsal summary (**T06, T12**). | No operational trial or real access. |

[I] The nominal acceptance separation is **65 seconds**, with the supplied uncertainty yielding **55–75 seconds**. Their order is supported within the fiction; simultaneity is not. Expedia accepted nominally **52 seconds after local availability reached zero**, and the next export followed that zero commit by **92 seconds**. These establish a local/external state discrepancy and a scheduling gap within the scenario.

[U] They do not isolate its cause or measure end-to-end closure latency. Mapping errors, manual edits and unobserved application behavior remain possible. The two-minute export spacing is not a synchronization guarantee. There is no 90-second acceptance separation here; a separate 90-second observation would establish neither sub-minute nor sub-second performance.

[I] The case card’s attribution deserves correction in interpretation: assigning machine/external events to `channel_operations` represents responsibility, not an identified actor. Likewise, assigning settlement and guest-completion events to the GM does not prove the GM performed them. Four roles across incident and comparator do not establish four failed handoffs. Date-only events have a partial chronological order, not the fully ordered execution implied by step numbering.

**SYNTHETIC financial reconciliation**

| Item | Correct interpretation |
|---|---|
| Accommodation | USD 260 → **GEL 702** |
| Taxi | USD 30 → **GEL 81** |
| Disputed handling item | EUR 120 → **GEL 360** |
| Total settled relocation expense | **GEL 1,143**, counted once |

[I] These conversions use the explicitly fictional **FX-F12** schedule: USD/GEL 2.70 and EUR/GEL 3.00. They are not real market FX.

The supplied payout reconciles exactly:

`6,000 − 900 + 540 − 540 − 81 + 81 − 1,143 = GEL 3,957`

[I] That amount matches the fictional bank receipt. The invoice and payout offset represent one expense, not two. The OTA paid the competitor and taxi; there was no separate hotel supplier payment to add.

The original guest’s USD 200 collection and full refund cancel at GEL 540 each. The hotel never received those funds in cash; adding GEL 540 to incremental relocation leakage would conflate returned guest funds with recovery expense. Commission and reversal also cancel.

Expedia’s ordinary net revenue is `540 − 86.40 = GEL 453.60`, matching its bank receipt. It is not established as incremental revenue attributable to accepting excess demand and should not automatically offset the relocation expense.

[I] **GEL 783** is accommodation/transport cost; **GEL 360** is a deducted but contractually disputed handling charge. Calling the whole amount a verified “penalty” is unsupported. No staff labor was measured. Notification delays, overnight elapsed time and guest acceptance timing are not staff-hours; guest waiting itself was not established.

**[D] The public-policy check corrects the fee assumption without authenticating this property’s contract.**

The supplied retrieved [Booking.com terms](https://admin.booking.com/hotelreg/terms-and-conditions.html), displayed version `v2601_nE_i`, place relocation obligations in **2.6.1**: suitable equal-or-better alternatives without additional guest charge, reasonable relocation expenses, and sums due payable within 14 days of invoice receipt. Its response windows begin with Booking.com’s notification to find an alternative; they are not inventory synchronization SLAs.

[D] Section **6**, including **6.2.1**, concerns indemnification and liability and includes overbooking. It does not establish the claimed fixed tariff.

[O] The supplied retrieval check found no literal `120` or `handling fee`. [U] A universal EUR 120 fee, the property’s applicable signed terms, enforceability of this invoice and automatic monthly-payout mechanics remain unestablished. Absence from that text does not exclude other applicable terms. Unrelated refund/set-off provisions cannot authenticate this deduction. Nor can the fictional 00:23 GM notification be substituted for the contractual Booking.com notification trigger.

**[I] Exposure remains uncounted.** The incident contains two distinct conflicting reservations and **one actual relocation within the fiction**. The comparator reports two Direct sales and no relocation. These selected examples are not a complete cohort and cannot yield a one-in-four conflict rate.

The August cohort contains **100 unique free-cancellation reservations: 38 cancellations and 62 completed stays**. It has no conflict field. Cancellation churn establishes neither conflict frequency nor a mathematical need to overbook. Window, incident numerator, eligible denominator and 30-day-equivalent conflict frequency correctly remain null.

**[O] Exact supplied qualification results**

Both evaluations fail every gate; the synthetic exception removes only G1’s synthetic-provenance objection.

| Gate | Supplied failure and interpretation |
|---|---|
| **G1** | Normal mode rejects synthetic provenance. Both modes reject qualifying primary support, consequence-confirmation support and primary evidence for every trace step. Fictional excerpts coexist with unreviewed accounts; their presence does not satisfy every reference set. |
| **G2** | No closed observation period, counted incidents, positive eligible denominator, unit or primary count evidence; neither recurrence nor evidenced operator-confirmed seriousness established. |
| **G3** | Asynchronous cross-role dependencies lack qualifying support; CRUD assessment is unknown; no consequential negotiation, ownership or acknowledgement failure is localized. |
| **G4** | Binding constraint is unknown; no evidenced permitted software action using then-available information changes the demonstrated failure path. |
| **G5** | No qualifying inputs/access evidence, usable adapter/import/simulator, explicit write limits or evidenced trial authority. |
| **G6** | No supported estimate within 115 hours, bounded workflow, deterministic oracle, baseline comparison, recovery test or reviewed replay cases. |
| **G7** | No simple baseline shown insufficient, observed baseline failure, demonstrated adaptation advantage or qualifying comparison evidence. |

[I] These results must not be “repaired” by upgrading testimony, inventing adapters or dropping inconvenient evidence. They distinguish schema acceptance from qualification.

| Dimension | Weight | Supplied rating | Diagnostic contribution |
|---|---:|---:|---:|
| Severity | 20 | 2 | 10 |
| A2A fit | 20 | null | null |
| Feasibility | 15 | null | null |
| Evidence | 15 | 2 | 7.5 |
| Frequency | 15 | 0 | 0 |
| Preventable share | 10 | null | null |
| Adoption | 5 | null | null |

[O] Formal score remains null and formal contributions empty. Diagnostic bounds are **17.5–67.5**, holding assigned ratings fixed and varying unknowns. Even the upper bound is below 70, but it is not a selection score. Severity/evidence assess fictional completeness and consequence; frequency zero means recurrence is unestablished, not zero incidents.

**[I] Testing the proposition that hedging passes G3/G4/G7 gives a negative current result.**

| Approach | Prevention or recovery | Evidentiary position |
|---|---|---|
| Channel-specific allotments, exclusive last-room allocation, safety stock | Prevention: limit concurrently exposed capacity | Strong simple baselines. The exclusive Direct comparator succeeded once, but changed both source and restriction threshold. Demand and foregone revenue remain unmatched. |
| Transactional capacity checks, idempotency, reconciliation | Local prevention and reliable state handling | Atomic local checks protect locally controlled capacity. Deduplication cannot resolve two distinct valid reservations. A local lock cannot atomically control independent OTA inventories. Reconciliation detects/corrects discrepancies but cannot undo an already accepted external commitment without consequences. |
| Relocation search, cost approval and guest communication | Recovery after conflict | Slower cross-role work is plausible, but no failed recovery handoff, measured rework or benefit from LLM coordination was established. |

[I] Distributed inventory risk is conceptually credible; the fictional sequence illustrates it. That does not prove an LLM A2A system prevents it. Prevention needs enforceable allocation invariants and measured end-to-end behavior. Recovery may involve judgment and communication, but cannot create a missing room.

[U] OTA API availability, permissions, rate limits, supported inventory semantics and application latency remain unverified. LLM coordination cannot substitute for measured low-latency synchronization. A sleeping-human argument would establish neither the actual failure nor G7. Flat oversell percentages are weaker comparisons than explicit capacity allocation and acknowledgement-based release controls.

**[I] Comparison of the separate rehearsals**

| Candidate | Main constraint and consequence | Strong simple comparison | Current result |
|---|---|---|---|
| **#1 Turnaround** | Physical cleaning plus unchecked readiness assurance; synthetic GEL 60 refund | Confirm-before-promising, maintained priority queue and inspection-based release; paper/phone comparator succeeded | All gates fail; score null; diagnostic bounds **26.25–51.25** |
| **#2 MICE** | Package compatibility, capacity and authority; prospective USD 10,296 offer, no established cash loss | Versioned costing, preapproved terms, parallel approvals and deadline escalation | All gates fail; score null; bounds **23.75–48.75** |
| **Overbooking** | Independent sales exposure plus missing closure history; synthetic GEL 1,143 deduction | Allotments/exclusive allocation, local transactions and reconciliation | All gates fail; score null; bounds **17.5–67.5** |

[I] MICE offers plausible coupled commercial decisions; turnaround mixes information with physical readiness; overbooking has the clearest machine-state timing boundary. None establishes A2A superiority. Their different diagnostic bounds are not evidence of relative market value.

**[I] The next useful checks are specific.** Independently reconstruct a real episode with permission; interview the three operational perspectives separately; obtain acceptance, payload, mapping, edit and application histories; count a closed booking cohort with separate cancellation/conflict/relocation outcomes; measure repeated work and reconcile settled costs.

Engineering work would then need explicit write authority, adapter feasibility, measurable timing, invariant-based replay tests, duplicate/out-of-order/failure recovery cases and comparison against strong deterministic allocation controls. Test recovery separately from prevention and record foregone demand as well as avoided relocations.

[I] The rehearsal’s strengths are clear clock meanings, reconciled fictional settlement, visible legal uncertainty and a successful simple-control counterexample. The qualified verdict remains **retain as an investigation hypothesis, not a selected core engine**. [U] No real validation or hackathon judging evidence supports calling any candidate a winning entry.

## Reproduce and verify

```bash
python3 scripts/run_overbooking_eval.py run          # authenticated fresh run; refuses existing state
python3 scripts/run_overbooking_eval.py run --resume # continue from persisted checkpoint
python3 scripts/run_overbooking_eval.py evaluate     # offline, existing synthetic exception
python3 scripts/run_overbooking_eval.py verify       # offline schema, semantics, hashes and transcript
```

The driver reuses the local transport in `scripts/simulate_mom_test.py`, fingerprinted alongside the four
read-only inputs, both comparison reports and the retained policy snapshot. It neither changes that file nor overwrites the previous simulation. Python 3.11+,
`jsonschema` and authenticated `codex exec` access are required for a fresh run. No hardware/IoT is in scope.
The wrapper's zero exit status means execution/validation succeeded; the evaluation JSON's `accepted`
and `status` fields determine candidate qualification. A valid rejected case is a successful pipeline run.
