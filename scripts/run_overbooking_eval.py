#!/usr/bin/env python3
"""Overbooking discovery rehearsal: two isolated gpt-6-astra sessions.

Python 3.11+, authenticated codex CLI, jsonschema, and the existing local
simulate_mom_test.py transport are required. No SDK or alternate-model fallback.
run [--resume] executes; evaluate and verify work offline. The four specified
read-only inputs and the reused transport are fingerprinted, never edited.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('overbooking_transport', ROOT / 'scripts/simulate_mom_test.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
# Configure the imported transport only in this process; preserve its source and
# the previous simulation's paths, state, dialogue and outputs on disk.
base.RUN = ROOT / 'research/cases/overbooking_001'
base.TRANSCRIPT = ROOT / 'research/cases/transcript_overbooking_hedging.md'
base.CASE = ROOT / 'research/cases/case_overbooking_hedging.json'
base.REPORT = ROOT / 'docs/overbooking_hedging_evaluation.md'
POLICY = ROOT / 'research/cases/overbooking_001/policy'
base.READ_ONLY = [*base.READ_ONLY, 'scripts/simulate_mom_test.py',
    'docs/turnaround_deadlock_evaluation.md', 'docs/mice_rfp_evaluation.md',
    *[str((POLICY / name).relative_to(ROOT)) for name in
      ['policy_check.md', 'booking_general_terms.html', 'booking_general_terms.txt', 'source.json']]]
base.INTERVIEWER += """
Focus on distribution across booking channels and direct sales. The topic does not
establish a race, lag, penalty, synchronization guarantee, cancellation rate or
need for agent coordination. Do not call bookings simultaneous without records.
Ask ONE main question, normally at most 45 words, plus one tightly related record
request if useful. Never assume a message or record exists; make its request
conditional. Ask about source timestamps, meanings and actions without treating
a record as proof of what someone knew. Let the respondent supply channels,
amounts, dates, causes and claimed contract terms. Ask what supports a legal/fee
claim without endorsing it. No pitch, hypothetical intervention or advice.
"""
base.RESPONDENT = base.COMMON + """Role: pragmatic general manager/operations lead of a
FICTIONAL 28-room boutique wine hotel in Kakheti. Interview date: 23 September 2026.
USER-IMPOSED FICTIONAL PREMISES: peak weekend demand; roughly 35–40% cancellation
churn on free-cancellation bookings influences a decision to keep channels open
near sellout. This is not a market statistic or proof that overselling is necessary.
A last-room Expedia and Booking.com booking pair arrived within 90 seconds while
inventory synchronization took about two minutes. Direct bookings share inventory.
A guest was relocated for one night to a competitor quoted at USD 260, with USD 30
transport and a claimed EUR 120 handling item on a fictional invoice, ultimately
reflected in a fictional payout reduction. Those are scenario transaction claims,
not verified Booking.com tariffs, API guarantees or applicable contract terms.
The manager may recall 'Clause 6' but cannot authenticate an applicable signed
clause or a universal EUR 120 fee. Preserve that uncertainty when asked.
Maintain your stable private dossier. Reveal information progressively, answer only
the current question, typically 100–240 words. When asked, read exact clearly
fictional log/invoice/settlement excerpts with dates, currencies and meanings.
Do not invent a real legal policy, real FX rate, API capability, engineering
benchmark, integration test, refund authority or future trial. Be protective of
staff; distinguish deliberate risk policy from accidental inventory races.
No real hotel, guest record or consent exists. The transcript header explains this.
"""
FOCUS = [
    'Opening: request note-taking consent and ask how the participant is responsible for inventory across booking channels and direct sales. No presumed fault.',
    'Invite the most recent booking conflict or guest relocation, if any; allow a normal booking if none exists.',
    'Inspect the original timestamps of the bookings already mentioned, including their source and clock meaning; do not equate notification receipt with OTA acceptance.',
    'Inspect the inventory change and acknowledgement trail for that incident. Ask what the available records actually show about the claimed delay; permit missing logs and competing explanations.',
    'Trace who handled the actual relocation decision and what options and authority were available; avoid assuming the system could create inventory or reject confirmed bookings.',
    'Ask for the actual relocation invoice and the basis of any fee or clause claim already mentioned. Do not assert a universal tariff or accept legal shorthand as a signed contract.',
    'Reconcile billed amounts with payout deductions and bank receipts in their actual currencies, including recorded conversions, original guest funds and duplicate entries. Keep unverified staff labor unknown.',
    'Request one closed-period count and its eligible-booking denominator. Distinguish cancellation cohorts, sync conflicts, intentional overselling and walked guests.',
    'Ask what, if anything, was actually changed in channel allocation or controls and when. Do not presuppose a failed workaround.',
    'Follow one actual use of that control and its outcome; do not demand failure of deterministic allotments, buffers or manual closing.',
    'Invite a comparable incident or near-sellout period that went well and what differed; preserve unknowns and avoid suggesting the cause.',
    'Briefly invite correction of the reconstruction, then a concrete next step agreed now if any. No invented access, approval or trial.',
]
original_transcript = base.transcript_text


def transcript_text(state):
    text = original_transcript(state)
    text = text.replace('# Simulated Mom Test interview 001', '# Multi-channel overbooking: synthetic Mom Test interview')
    text = text.replace('`simulation_001/calls/`', '`overbooking_001/calls/`')
    text = text.replace('The 18-room property, 85%+ weekend occupancy, current tool stack, and all incident-level figures are fictional assumptions/details.',
        'The 28-room hotel, cancellation rate, booking timing, charges and settlement conversions are fictional scenario details. Claimed Clause 6 and EUR 120 fee are not authenticated policy. No real guest was interviewed or relocated.')
    return text


base.transcript_text = transcript_text


class OverbookingHarness(base.Harness):
    def call(self, role, purpose, prompt, instruction=None):
        if purpose == 'private-preparation':
            prompt = """PRIVATE PREPARATION FOR THE OVERBOOKING SCENARIO. Return a stable fictional JSON dossier,
under 2500 words. Use the 28-room hotel with Front Desk/Night Auditor, Revenue/GM and Channel Operations.
Pick a completed peak-weekend incident before 23 September 2026: Booking.com and Expedia each confirm
one booking against the same last available room within 90 seconds, during a roughly two-minute update
interval. Distinguish true OTA booking acceptance, callback receipt, processing, outbound stock change,
API acknowledgement and eventual sellability. Specify timezone, correlation IDs, inventory version and
clock limits. Do not claim sub-second latency from minute-level observations or vendor UI alone. Preserve
an unresolved log boundary or competing mapping/manual-edit explanation where records are missing.
Treat channels as external systems, not invented human departments. Include actual Direct inventory handling.
Night staff may be busy/sleeping, but do not make lack of human vigilance the only cause of a machine race.
Explain the 35–40% churn figure as a fictional local estimate or properly defined cohort, not market truth.
It does not logically force a risky last-room policy. Separate intentional overbooking from accidental conflict.
A guest is relocated for ONE night: competitor USD 260, taxi USD 30 and a claimed EUR 120 handling line.
The manager recalls 'Clause 6'; applicable signed terms and legal basis of that handling line are unavailable.
The PUBLIC POLICY CHECK below is real context, not the hotel's contract. Do not contradict it by claiming a
universal tariff. A clearly fictional invoice can show a charge even when its contractual basis is unknown.
Create consistent readable mock invoice, OTA payout/offset statement and bank receipt, with explicit FICTIONAL
transaction conversion rates and GEL amounts if needed to reconcile. Never present these rates as real market
FX. Include original booking funds, refunds, commissions, credits and cash movements sufficiently to avoid
counting the same invoice and deduction twice, or treating all gross replacement revenue as incremental loss.
Distinguish settled deductions from pending invoices/disputed items. A September incident's completed monthly
payout must be plausible by 23 September (e.g. specified completed payout period); no future payout as observed.
Include staff rework only if measured in a mock primary record, otherwise estimated/unknown. Give a closed
booking cohort if available, one actually used simple control and a comparable success, with limitations.
No implemented API connector, stock reservation lock across OTAs, replay benchmark, measured hedge latency,
future trial or guaranteed recovery advantage exists. Do not invent one later. Strong controls could include
channel-specific allotments, an exclusive last-room channel, a safety buffer, versioning and explicit recovery
ownership; do not rig them to fail. No real legal conclusion or operational evidence is being created.
PUBLIC POLICY CHECK:
""" + (POLICY / 'policy_check.md').read_text() + '\nBROAD MARKET CONTEXT ONLY:\n' + (ROOT / 'research/derived/market_findings.md').read_text()
        match = re.fullmatch(r'turn-(\d{2})', purpose)
        if role == 'interviewer' and match:
            turn = int(match[1])
            prompt += '\nNEUTRAL TOPIC GUIDE (not facts to assert):\n' + FOCUS[turn - 1]
        if purpose == 'post-interview-audit':
            prompt = """AUDIT. The interview is complete. Return candid Markdown under 2800 words.
Audit only delivered questions for leading premises, stacked tasks, hypothetical/pitch violations, weak
record requests and missing independent accounts; self-review is no guarantee. Extract a chronological
trace with turn references, clock meaning and unknowns. Separate actual OTA acceptance from inbound
receipt and outbound update acknowledgement/application; determine what race/lag is actually established.
A 90-second separation is not sub-minute or sub-second evidence. Reconcile invoice, settled payout offset,
bank deposit and original guest funds without double counting. Separate fictional transaction rates from
real FX, operational cost from disputed 'penalty', and elapsed time from staff labor. Count comparable
bookings and actual walks; cancellation churn is not a conflict rate or mathematical need to overbook.
Use the real public-policy check to correct unverified Clause 6/EUR 120 universal-fee assumptions; do not
authenticate a property agreement or infer automatic payout mechanics from unrelated payment provisions.
Explain exact supplied G1–G7 results and weighted dimensions; no gate waivers, invented score or favorable
repair. Distinguish proof of software concurrency risk from proof that LLM A2A prevents it. Compare:
- deterministic channel-specific allotment/exclusive last-room allocation/safety stock;
- transactional capacity checks, idempotency and reconciliation (deduplication alone does not solve two
  distinct valid reservations; a local lock does not atomically control independent OTA inventory);
- slower cross-role relocation/cost approval and guest communication after a conflict.
Separate prevention from recovery. OTA API availability, write permission, rate limits and end-to-end timing
are unverified. LLM agent coordination is not a substitute for measured low-latency synchronization. No
sleeping-human argument proves G7, and flat oversell percentages are not the strongest simple baseline.
Compare Candidates #1 and #2 using the attached reports only as separate synthetic rehearsals. TEST, do not
assume, the user's proposition that hedging passes G3/G4/G7. Define the current qualified core-engine verdict,
remaining physical/inventory/authority/evidence limits, strengths and next empirical/engineering checks.
No claim of a 'winning' entry is supported without real validation or hackathon judging evidence.
Use [D] for retrieved primary policy text, [O] for supplied observed tool/evaluator outputs, [I] for engineering
inferences and [U] for unestablished claims. All hotel incident material and its figures remain SYNTHETIC.
TRANSCRIPT:
""" + base.TRANSCRIPT.read_text() + '\nCASE:\n' + base.CASE.read_text() + '\nEVALUATION:\n' + (base.RUN / 'evaluation.json').read_text() + '\nQUESTION REVIEWS:\n' + json.dumps(self.state.get('question_reviews', [])) + '\nPUBLIC POLICY CHECK:\n' + (POLICY / 'policy_check.md').read_text() + '\nCOMPARISON #1:\n' + (ROOT / 'docs/turnaround_deadlock_evaluation.md').read_text() + '\nCOMPARISON #2:\n' + (ROOT / 'docs/mice_rfp_evaluation.md').read_text()
        response = super().call(role, purpose, prompt, instruction)
        if role == 'interviewer' and match:
            # Same interviewer session, no third role/model and no private dossier.
            # Preserve the original draft plus this review in the call logs.
            review = super().call(role, purpose + '-question-review', '''PRE-DELIVERY QUESTION REVIEW.
The prior spoken draft has NOT been delivered. Review it against the respondent's delivered answers already
in your session. Remove any leading premise, implied cause, assumed assignment, hypothetical, pitch or
unsupported fact. Do not introduce the researcher's expected problem. Reject stacked tasks and unsupported active-choice/knowledge premises. Prefer one short main question and,
only if essential, one tightly related evidence request. Shorten enumerations of times, roles and causes; normally at most 45 spoken words, except the opening consent. Consent/opening may have a short preamble.
Return ONLY JSON with exactly keys "question" (final spoken wording), "changed" (boolean),
and "reason" (concise review finding, not spoken). If already neutral retain its wording.
DRAFT:\n''' + response,
                base.COMMON + 'You are the same interviewer privately checking an undelivered question. Return the requested JSON only; do not use tools.')
            checked = base.parse_json(review)
            if set(checked) != {'question', 'changed', 'reason'} or not isinstance(checked['question'], str) or not checked['question'].strip() or type(checked['changed']) is not bool or not isinstance(checked['reason'], str):
                raise ValueError('Invalid question review; no unreviewed draft delivered')
            self.state.setdefault('question_reviews', []).append({'turn': int(match[1]), **checked})
            self.persist()
            response = checked['question'].strip()
        return response


    def synthesize(self):
        module = base.evaluator()
        prompt = '''SYNTHESIS: interview is finished. Return ONLY one JSON object conforming exactly to the supplied schema.
Extract ONLY what the respondent actually said in the delivered transcript; you do not have a hidden dossier.
case_id=CASE_OVERBOOKING_001; is_synthetic=true; room_count=28. Scenario interview_date=2026-09-23.
Make the event trace chronological, using offset +04:00. Keep uncertainty null and do not turn guest waiting into staff labor.
Cash leakage means actual paid/refunded cash, not waived revenue. Read the money statements carefully.
Artifacts are narrative records within this fiction: all locator and summary strings MUST explicitly include SYNTHETIC
and reference the transcript turn where supplied (e.g. SYNTHETIC transcript_overbooking_hedging.md Turn 04).
D/O and reviewed=true can mean inspected WITHIN THE FICTION only; explain this in every relevant artifact summary.
Do not invent an actual record, replay/benchmark, simple-rule superiority, integration, approval or trial.
Evidence not elicited remains null/empty; failed gates are an acceptable and expected result.
Scores are transparent reviewer assessments linked to delivered evidence, not hotel facts; assign 0–4 where justified,
or null if not assessable. Do not assign optimistic missing-evidence values to make the card pass.
You may identify a future engineering action as an inference in its rationale, but do not mark it tested or authorized.
Use only real role IDs within this fictional episode; count distinct actors/recipients actually appearing in trace.
incident_count counts affected opportunities once; frequency = count*30/inclusive observation days, or null if unknown.
Dates for the observation window must be closed by interview_date. All artifact/role/step references must resolve.
The engine may reject G5/G6/G7. Never fabricate engineering evidence to fix that.
ADDITIONAL OVERBOOKING RULES: root_cause_code=BOOKING_PROMISE. Include actual Front Desk/Night Auditor,
Revenue/GM and Channel Operations responsibilities only as supplied. External channels are not separate
hotel departments. Count traced actors/recipients consistently while noting external participants.
All required keys must exist. Missing values remain null, not zero. verified_cash_leakage_gel requires
actual settled deduction/payment and explicit fictional settlement conversion or direct GEL entry. Do not
invent real FX, sum unlike currencies, add an invoice again to its payout offset, or conflate original guest
funds/refunds with incremental relocation expense. Retain disputed/unverified legal basis separately.
Quoted fees and 'Clause 6' do not establish public policy; the retrieved public terms concern 2.6.1 and do
not establish a universal EUR 120 handling tariff. Never insert unseen public terms as episode evidence.
Only shown fictional records qualify as reviewed within the fiction; missing log boundaries stay unknown.
Distinguish booking acceptance, received notifications, update dispatch and acknowledgement/application.
90 seconds and two minutes do not establish sub-second guarantees. Monthly frequency is only the defined
30-day-equivalent count, never a forecast. Staff labor must be measured, not notification delay or guest wait.
Do not upgrade I/U evidence to D/O to force gates. No integration, cross-OTA lock, replay, safe write authority
or performance benchmark has been implemented merely because a log was narrated. A simple deterministic
allocation/buffer baseline may suffice; no A2A superiority is presumed. Give concise trace/artifact prose,
normally 12–16 consequential steps, preserving exact recorded versions and uncertainty.
SCHEMA:\n''' + (ROOT / 'schemas/case_card.json').read_text() + '\nDELIVERED TRANSCRIPT:\n' + base.TRANSCRIPT.read_text()
        instructions = base.COMMON + 'You are the interviewer, now synthesizing a conservative case card from the completed fictional interview. Output JSON only.'
        response = self.call('interviewer', 'case-synthesis', prompt, instructions)
        for attempt in range(4):
            try:
                card = base.parse_json(response)
                module.validator().validate(card)
                errors = module.semantic_errors(card)
                if card['case_id'] != 'CASE_OVERBOOKING_001' or card['root_cause_code'] != 'BOOKING_PROMISE':
                    errors.append('Require CASE_OVERBOOKING_001 and BOOKING_PROMISE')
                if not card['is_synthetic'] or card['room_count'] != 28:
                    errors.append('is_synthetic must be true and room_count must be 28')
                for artifact in card['supporting_artifacts']:
                    if 'SYNTHETIC' not in artifact['locator'] or 'SYNTHETIC' not in artifact['summary']:
                        errors.append('Every artifact locator and summary must explicitly say SYNTHETIC')
                if errors:
                    raise ValueError('; '.join(errors))
                base.save(base.CASE, card)
                return
            except Exception as error:
                if attempt == 3:
                    raise
                response = self.call('interviewer', f'case-schema-repair-{attempt+1}',
                                     'Repair only shape/reference/arithmetic problems; do not improve gate scores by inventing evidence.\nValidation error:\n' + str(error) + '\nReturn the complete corrected JSON.', instructions)


def write_report(state):
    data = json.loads((base.RUN / 'evaluation.json').read_text())
    card = json.loads(base.CASE.read_text())
    result = data['synthetic_exception_evaluation']
    diag = data['diagnostic_only']
    status = 'DOES NOT QUALIFY' if not result['accepted'] else 'PASSES SYNTHETIC CHECKS ONLY; REAL QUALIFICATION NOT ESTABLISHED'
    gates = '\n'.join(f"| {name} | {'PASS' if value['passed'] else 'FAIL'} | {'; '.join(value['reasons']) or 'Requirements satisfied within the synthetic qualification mode.'} |" for name, value in result['gates'].items())
    contributions = '\n'.join(f"| {name} | {weight} | {card['scores'][name]['rating'] if card['scores'][name]['rating'] is not None else 'unknown'} | {diag['contributions'][name] if diag['contributions'][name] is not None else 'unscored'} | {card['scores'][name]['rationale']} |" for name, weight in base.evaluator().WEIGHTS.items())
    reviews = '\n'.join(f"| {r['turn']:02} | {'Revised' if r['changed'] else 'Retained'} | {r['reason'].replace('|', '/')} |" for r in state.get('question_reviews', []))
    score = result['weighted_score']
    audit = (base.RUN / 'interviewer_audit.md').read_text()
    base.REPORT.write_text(f'''# Candidate #3: multi-channel overbooking and relocation-cost hedging

## Executive verdict

**{status} as the hackathon core engine on the evidence currently available.**
[O] The unchanged evaluator returned **{result['status']}** with synthetic provenance enabled.
Ordinary evaluation returned **{data['normal_evaluation']['status']}**. Formal weighted score:
**{str(score) + '/100' if score is not None else 'unavailable (null; incomplete eligibility is not a zero score)'}**.

**This is an executed synthetic discovery rehearsal, not empirical hotel validation.** All incident records,
quotes, quantities, commitments and personnel below are invented roleplay. [O] The execution and gate results
were actually observed locally. [I] Architecture interpretations are engineering judgments. [U] Real hotel
prevalence, recoverable revenue, causal effect and A2A superiority remain unestablished. D/O labels in the
synthetic case describe evidence within the fiction only; they never establish genuine operator records.

**Simulated incident:** {card['incident_summary']}

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
- [O] Interviewer session: `{state['sessions'].get('interviewer')}`.
- [O] Respondent session: `{state['sessions'].get('respondent')}`.
- [O] **12 Q/A exchanges**, **24 delivered speaker messages**, seven chronological stages.
- [O] **{len(state['calls'])} calls** including private preparation, pre-delivery reviews, synthesis and audit;
  cumulative subprocess time **{sum(c['elapsed_seconds'] for c in state['calls']):.1f} seconds**.
- Minute labels represent the simulated 40-minute agenda, not 40 elapsed minutes with a person.
- Separate sessions/directories, tools disabled/forbidden; the respondent dossier was not sent to the interviewer.
- [O] CLI `{state['codex_version']}`; {sum(c['model_catalog_warning'] for c in state['calls'])} calls recorded the known nonfatal
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
{gates}

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
{contributions}

[O] Diagnostic total if all ratings exist: **{diag['weighted_total_if_all_ratings_known'] if diag['weighted_total_if_all_ratings_known'] is not None else 'unavailable'}**.
Diagnostic mathematical bounds with unknown dimensions ranging from 0 to 4:
**{diag['unknown_rating_score_bounds'][0]}–{diag['unknown_rating_score_bounds'][1]} / 100**.
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
{reviews}

## Incident trace, G3/G7 analysis, risks and next evidence

[I] “Sub-second hedging” is a hypothesis, not a measured runtime result. The audit separates deterministic
inventory allocation and prevention from relocation recovery, and compares the two earlier rehearsals.
The [raw model audit](../research/cases/overbooking_001/interviewer_audit.md) is preserved verbatim.

{audit}

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
''')


base.write_report = write_report


def verify():
    state = json.loads((base.RUN / 'state.json').read_text())
    assert len(state['turns']) == 12
    assert set(state['sessions']) == {'interviewer', 'respondent'}
    assert len(set(state['sessions'].values())) == 2
    assert all(c['model_requested'] == base.MODEL and c['exit_code'] == 0 for c in state['calls'])
    for name, sha in state['input_hashes'].items():
        assert base.digest(ROOT / name) == sha, name
    policy_source = json.loads((POLICY / 'source.json').read_text())
    assert base.digest(POLICY / 'booking_general_terms.html') == policy_source['sha256']
    assert base.TRANSCRIPT.read_text() == transcript_text(state)
    assert all(not base.policy_flags(t['question']) for t in state['turns'])
    module = base.evaluator()
    card = module.load_json(base.CASE)
    module.validator().validate(card)
    assert not module.semantic_errors(card), module.semantic_errors(card)
    assert card['is_synthetic'] is True and card['room_count'] == 28
    assert module.evaluate(card)['accepted'] is False
    assert all('SYNTHETIC' in a['locator'] and 'SYNTHETIC' in a['summary'] for a in card['supporting_artifacts'])
    result = {'status': 'passed', 'model_requested': base.MODEL, 'isolated_sessions': 2,
              'exchanges': 12, 'speaker_messages': 24, 'schema_and_semantics_valid': True,
              'read_only_inputs_unchanged': True, 'synthetic_flag_preserved': True,
              'verbatim_transcript_matches_saved_dialogue': True,
              'lexical_policy_screen_passed': True, 'not_a_semantic_fidelity_guarantee': True}
    assert card['case_id'] == 'CASE_OVERBOOKING_001'
    assert card['root_cause_code'] == 'BOOKING_PROMISE'
    state = json.loads((base.RUN / 'state.json').read_text())
    synthesis_calls = [c for c in state['calls'] if c['role'] == 'interviewer' and
                       (c['purpose'] == 'case-synthesis' or c['purpose'].startswith('case-schema-repair-'))]
    assert synthesis_calls
    raw_case = base.parse_json((ROOT / synthesis_calls[-1]['directory'] / 'response.txt').read_text())
    assert card == raw_case, 'Case content must match the final interviewer synthesis'
    evaluation = json.loads((base.RUN / 'evaluation.json').read_text())
    assert evaluation['normal_evaluation'] == module.evaluate(card)
    assert evaluation['synthetic_exception_evaluation'] == module.evaluate(card, synthetic_test=True)
    assert {r['turn'] for r in state['question_reviews']} == set(range(1, 13))
    for call in state['calls']:
        assert call['command'][call['command'].index('--model') + 1] == base.MODEL
        for field in ('prompt', 'instructions', 'response'):
            assert base.digest(ROOT / call['directory'] / (field + '.txt')) == call[field + '_sha256']
    for turn in state['turns']:
        review = next(r for r in state['question_reviews'] if r['turn'] == turn['turn'])
        assert turn['question'] == review['question'].strip()
        review_call = next(c for c in state['calls'] if c['role'] == 'interviewer' and c['purpose'] == f"turn-{turn['turn']:02}-question-review")
        raw_review = base.parse_json((ROOT / review_call['directory'] / 'response.txt').read_text())
        assert raw_review == {k: review[k] for k in ('question', 'changed', 'reason')}
        answer = next(c for c in state['calls'] if c['role'] == 'respondent' and c['purpose'] == f"turn-{turn['turn']:02}")
        assert turn['answer'] == (ROOT / answer['directory'] / 'response.txt').read_text().strip()
    result.update({'case_id': card['case_id'], 'pre_delivery_reviewed_turns': 12,
                   'raw_responses_intact': True, 'prompts_and_instructions_intact': True,
                   'delivered_dialogue_matches_raw_outputs': True, 'commands_pin_requested_model': True,
                   'case_matches_interviewer_synthesis': True, 'saved_evaluations_match_recomputation': True})
    result['policy_snapshot_matches_source_fingerprint'] = True
    base.save(base.RUN / 'verification.json', result)
    print(json.dumps(result), flush=True)
    return result


base.verify = verify


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['run', 'evaluate', 'verify'])
    p.add_argument('--resume', action='store_true')
    p.add_argument('--timeout', type=int, default=420)
    args = p.parse_args()
    try:
        if args.command == 'run':
            OverbookingHarness(timeout=args.timeout, resume=args.resume).run()
        elif args.command == 'evaluate':
            value = base.evaluate_case()
            if value['synthetic_exception_evaluation']['status'] == 'invalid':
                return 2
        else:
            verify()
        return 0
    except Exception as error:
        print(f'OVERBOOKING STOPPED: {type(error).__name__}: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
