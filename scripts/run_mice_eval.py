#!/usr/bin/env python3
"""MICE RFP discovery rehearsal: two isolated gpt-6-astra sessions.

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
spec = importlib.util.spec_from_file_location('mice_transport', ROOT / 'scripts/simulate_mom_test.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
# Configure the imported transport only in this process; preserve its source and
# the previous simulation's paths, state, dialogue and outputs on disk.
base.RUN = ROOT / 'research/cases/mice_001'
base.TRANSCRIPT = ROOT / 'research/cases/transcript_mice_rfp.md'
base.CASE = ROOT / 'research/cases/case_mice_rfp.json'
base.REPORT = ROOT / 'docs/mice_rfp_evaluation.md'
base.READ_ONLY = [*base.READ_ONLY, 'scripts/simulate_mom_test.py',
                  'docs/turnaround_deadlock_evaluation.md']
base.INTERVIEWER += """
Focus on the handling of corporate/group requests for future stays and events.
The topic establishes no delay, loss, conflict or cause. Do not assume that someone
actively chose a default process, that a record proves what somebody knew, that a
client would have converted, or that several responsibilities require arbitration.
Ask ONE main question, normally at most 45 words. One closely related request to
see the record may accompany it. Do not stack a chronology, people, money and causes
in one question. Ask what happened or what a record contains, not what it proves.
Let the respondent supply names, dates, amounts, roles, processes and explanations.
Use 'what, if anything' where existence is unknown. No pitch or proposed intervention.
"""
base.RESPONDENT = base.COMMON + """Role: pragmatic commercial director/general manager of a
FICTIONAL 24-room independent boutique/wine hotel in Kakheti with meeting space,
a restaurant and cellar. Scenario interview date: 23 September 2026.
USER-IMPOSED FICTIONAL PREMISES, not established market facts: autumn/winter corporate
business contributes roughly 30–45% of off-season revenue; a bespoke request for
18 rooms, meeting space, two coffee breaks and a wine-tasting gala dinner requires
back-and-forth between Sales, Revenue/GM/owner authority and F&B/Chef. A specific
USD 8,000–15,000 potential inquiry went elsewhere before terms aligned on day 3.
A client-side account may cite delay, but a quote is not a guaranteed booking,
collected cash, profit or a proven delay-caused loss. Preserve competing causes.
Maintain your stable private dossier. Answer only the current question, typically
100–230 words, revealing details progressively. If asked, read exact fictional
record excerpts, explicitly distinguishing them from recollection and estimates.
Do not use evaluator language. Be protective of colleagues and skeptical of generic
technology. Acknowledge commercial authority, existing commitments and kitchen limits.
No real operator, guest, record or consent exists. Do not repeatedly disclaim in every
sentence: the transcript header explains provenance. Never invent integration,
benchmarks, replay results or trial authority to satisfy an interviewer or gate.
"""
FOCUS = [
    'Opening: request note-taking consent and ask about the participant responsibility for group enquiries. Do not presume problems or revenue dependence.',
    'Invite one recent actual corporate enquiry worth reconstructing, including a smooth case if no difficulty is recalled.',
    'Follow the next consequential event in that enquiry, using the respondent dates and roles. Establish receipt versus first acknowledgement versus usable proposal without assuming a delay.',
    'Inspect one record at the key cross-role handoff. Ask what each contributor requested or supplied only after they are identified; do not treat records as proof of mental knowledge.',
    'Trace the actual price, room inventory/displacement or banquet constraint discussed; ask which inputs were available at that decision. Never presume all participants had vetoes.',
    'Inspect the client outcome and its time/source: client evidence of choosing elsewhere versus the operator inference about why. Do not presume an otherwise guaranteed booking.',
    'Reconcile the reported deal value with actual paid/refunded/committed GEL and staff rework only where evidenced. Preserve quote, cash, costs, revenue and profit distinctions.',
    'Ask for a closed-period count of comparable requests and affected outcomes with a consistent denominator; count requests, not internal messages or versions.',
    'Ask what, if anything, has actually changed in the proposal/approval process. Permit that there was no previous remedy.',
    'Follow one actual use of the existing control and its result; do not insist that a shared worksheet, deadline or approval policy must have failed.',
    'Invite a comparable successful enquiry and what differed, including evidence for alternative reasons; avoid listing assumed causal answers.',
    'First invite correction of your concise reconstruction. Then ask what concrete next step, if any, the participant agrees to now; no product, hypothetical trial or inferred authority.',
]
original_transcript = base.transcript_text


def transcript_text(state):
    text = original_transcript(state)
    text = text.replace('# Simulated Mom Test interview 001', '# MICE corporate RFP: synthetic Mom Test interview')
    text = text.replace('`simulation_001/calls/`', '`mice_001/calls/`')
    text = text.replace('The 18-room property, 85%+ weekend occupancy, current tool stack, and all incident-level figures are fictional assumptions/details.',
        'The 24-room hotel, 30–45% off-season revenue share, USD 8,000–15,000 inquiry and all incident figures are fictional scenario assumptions/details, not market observations.')
    return text


base.transcript_text = transcript_text


class MiceHarness(base.Harness):
    def call(self, role, purpose, prompt, instruction=None):
        if purpose == 'private-preparation':
            prompt = """PRIVATE PREPARATION FOR THE MICE RFP SCENARIO. Output a stable fictional dossier as JSON.
Prepare a specific three-day September 2026 enquiry for a future autumn/winter corporate retreat at
this 24-room hotel. Requested package: 18 rooms, meeting room, two coffee breaks and wine gala dinner.
Potential gross inquiry value is USD 8,000–15,000, not guaranteed revenue or profit. Explain any claimed
30–45% off-season corporate share as an explicitly fictional scenario estimate or scoped historical record,
never a statistic about Kakheti. Choose dates before the 23 September interview for request/decision events.
Show realistic distinct Sales conversion, Revenue/GM displacement/discount and F&B staffing/menu/margin
constraints. Include actual exchanged options, versions and authority limits; not merely three approval clicks.
Preserve capacity constraints, forecasts versus actual bookings, uncertainty in displaced transient demand,
taxes/inclusions and gross value versus contribution. Do not invent an FX conversion.
Use a client message indicating they booked elsewhere before the day-3 offer; do not guarantee they would
have booked here if faster. Delay can contribute without being the sole proven cause. Distinguish a real
48-hour client deadline from a slogan or later inference, and 24–72h anecdotes from a counted cohort.
Include readable fictional RFP/email/thread, dated inventory/displacement or costing excerpt, proposal versions,
client response, any actual cash/cost/rework record (otherwise unknown/estimated), a closed-window request
cohort, one actually used simple control and a comparable success. Make no engineering benchmark or
future trial exist. A sound rate/package worksheet with preapproved bounds and clear response ownership
could be sufficient; do not rig the scenario to establish A2A superiority. Keep the dossier under 2500 words.
Reveal only relevant information in subsequent answers. All details are invented rehearsal material.
The market corpus below supplies broad context only and does not establish corporate revenue share,
RFP response times, conversions or displacement economics for this fictional property.

""" + (ROOT / 'research/derived/market_findings.md').read_text()
        match = re.fullmatch(r'turn-(\d{2})', purpose)
        if role == 'interviewer' and match:
            turn = int(match[1])
            prompt += '\nNEUTRAL TOPIC GUIDE (not facts to assert):\n' + FOCUS[turn - 1]
        if purpose == 'post-interview-audit':
            prompt = """AUDIT. The interview is over. Produce a candid, evidence-linked Markdown report,
not further dialogue. Audit the delivered questions for leading assumptions, stacked requests, hypothetical
or pitch violations and missed independent-role corroboration. The pre-delivery self-review is not a guarantee.
Extract the event trace with turn citations, exact versus reported times, offer versions and each role's
constraints. Distinguish request acknowledgement, usable offer, client deadline and later decision disclosure.
Check quote value, cash, profit, displaced revenue, avoided costs and labor separately. No invented exchange
rate, conversion probability or claim that 100% of the prospective sale was recoverable.
Explain exact G1–G7 outcomes and scores supplied below; unknown ratings and rejected gates remain so.
Discuss G3: actual coupled commitments/constraints versus sequential sign-offs; G4: permissible informational
or proposal action versus kitchen/room capacity; G7: why a versioned shared costing/displacement worksheet,
preapproved rate/menu bounds, explicit owner, parallel approval and deadline escalation may suffice.
No tested superiority is assumed. A2A is a hypothesis, not established by naming agents after departments.
Compare Candidate #2 with the attached Candidate #1 report, which is a separate synthetic rehearsal, not
independent hotel evidence. Test the user's proposition that MICE overcomes the physical/simple-rule trap;
state where it is more promising and where room, banquet, staffing, decision authority and simple controls
still bind. Give a definitive current core-engine qualification verdict and specific next evidence required.
Include operational strengths, remaining risks and neutral replacement questions for the Human Director.
Use [O] only for observed execution/evaluator facts, [I] for engineering inferences and [U] for unestablished
claims; all hotel incident material is SYNTHETIC. Keep analysis focused, under 2500 words.
TRANSCRIPT:
""" + base.TRANSCRIPT.read_text() + '\nCASE:\n' + base.CASE.read_text() + '\nEVALUATION:\n' + (base.RUN / 'evaluation.json').read_text() + '\nPRE-DELIVERY REVIEWS:\n' + json.dumps(self.state.get('question_reviews', [])) + '\nCANDIDATE #1 COMPARISON (read-only):\n' + (ROOT / 'docs/turnaround_deadlock_evaluation.md').read_text()
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
case_id=CASE_MICE_001; is_synthetic=true; room_count=24. Scenario interview_date=2026-09-23.
Make the event trace chronological, using offset +04:00. Keep uncertainty null and do not turn guest waiting into staff labor.
Cash leakage means actual paid/refunded cash, not waived revenue. Read the money statements carefully.
Artifacts are narrative records within this fiction: all locator and summary strings MUST explicitly include SYNTHETIC
and reference the transcript turn where supplied (e.g. SYNTHETIC transcript_mice_rfp.md Turn 04).
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
ADDITIONAL MICE RULES: root_cause_code=SERVICE_DEPENDENCY. Include Sales, Revenue/GM and F&B/Chef only
as actual responsibilities supplied in dialogue; do not invent authority or assign a record author not identified.
All required fields must be present. Missing quantities remain null, not zero. A prospective USD quote is not
verified_cash_leakage_gel; zero needs an explicit supporting fictional cash/ledger record too. Staff rework
must be measured, not elapsed approval latency. Monthly frequency is only a 30-day-equivalent normalization.
Keep claimed corporate revenue share scoped and synthetic; record forecasts/displacement as estimates.
Only supplied fictional excerpts qualify as inspected within-fiction records. A described timestamp without
its record has occurred_at=null and a time_note; estimates are not exact clock observations.
Do not label inferred references D/O just to clear all-reference evidence checks. 'Tested' must distinguish
ordinary use from an actual benchmark. Do not invent code, replay cases, estimates, permissions or integrations.
Use a concise trace (normally 12–16 consequential steps) and concise artifact summaries, preserving pivotal
versions, timestamps and uncertainties. A complete schema does not require repetitive prose.
SCHEMA:\n''' + (ROOT / 'schemas/case_card.json').read_text() + '\nDELIVERED TRANSCRIPT:\n' + base.TRANSCRIPT.read_text()
        instructions = base.COMMON + 'You are the interviewer, now synthesizing a conservative case card from the completed fictional interview. Output JSON only.'
        response = self.call('interviewer', 'case-synthesis', prompt, instructions)
        for attempt in range(4):
            try:
                card = base.parse_json(response)
                module.validator().validate(card)
                errors = module.semantic_errors(card)
                if card['case_id'] != 'CASE_MICE_001' or card['root_cause_code'] != 'SERVICE_DEPENDENCY':
                    errors.append('Require CASE_MICE_001 and SERVICE_DEPENDENCY')
                if not card['is_synthetic'] or card['room_count'] != 24:
                    errors.append('is_synthetic must be true and room_count must be 24')
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
    base.REPORT.write_text(f'''# Candidate #2: MICE RFP multi-role arbitration

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

The 24-room hotel, 30–45% off-season corporate revenue share, bespoke 18-room package and USD
8,000–15,000 prospective deal were imposed fictional premises. The [market corpus](../research/derived/market_findings.md)
does not establish these shares, response-time distributions or conversion losses. A potential booking is
not collected cash or profit; no assumed exchange rate, guaranteed conversion or annual savings is supplied.

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

[Verbatim transcript](../research/cases/transcript_mice_rfp.md) ·
[Strict case card](../research/cases/case_mice_rfp.json) ·
[Evaluation JSON](../research/cases/mice_001/evaluation.json) ·
[State, commands and input SHA-256 hashes](../research/cases/mice_001/state.json) ·
[Verification](../research/cases/mice_001/verification.json).
Raw prompts, drafts, reviews, responses, events and stderr are retained under `research/cases/mice_001/calls/`.

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

| Turn | Review action | Review reason |
|---|---|---|
{reviews}

## Incident trace, G3/G7 analysis, risks and next evidence

[I] “48-hour leakage” is the candidate's hypothesis, not a measured market statistic. The audit distinguishes
actual request/offer times and client deadlines from that label, then compares the separate Candidate #1 rehearsal.
The [raw model audit](../research/cases/mice_001/interviewer_audit.md) is preserved verbatim.

{audit}

## Reproduce and verify

```bash
python3 scripts/run_mice_eval.py run          # authenticated fresh run; refuses existing state
python3 scripts/run_mice_eval.py run --resume # continue from persisted checkpoint
python3 scripts/run_mice_eval.py evaluate     # offline, existing synthetic exception
python3 scripts/run_mice_eval.py verify       # offline schema, semantics, hashes and transcript
```

The driver reuses the local transport in `scripts/simulate_mom_test.py`, fingerprinted alongside the four
read-only inputs and the Candidate #1 comparison report. It neither changes that file nor overwrites the previous simulation. Python 3.11+,
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
    assert base.TRANSCRIPT.read_text() == transcript_text(state)
    assert all(not base.policy_flags(t['question']) for t in state['turns'])
    module = base.evaluator()
    card = module.load_json(base.CASE)
    module.validator().validate(card)
    assert not module.semantic_errors(card), module.semantic_errors(card)
    assert card['is_synthetic'] is True and card['room_count'] == 24
    assert module.evaluate(card)['accepted'] is False
    assert all('SYNTHETIC' in a['locator'] and 'SYNTHETIC' in a['summary'] for a in card['supporting_artifacts'])
    result = {'status': 'passed', 'model_requested': base.MODEL, 'isolated_sessions': 2,
              'exchanges': 12, 'speaker_messages': 24, 'schema_and_semantics_valid': True,
              'read_only_inputs_unchanged': True, 'synthetic_flag_preserved': True,
              'verbatim_transcript_matches_saved_dialogue': True,
              'lexical_policy_screen_passed': True, 'not_a_semantic_fidelity_guarantee': True}
    assert card['case_id'] == 'CASE_MICE_001'
    assert card['root_cause_code'] == 'SERVICE_DEPENDENCY'
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
            MiceHarness(timeout=args.timeout, resume=args.resume).run()
        elif args.command == 'evaluate':
            value = base.evaluate_case()
            if value['synthetic_exception_evaluation']['status'] == 'invalid':
                return 2
        else:
            verify()
        return 0
    except Exception as error:
        print(f'MICE STOPPED: {type(error).__name__}: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
