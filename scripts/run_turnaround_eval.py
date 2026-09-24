#!/usr/bin/env python3
"""Turnaround discovery rehearsal: two isolated gpt-6-astra sessions.

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
spec = importlib.util.spec_from_file_location('turnaround_transport', ROOT / 'scripts/simulate_mom_test.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
# Configure the imported transport only in this process; preserve its source and
# the previous simulation's paths, state, dialogue and outputs on disk.
base.RUN = ROOT / 'research/cases/turnaround_001'
base.TRANSCRIPT = ROOT / 'research/cases/transcript_turnaround_deadlock.md'
base.CASE = ROOT / 'research/cases/case_turnaround_deadlock.json'
base.REPORT = ROOT / 'docs/turnaround_deadlock_evaluation.md'
base.READ_ONLY = [*base.READ_ONLY, 'scripts/simulate_mom_test.py']
base.INTERVIEWER += '''
Focus: what actually occurs between 11:00 and 15:00. The research topic does not
establish any failure: do not assume numerical cleaning, priority blindness,
missed messages, fear, profitability, or a need for dynamic queue reordering.
Ask ONE main question per turn, at most one narrowly related record request.
Never assume an owner or change exists: say "what, if anything" when needed.
Let the respondent supply room numbers, tools, promises, amounts and causes.
Silently check each question for an embedded answer or unsupported premise.
'''
base.RESPONDENT += '''
Specific fictional premise: the 11:00–15:00 turnaround window includes a paper
housekeeping sheet normally followed 101, 102, 103 in numerical order, unexpected
noon arrivals waiting in the courtyard, reception lacking dependable progress
visibility until someone physically checks, and declined late check-out requests
quoted in the $30–$50 range because next-arrival readiness is uncertain. These
are user-imposed scenario assumptions, not Georgian market facts or measured profit.
Include a specific occasion with compensation, but preserve real capacity limits,
uncertainty and occasions when the current simple process works. An uncollected
late-checkout quote is neither a cash loss nor profit; never invent an FX rate.
Speak only from your stable private dossier, revealing records when asked.
'''
FOCUS = [
    'Opening: request note-taking consent and invite a concise description of the manager\'s normal 11:00–15:00 responsibilities. No assumed problem.',
    'Invite the last specific occasion in that window worth reconstructing, including a normal occasion if no difficulty exists.',
    'Follow the episode chronology, including how the work order was actually chosen; use only details already supplied.',
    'Request the contemporaneous record that best shows what reception and housekeeping each knew when priorities were set.',
    'If late check-out was mentioned, trace the actual request, the decision and what information supported it; otherwise continue the participant\'s own episode.',
    'Inspect actual cleaning, inspection/release and guest handover timing, distinguishing progress visibility from physical room readiness.',
    'Reconcile paid/refunded cash against compensation and declined quotes already mentioned; no unsupported exchange-rate or profit assumptions.',
    'Ask for a closed-period count with the same eligible-opportunity denominator and record basis. Staff time can remain unknown if not elicited.',
    'Ask what, if anything, has actually changed in their working process; avoid presupposing a workaround or failure.',
    'Follow one actual use of the existing control, including result and effort; never demand that the simple method must have failed.',
    'Invite a comparable smooth occasion and its actual capacity differences, or what remains unknown; avoid asserting a coordination cause.',
    'Ask what concrete follow-up, if any, has been agreed and who authorizes the associated record use; no hypothetical trial, invented consent or product pitch.',
]
original_transcript = base.transcript_text


def transcript_text(state):
    text = original_transcript(state)
    text = text.replace('# Simulated Mom Test interview 001', '# Turnaround deadlock: synthetic Mom Test interview')
    text = text.replace('`simulation_001/calls/`', '`turnaround_001/calls/`')
    text = text.replace('The 18-room property, 85%+ weekend occupancy, current tool stack, and all incident-level figures are fictional assumptions/details.',
        'The 18-room hotel, numerical cleaning order, early arrivals, $30–$50 late-checkout quotes, tool stack and all incident figures are fictional scenario assumptions/details, not market observations.')
    return text


base.transcript_text = transcript_text


class TurnaroundHarness(base.Harness):
    def call(self, role, purpose, prompt, instruction=None):
        if purpose == 'private-preparation':
            prompt = '''PRIVATE PREPARATION FOR THE TURNAROUND SCENARIO. Output a stable fictional dossier as JSON.
Create one specific September 2026 episode at the 18-room Telavi hotel, concentrated between 11:00 and 15:00.
Use the requested numerical 101/102/103 cleaning sequence, an unexpected noon arrival, courtyard waiting,
front-desk progress uncertainty pending a physical check, an actual declined late-checkout request quoted
in USD within $30–$50, and a separate paid compensation refund in GEL. Do not equate quote to profit,
confirmed willingness to pay, lost collected cash, or GEL without a documented fictional transaction.
Give a consistent timeline, actual responsibilities, capacity/room-type constraints, and what was knowable
at each decision. Include readable fictional paper, PMS, message and cash/refund excerpts, only measured
staff rework if a plausible contemporaneous record exists (otherwise estimates), and a closed-window
count/cohort. Distinguish exact inspected-in-fiction timestamps from remembered ones.
Include one actually used simple control (paper prioritization or shared list/phone confirmation) and a
smooth counterexample. Do not predetermine a win for A2A: a correctly used simple rule can be sufficient.
No engineering prototype, controlled queue replay, API access test or future trial has occurred.
Prepare uncertainties and limits of authority; do not later invent evidence to rescue gates.
This dossier stays private to you. Reveal relevant parts progressively in answers, not a full evidence dump.
Market text below supplies broad context only, not evidence for this invented property or scenario.
\n''' + (ROOT / 'research/derived/market_findings.md').read_text()
        match = re.fullmatch(r'turn-(\d{2})', purpose)
        if role == 'interviewer' and match:
            turn = int(match[1])
            prompt += '\nNEUTRAL TOPIC GUIDE (not facts to assert):\n' + FOCUS[turn - 1]
        if purpose == 'case-synthesis':
            prompt = prompt.replace('CASE_SIMULATED_001', 'CASE_TURNAROUND_001')
            prompt = prompt.replace('interview_transcript_001.md', 'transcript_turnaround_deadlock.md')
            prompt += '''
ADDITIONAL RULES: root_cause_code=ARRIVAL_READINESS. All required schema keys must exist,
but unestablished values remain null, not invented numbers. Do not convert declined USD quotes to GEL
or treat them as verified cash leakage/profit. If only estimated staff time is supplied, leave its verified
field null. Mere descriptions of an exact timestamp are not inspected records: preserve the reported time
in time_note with occurred_at=null unless a fictional excerpt was actually supplied. Attribute actors only
where supplied. A static numerical route is not the strongest simple baseline: consider an updated shared
priority queue, readiness acknowledgement and explicit ownership; lack of their use is not proof of their
inadequacy. Rate transparent dimensions where transcript evidence warrants, leave others null. Do not
promote inferential artifacts to D/O merely to satisfy the evaluator's all-reference support checks.
'''
        if purpose == 'post-interview-audit':
            prompt += '''
REQUIRED REPORT FOCUS: Candidate #1, the 11:00–15:00 turnaround deadlock. Include a definitive
current qualification verdict as hackathon core engine (not a speculative business endorsement), operational
strengths and remaining risks. Explain numerical order versus FIFO versus a manually updated deadline/room-type
priority queue: numerical order is not necessarily FIFO. Compare dynamic queue reordering with both static
order and the stronger deterministic priority/acknowledgement control; never assume A2A superiority.
Do not claim a replay or physical capacity benefit was measured. Explain G3 and G7 separately. Distinguish
cash refunds from opportunity revenue and margins. Cite exact transcript turns for important quantities.
Account for the pre-delivery question reviews and audit the delivered questions, not rejected drafts.
Use [O] only for observed run/evaluator facts, [I] for engineering inference, [U] for unestablished claims;
all incident detail is explicitly synthetic. Give concrete next evidence needed before a real core-engine decision.
'''
        response = super().call(role, purpose, prompt, instruction)
        if role == 'interviewer' and match:
            # Same interviewer session, no third role/model and no private dossier.
            # Preserve the original draft plus this review in the call logs.
            review = super().call(role, purpose + '-question-review', '''PRE-DELIVERY QUESTION REVIEW.
The prior spoken draft has NOT been delivered. Review it against the respondent's delivered answers already
in your session. Remove any leading premise, implied cause, assumed assignment, hypothetical, pitch or
unsupported fact. Do not introduce the researcher's expected problem. Prefer one short main question and,
only if essential, one tightly related evidence request. Consent/opening may have a short preamble.
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
    # Copy-edit two prose glitches only; preserve the raw model audit and all
    # interview/case content, and disclose the report's editorial changes.
    audit = (base.RUN / 'interviewer_audit.md').read_text()
    audit = audit.replace('A2/115h? A2A coordination', 'A2A coordination')
    audit = audit.replace('a unusually careful', 'an unusually careful')
    base.REPORT.write_text(f'''# Candidate #1: the 11:00–15:00 turnaround deadlock

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

The 18-room setting, sequential 101/102/103 route, early guests in a courtyard and $30–$50 extension quotes
were imposed scenario premises. The harvested market report documents broader staffing/cost/information
concerns; it does not validate those premises. Rejected quotes are not collected cash, verified profits or GEL
amounts. No exchange-rate conversion or extrapolated annual savings is supplied.

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

[Verbatim transcript](../research/cases/transcript_turnaround_deadlock.md) ·
[Strict case card](../research/cases/case_turnaround_deadlock.json) ·
[Evaluation JSON](../research/cases/turnaround_001/evaluation.json) ·
[State, commands and input SHA-256 hashes](../research/cases/turnaround_001/state.json) ·
[Verification](../research/cases/turnaround_001/verification.json).
Raw prompts, drafts, reviews, responses, events and stderr are retained under `research/cases/turnaround_001/calls/`.

## G1–G7 exact evaluator audit

| Gate | Outcome | Unmodified evaluator explanation |
|---|---|---|
{gates}

[O] The read-only evaluator is called as `evaluate(card, synthetic_test=True)`; this is its existing synthetic
qualification exception, not a gate waiver. It still applies all other gates, evidence eligibility and threshold checks.
Its `supported()` requires **every** referenced artifact to be reviewed, D/O and an allowed kind. A mixed D/I
reference list can fail even with a fictional primary excerpt present. No artifact labels were upgraded to force a pass.

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

[I] The candidate title uses “deadlock” as a workflow label. A circular waiting condition has not been
demonstrated. The following audit has two minor prose corrections (an article and a malformed acronym);
the [raw model audit](../research/cases/turnaround_001/interviewer_audit.md) and delivered transcript are preserved.

{audit}

## Reproduce and verify

```bash
python3 scripts/run_turnaround_eval.py run          # authenticated fresh run; refuses existing state
python3 scripts/run_turnaround_eval.py run --resume # continue from persisted checkpoint
python3 scripts/run_turnaround_eval.py evaluate     # offline, existing synthetic exception
python3 scripts/run_turnaround_eval.py verify       # offline schema, semantics, hashes and transcript
```

The driver reuses the local transport in `scripts/simulate_mom_test.py`, fingerprinted alongside the four
read-only inputs. It neither changes that file nor overwrites the previous simulation. Python 3.11+,
`jsonschema` and authenticated `codex exec` access are required for a fresh run. No hardware/IoT is in scope.
The wrapper's zero exit status means execution/validation succeeded; the evaluation JSON's `accepted`
and `status` fields determine candidate qualification. A valid rejected case is a successful pipeline run.
''')


base.write_report = write_report


def verify():
    result = base.verify()
    card = base.evaluator().load_json(base.CASE)
    assert card['case_id'] == 'CASE_TURNAROUND_001'
    assert card['root_cause_code'] == 'ARRIVAL_READINESS'
    state = json.loads((base.RUN / 'state.json').read_text())
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
                   'delivered_dialogue_matches_raw_outputs': True, 'commands_pin_requested_model': True})
    base.save(base.RUN / 'verification.json', result)
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=['run', 'evaluate', 'verify'])
    p.add_argument('--resume', action='store_true')
    p.add_argument('--timeout', type=int, default=300)
    args = p.parse_args()
    try:
        if args.command == 'run':
            TurnaroundHarness(timeout=args.timeout, resume=args.resume).run()
            verify()
        elif args.command == 'evaluate':
            value = base.evaluate_case()
            if value['synthetic_exception_evaluation']['status'] == 'invalid':
                return 2
        else:
            verify()
        return 0
    except Exception as error:
        print(f'TURNAROUND STOPPED: {type(error).__name__}: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
