#!/usr/bin/env python3
"""Two isolated Codex role sessions, pinned to gpt-6-astra, with synthetic provenance.

Python 3.11+; codex CLI and jsonschema required. Commands:
  ./scripts/simulate_mom_test.py run [--resume] [--timeout 240]
  ./scripts/simulate_mom_test.py evaluate
  ./scripts/simulate_mom_test.py verify
The evaluator is imported read-only; only its synthetic-test exception is enabled.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parent.parent
MODEL = 'gpt-6-astra'
RUN = ROOT / 'research/cases/simulation_001'
TRANSCRIPT = ROOT / 'research/cases/interview_transcript_001.md'
CASE = ROOT / 'research/cases/case_simulated_001.json'
REPORT = ROOT / 'docs/mom_test_simulation_report.md'
READ_ONLY = ['docs/interview_toolkit.md', 'schemas/case_card.json',
             'scripts/evaluate_candidate.py', 'research/derived/market_findings.md']
STAGES = [
    ('Operating context', '0–5'),
    ('Last difficult episode', '5–8'), ('Last difficult episode', '8–12'),
    ('Artifact walkthrough', '12–15'), ('Artifact walkthrough', '15–18'), ('Artifact walkthrough', '18–20'),
    ('Frequency and loss', '20–24'), ('Frequency and loss', '24–27'),
    ('Past attempts and workarounds', '27–30'), ('Past attempts and workarounds', '30–33'),
    ('Counterexample and competing cause', '33–37'), ('Concrete next step', '37–40'),
]
COMMON = '''You are one isolated role in a FICTIONAL interview rehearsal. Follow only your assigned role.
Do not use tools, files, network, shell, or other agents. Everything needed is in the supplied messages.
No real guest/operator evidence or consent exists. Never claim real-world verification.
Return only the requested final response, without preamble, reasoning, tool calls, or status updates.
'''
INTERVIEWER = COMMON + '''Role: non-leading past-behavior customer-discovery interviewer.
During SPOKEN INTERVIEW responses, NEVER mention Smartstay, AI, software, automation, agents, or a proposed solution.
Never pitch, give advice, ask willingness to pay, or ask hypothetical/counterfactual questions (including "would you", "what if").
Use present/past factual questions and concrete requests to inspect the latest incident's records. Do not introduce a cause,
number, role name, or product unless the respondent already supplied it. Ask at most two closely related questions per turn.
Do not assume a failure or commitment. Permit "none" and "unknown". Ask for actual timestamps versus estimates,
role perspectives, cash versus waived revenue, counted exposure, staff rework versus waiting, and competing causes.
Follow the supplied field guide, except the stricter ban above overrides any hypothetical wording in that guide.
You will receive one scheduled protocol stage at a time. Reply only with the words you speak (max 130 words).
Only after an explicit SYNTHESIS/AUDIT instruction may you stop interviewing and produce analysis or JSON.
'''
RESPONDENT = COMMON + '''Role: pragmatic, overworked, protective general manager of a FICTIONAL 18-room
independent boutique/wine hotel in Telavi, Kakheti. It is 23 September 2026 in the scenario, harvest/Rtveli season.
USER-SPECIFIED FICTIONAL ASSUMPTIONS, NOT VERIFIED MARKET DATA: weekend occupancy 85%+, lower midweek;
seasonal staff churn with newly trained local/student workers; Cloudbeds PMS, staff WhatsApp, paper front-desk notebook.
Speak naturally and skeptically about generic technology. Do not use consultant or scoring-framework language.
Maintain the private dossier you prepared. Answer only the current question, revealing detail progressively.
When requested, you may narrate reading a fictional record, clearly identifying its kind and exact contents.
Do not fabricate a real file, actual interview, real consent, model deployment, completed experiment, or invoice authenticity.
In spoken roleplay do not repeat a simulation disclaimer every turn; the transcript header supplies it.
Never add facts to rescue an evaluator gate. Distinguish insufficient cleaning capacity from information/authority failures.
Protect your workers; acknowledge your own management decisions and uncertainty. Keep answers typically 100–280 words.
'''


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def evaluator():
    spec = importlib.util.spec_from_file_location('smartstay_readonly_evaluator', ROOT / 'scripts/evaluate_candidate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_json(text):
    # Preserve raw model text in the call log; accept only an entire JSON document or fenced document.
    stripped = text.strip()
    if stripped.startswith('```'):
        match = re.fullmatch(r'```(?:json)?\s*\n(.*?)\n```', stripped, re.S)
        if not match:
            raise ValueError('Malformed JSON fence')
        stripped = match.group(1)
    def reject(value):
        raise ValueError(f'Non-finite JSON value: {value}')
    return json.loads(stripped, object_pairs_hook=evaluator().no_duplicates, parse_constant=reject)


def policy_flags(text):
    patterns = {
        'pitch_or_forbidden_term': r'\b(Smartstay|AI|software|automat(?:e|ion|ed)|agents?|chatbots?)\b',
        'hypothetical': r'\b(would|what if|imagine|suppose|if we built|if you had)\b',
        'leading_confirmation': r"\b(don.t you agree|wouldn.t|isn.t it|surely|you must|obviously)\b",
    }
    return [name for name, pattern in patterns.items() if re.search(pattern, text, re.I)]


def transcript_text(state):
    header = '''# Simulated Mom Test interview 001

**SYNTHETIC ROLEPLAY — no real hotelier, guest records, observed losses, or consent.**
Both logical agents are pinned to `gpt-6-astra` in separate Codex sessions and working directories.
The respondent's private preparation was not supplied to the interviewer. Only delivered dialogue is below;
verbatim preparation, draft/retry outputs, prompts, events and execution metadata are retained in `simulation_001/calls/`.

**Timing:** 12 question–answer exchanges (24 speaker messages) allocated across the seven protocol stages.
Minute ranges represent the simulated 40-minute agenda, not measured human interview duration.
The 18-room property, 85%+ weekend occupancy, current tool stack, and all incident-level figures are fictional assumptions/details.

'''
    parts = [header]
    for turn in state['turns']:
        parts.append(f"## Turn {turn['turn']:02} — {turn['stage']} — simulated minutes {turn['minutes']}\n\n")
        parts.append('### Interviewer\n\n' + turn['question'] + '\n\n')
        parts.append('### Respondent\n\n' + turn['answer'] + '\n\n')
    return ''.join(parts)


class Harness:
    def __init__(self, timeout=240, resume=False):
        self.timeout = timeout
        RUN.mkdir(parents=True, exist_ok=True)
        self.state_path = RUN / 'state.json'
        if self.state_path.exists():
            if not resume:
                raise ValueError('Run state exists; use run --resume. No existing dialogue is silently overwritten.')
            self.state = json.loads(self.state_path.read_text())
            self.check_sources()
        else:
            self.state = {'model': MODEL, 'created_at_utc': datetime.now(timezone.utc).isoformat(),
                          'input_hashes': {name: digest(ROOT / name) for name in READ_ONLY},
                          'sessions': {}, 'turns': [], 'calls': [], 'pending_question': None}
            self.persist()
        self.cli = shutil.which('codex')
        if not self.cli:
            raise RuntimeError('codex not installed; no alternate model or fabricated conversation is allowed')
        version = subprocess.run([self.cli, '--version'], capture_output=True, text=True, check=True)
        self.state['codex_version'] = version.stdout.strip()
        self.persist()

    def check_sources(self):
        for name, sha in self.state['input_hashes'].items():
            if digest(ROOT / name) != sha:
                raise ValueError(f'Read-only input changed: {name}')

    def persist(self):
        save(self.state_path, self.state)
        if self.state['turns']:
            TRANSCRIPT.write_text(transcript_text(self.state))

    def call(self, role, purpose, prompt, instruction=None):
        self.check_sources()
        number = len(self.state['calls']) + 1
        call_dir = RUN / 'calls' / f'{number:03}-{role}-{purpose}'
        call_dir.mkdir(parents=True, exist_ok=True)
        workdir = RUN / 'agents' / role
        workdir.mkdir(parents=True, exist_ok=True)
        rules = instruction or (INTERVIEWER if role == 'interviewer' else RESPONDENT)
        (call_dir / 'instructions.txt').write_text(rules)
        (call_dir / 'prompt.txt').write_text(prompt)
        output = call_dir / 'response.txt'
        cmd = [self.cli, 'exec']
        if role in self.state['sessions']:
            cmd += ['resume', self.state['sessions'][role]]
        cmd += ['--model', MODEL, '--skip-git-repo-check', '--json',
                '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"',
                '-c', 'developer_instructions=' + json.dumps(rules),
                '--disable', 'shell_tool', '--disable', 'unified_exec',
                '--disable', 'apps', '--disable', 'browser_use', '--disable', 'computer_use',
                '--disable', 'multi_agent', '-o', str(output), '-']
        # No shell evaluation, no credentials in arguments, no alternate model retry.
        started = time.monotonic()
        print(f'Calling {role}: {purpose} (gpt-6-astra)', flush=True)
        try:
            result = subprocess.run(cmd, input=prompt, text=True, cwd=workdir,
                                    capture_output=True, timeout=self.timeout)
            stdout, stderr, code = result.stdout, result.stderr, result.returncode
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout.decode() if isinstance(error.stdout, bytes) else error.stdout or ''
            stderr = error.stderr.decode() if isinstance(error.stderr, bytes) else error.stderr or ''
            code = -1
        (call_dir / 'events.jsonl').write_text(stdout)
        (call_dir / 'stderr.log').write_text(stderr)
        events = []
        for line in stdout.splitlines():
            try:
                events.append(json.loads(line))
            except ValueError:
                continue
        threads = [e['thread_id'] for e in events if e.get('type') == 'thread.started']
        if threads:
            old = self.state['sessions'].get(role)
            if old and old != threads[-1]:
                raise ValueError(f'Unexpected session switch for {role}: {old} -> {threads[-1]}')
            self.state['sessions'][role] = threads[-1]
        record = {'number': number, 'role': role, 'purpose': purpose, 'model_requested': MODEL,
                  'session_id': self.state['sessions'].get(role), 'exit_code': code,
                  'elapsed_seconds': round(time.monotonic() - started, 3),
                  'directory': str(call_dir.relative_to(ROOT)),
                  'prompt_sha256': digest(call_dir / 'prompt.txt'),
                  'instructions_sha256': digest(call_dir / 'instructions.txt'),
                  'command': cmd, 'model_catalog_warning': 'failed to refresh available models' in stderr,
                  'usage': [e.get('usage') for e in events if e.get('type') == 'turn.completed']}
        self.state['calls'].append(record)
        self.persist()
        tool_items = [e for e in events if e.get('type') in {'item.started', 'item.completed'}
                      and e.get('item', {}).get('type') not in {None, 'agent_message', 'reasoning'}]
        if tool_items:
            raise RuntimeError(f'Role isolation violation: tool activity in {call_dir}; stopped.')
        if code or not output.exists() or not output.read_text().strip() or not any(e.get('type') == 'turn.completed' for e in events):
            raise RuntimeError(f'Codex call failed/unfinished ({code}); inspect {call_dir}. No fabricated fallback used.')
        record['response_sha256'] = digest(output)
        self.persist()
        print(f'Completed {role}: {purpose} in {record["elapsed_seconds"]}s', flush=True)
        return output.read_text().strip()

    def run(self):
        if 'private_dossier' not in self.state:
            prompt = '''PRIVATE PREPARATION, NOT SPOKEN DIALOGUE.
Create a stable fictional hotel incident dossier for the persona. Output JSON. Do NOT prepare questions.
Choose a specific September 2026 episode involving reception, housekeeping and management, with a nuanced
combination of real cleaning capacity and a possibly preventable promise/state-information mismatch.
Include: named-but-fictional roles; exact chronology and distinct verified-in-fiction vs estimated times;
readable fictional snippets from PMS, WhatsApp, notebook and folio; actual cash refund vs waived revenue;
non-overlapping staff rework minutes; a closed observation period with counted affected arrivals and total arrivals;
seasonal staffing context; a real past workaround and its observed limitations; a successful comparable day;
competing causes and limits of GM authority; a modest concrete follow-up if asked. Avoid a contrived perfect A2A winner.
No AI prototype, benchmark, deployment or authorized future trial exists. Do not fabricate one later.
This is entirely invented practice material. Do not reveal this dossier wholesale during the interview.
Market context supplied below is documented only at the source's stated population. Occupancy and tool-stack
assumptions come from the user's fictional persona, NOT these reports. Keep the distinction.

''' + (ROOT / 'research/derived/market_findings.md').read_text()
            response = self.call('respondent', 'private-preparation', prompt)
            # Preserve verbatim; no need to expose or parse hidden scenario into interviewer context.
            (RUN / 'respondent_private_dossier.txt').write_text(response)
            self.state['private_dossier'] = str((RUN / 'respondent_private_dossier.txt').relative_to(ROOT))
            self.persist()
        for index in range(len(self.state['turns']), len(STAGES)):
            stage, minutes = STAGES[index]
            if not self.state.get('pending_question'):
                prior = self.state['turns'][-1]['answer'] if self.state['turns'] else '(No prior answer.)'
                prompt = f'SPOKEN INTERVIEW. Exchange {index+1}/12. Stage: {stage}; simulated minutes {minutes}.\n'
                if not self.state['turns']:
                    prompt += 'Begin with concise note-taking consent and operating-context discovery. You do not know the private incident.\nFIELD GUIDE:\n' + (ROOT / 'docs/interview_toolkit.md').read_text()
                else:
                    prompt += 'The respondent just said, verbatim:\n' + prior
                prompt += '\nAsk the next neutral past/present factual question(s) for this stage. No solution, no hypothetical, no extra analysis.'
                question = self.call('interviewer', f'turn-{index+1:02}', prompt)
                for retry in range(2):
                    flags = policy_flags(question)
                    if not flags:
                        break
                    question = self.call('interviewer', f'turn-{index+1:02}-policy-repair-{retry+1}',
                                         f'UNDELIVERED DRAFT violated spoken policy: {flags}. Rewrite for the same stage, with no prohibited words or hypothetical/leading question. Only corrected spoken words.')
                if policy_flags(question):
                    raise ValueError('Interviewer policy violation persisted; not delivered to respondent.')
                self.state['pending_question'] = {'index': index, 'question': question}
                self.persist()
            question = self.state['pending_question']['question']
            answer = self.call('respondent', f'turn-{index+1:02}',
                               'SPOKEN INTERVIEW. The interviewer asks, verbatim:\n' + question +
                               '\nAnswer naturally from your private dossier and established dialogue. Do not invent missing evidence just to satisfy the question.')
            self.state['turns'].append({'turn': index+1, 'stage': stage, 'minutes': minutes,
                                        'question': question, 'answer': answer})
            self.state['pending_question'] = None
            self.persist()
        if not CASE.exists():
            self.synthesize()
        evaluate_case()
        if not (RUN / 'interviewer_audit.md').exists():
            audit_prompt = '''AUDIT: interview is finished. Produce Markdown analysis, not further spoken questions.
Evaluate your interviewer fidelity candidly. Cite turn numbers and verbatim short question fragments.
Identify leading premises, stacked questions, hypothetical/pitch violations, missed probes, money/time/denominator
ambiguity, capacity versus stale-information causes, and why the simple-rule baseline remains uncertain.
Do not label simulated artifact narratives as genuine evidence. Extract an event trace table from the case/transcript.
Explain G3/G4/G7 and the attached evaluator result. Do not force acceptance or create a fake final score.
Suggest concrete neutral replacement questions for the Human Director. All lessons are rehearsal lessons, not market validation.
TRANSCRIPT:\n''' + TRANSCRIPT.read_text() + '\nCASE:\n' + CASE.read_text() + '\nEVALUATION:\n' + (RUN / 'evaluation.json').read_text()
            audit = self.call('interviewer', 'post-interview-audit', audit_prompt,
                              COMMON + 'You are the same interviewer, now auditing the completed synthetic interview. Be candid and evidence-linked. Return Markdown only.')
            (RUN / 'interviewer_audit.md').write_text(audit)
        write_report(self.state)
        self.check_sources()
        verify()

    def synthesize(self):
        module = evaluator()
        prompt = '''SYNTHESIS: interview is finished. Return ONLY one JSON object conforming exactly to the supplied schema.
Extract ONLY what the respondent actually said in the delivered transcript; you do not have a hidden dossier.
case_id=CASE_SIMULATED_001; is_synthetic=true; room_count=18. Scenario interview_date=2026-09-23.
Make the event trace chronological, using offset +04:00. Keep uncertainty null and do not turn guest waiting into staff labor.
Cash leakage means actual paid/refunded cash, not waived revenue. Read the money statements carefully.
Artifacts are narrative records within this fiction: all locator and summary strings MUST explicitly include SYNTHETIC
and reference the transcript turn where supplied (e.g. SYNTHETIC interview_transcript_001.md Turn 04).
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
SCHEMA:\n''' + (ROOT / 'schemas/case_card.json').read_text() + '\nDELIVERED TRANSCRIPT:\n' + TRANSCRIPT.read_text()
        instructions = COMMON + 'You are the interviewer, now synthesizing a conservative case card from the completed fictional interview. Output JSON only.'
        response = self.call('interviewer', 'case-synthesis', prompt, instructions)
        for attempt in range(4):
            try:
                card = parse_json(response)
                module.validator().validate(card)
                errors = module.semantic_errors(card)
                if not card['is_synthetic'] or card['room_count'] != 18:
                    errors.append('is_synthetic must be true and room_count must be 18')
                for artifact in card['supporting_artifacts']:
                    if 'SYNTHETIC' not in artifact['locator'] or 'SYNTHETIC' not in artifact['summary']:
                        errors.append('Every artifact locator and summary must explicitly say SYNTHETIC')
                if errors:
                    raise ValueError('; '.join(errors))
                save(CASE, card)
                return
            except Exception as error:
                if attempt == 3:
                    raise
                response = self.call('interviewer', f'case-schema-repair-{attempt+1}',
                                     'Repair only shape/reference/arithmetic problems; do not improve gate scores by inventing evidence.\nValidation error:\n' + str(error) + '\nReturn the complete corrected JSON.', instructions)


def evaluate_case():
    module = evaluator()
    card = module.load_json(CASE)
    if card.get('is_synthetic') is not True:
        raise ValueError('Simulation evaluator refuses a case not explicitly marked synthetic')
    standard = module.evaluate(card)
    simulated = module.evaluate(card, synthetic_test=True)
    diagnostic = {name: weight * item['rating'] / 4 if item['rating'] is not None else None
                  for name, weight in module.WEIGHTS.items() for item in [card['scores'][name]]}
    known = sum(value for value in diagnostic.values() if value is not None)
    unknown_max = sum(module.WEIGHTS[name] for name, value in diagnostic.items() if value is None)
    output = {'normal_evaluation': standard, 'synthetic_exception_evaluation': simulated,
              'diagnostic_only': {'not_a_selection_score': True, 'contributions': diagnostic,
                                  'all_ratings_known': unknown_max == 0,
                                  'weighted_total_if_all_ratings_known': known if unknown_max == 0 else None,
                                  'unknown_rating_score_bounds': [known, known + unknown_max]},
              'explanation': 'Equivalent to allowing synthetic provenance only, using existing evaluate(card, synthetic_test=True). All G1–G7 checks and score eligibility remain unchanged. Diagnostic subtotal/bounds never override failed gates.'}
    save(RUN / 'evaluation.json', output)
    print(json.dumps({'synthetic_status': simulated['status'], 'selection_score': simulated['weighted_score'],
                      'diagnostic_only': output['diagnostic_only']}, ensure_ascii=False), flush=True)
    return output


def write_report(state):
    data = json.loads((RUN / 'evaluation.json').read_text())
    card = json.loads(CASE.read_text())
    result = data['synthetic_exception_evaluation']
    gates = '\n'.join(f"| {name} | {'PASS' if item['passed'] else 'FAIL'} | {'; '.join(item['reasons']) or 'Recorded requirements satisfied within the fiction.'} |" for name, item in result['gates'].items())
    scores = '\n'.join(f"| {name} | {weight} | {card['scores'][name]['rating'] if card['scores'][name]['rating'] is not None else 'unknown'} | {data['diagnostic_only']['contributions'][name] if data['diagnostic_only']['contributions'][name] is not None else 'unscored'} | {card['scores'][name]['rationale'] or 'No established basis.'} |" for name, weight in evaluator().WEIGHTS.items())
    flags = {str(t['turn']): policy_flags(t['question']) for t in state['turns']}
    total_seconds = sum(c['elapsed_seconds'] for c in state['calls'])
    warnings = sum(c['model_catalog_warning'] for c in state['calls'])
    diag = data['diagnostic_only']
    report = f'''# Mom Test simulation 001: execution and audit

**SYNTHETIC REHEARSAL.** This is an authentic record of model-to-model dialogue, not an authentic real-world hotel incident.
No hotel was interviewed and no guest record, payment, staff time, consent, or commitment was independently verified.
The private persona and all incident numbers are fictional. The user specified an 18-room hotel, 85%+ weekend occupancy,
Cloudbeds/WhatsApp/notebook workflow and seasonal churn; the harvested market findings support only broader
staffing/cost/reporting concerns and do not establish those property-specific assumptions.

## Execution and isolation

- Both agents requested **`{MODEL}`** on every call; no alternative model fallback. CLI: `{state['codex_version']}`.
- Interviewer session: `{state['sessions'].get('interviewer')}`; respondent session: `{state['sessions'].get('respondent')}`.
- Two separate working directories and role-specific developer instructions; tools disabled where configurable and forbidden in prompts.
- Only the respondent received the private dossier. The interviewer received the field guide and subsequently the respondent's delivered answers.
- **12 exchanges / 24 speaker messages**, covering seven stages; minute labels simulate the 40-minute agenda, not wall-clock duration.
- **{len(state['calls'])} completed/attempted role calls**, accumulated subprocess wall time **{total_seconds:.1f} seconds**.
- Nonfatal model-catalog parsing warnings occurred in **{warnings} calls**; outputs required exit zero and `turn.completed`.
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
{json.dumps(flags, indent=2)}
```

This lexical screen is not a proof that every question is non-leading. The substantive audit below examines premises,
stacked questions, narrowing, missed counterevidence, and what the respondent actually supplied. Rejected undelivered
question drafts, if any, are preserved in raw call logs and are not substituted into the delivered transcript.

## Incident and formal gate evaluation

**Case:** {card['incident_summary']}

**Root classification:** `{card['root_cause_code']}`. Cash leakage field: **{card['verified_cash_leakage_gel']} GEL**;
rework field: **{str(card['staff_rework_minutes']) + ' minutes' if card['staff_rework_minutes'] is not None else 'not verified'}**. These are values extracted from fictional testimony;
null means not established and must not be converted to zero. Distinct traced operational roles: **{card['a2a_suitability']['distinct_operational_roles']}**.

The ordinary evaluator result is **{data['normal_evaluation']['status']}**, preserving the synthetic-data rejection.
The equivalent synthetic-enabled call uses the existing read-only API:

```python
result = evaluate_candidate.evaluate(case_card, synthetic_test=True)
```

This enables only the existing synthetic provenance exception; it does not force a gate or supply missing evidence.
The resulting formal status is **{result['status']}**. Formal weighted selection score: **{result['weighted_score'] if result['weighted_score'] is not None else 'unavailable'}**
(`null`/`None` means scoring was not reached or eligible ratings are incomplete, not a zero score).

| Gate | Outcome | Evaluator explanation |
|---|---|---|
{gates}

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
{scores}

Diagnostic total if all ratings are known: **{str(diag['weighted_total_if_all_ratings_known']) + ' / 100' if diag['weighted_total_if_all_ratings_known'] is not None else 'unavailable (incomplete ratings)'}**.
With unknown ratings, the mathematical bounds are **{diag['unknown_rating_score_bounds'][0]}–{diag['unknown_rating_score_bounds'][1]} / 100**;
these are bounds, not imputed ratings, a predicted result, or authorization to proceed. Failed gates still reject.

## Interviewer agent's substantive audit and event trace

**Fidelity outcome:** The audit identifies a leading assignment premise in Turn 04 and overloaded questions.
The strict no-leading requirement was therefore not fully met in this recorded run, despite the lexical screen.
The original dialogue is retained verbatim, with neutral replacements below; it is not retrospectively rewritten.

{(RUN / 'interviewer_audit.md').read_text()}

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
'''
    REPORT.write_text(report)


def verify():
    state = json.loads((RUN / 'state.json').read_text())
    assert len(state['turns']) == 12
    assert len(set(state['sessions'].values())) == 2
    assert set(state['sessions']) == {'interviewer', 'respondent'}
    assert all(c['model_requested'] == MODEL and c['exit_code'] == 0 for c in state['calls'])
    for name, sha in state['input_hashes'].items():
        assert digest(ROOT / name) == sha, name
    assert TRANSCRIPT.read_text() == transcript_text(state)
    assert all(not policy_flags(t['question']) for t in state['turns'])
    module = evaluator()
    card = module.load_json(CASE)
    module.validator().validate(card)
    assert not module.semantic_errors(card), module.semantic_errors(card)
    assert card['is_synthetic'] is True and card['room_count'] == 18
    assert module.evaluate(card)['accepted'] is False
    assert all('SYNTHETIC' in a['locator'] and 'SYNTHETIC' in a['summary'] for a in card['supporting_artifacts'])
    result = {'status': 'passed', 'model_requested': MODEL, 'isolated_sessions': 2,
              'exchanges': 12, 'speaker_messages': 24, 'schema_and_semantics_valid': True,
              'read_only_inputs_unchanged': True, 'synthetic_flag_preserved': True,
              'verbatim_transcript_matches_saved_dialogue': True,
              'lexical_policy_screen_passed': True, 'not_a_semantic_fidelity_guarantee': True}
    save(RUN / 'verification.json', result)
    print(json.dumps(result), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['run', 'evaluate', 'verify'])
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--timeout', type=int, default=240)
    args = parser.parse_args()
    try:
        if args.command == 'run':
            Harness(timeout=args.timeout, resume=args.resume).run()
        elif args.command == 'evaluate':
            result = evaluate_case()
            if result['synthetic_exception_evaluation']['status'] == 'invalid':
                return 2
        else:
            verify()
        return 0
    except Exception as error:
        print(f'SIMULATION STOPPED: {type(error).__name__}: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
