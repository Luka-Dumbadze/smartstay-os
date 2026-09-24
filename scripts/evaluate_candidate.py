#!/usr/bin/env python3
"""Offline case-card validation and G1–G7/weighted selection. Requires jsonschema.

Usage: evaluate_candidate.py evaluate case.json | --self-test | --template
Exit codes: 0 accepted/test success; 1 rejected/test failure; 2 input/config error.
This checks recorded evidence and reviewer assessments, not their authenticity.
"""
from __future__ import annotations

import argparse
from copy import deepcopy
from datetime import date, datetime
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError

SCHEMA_PATH = Path(__file__).resolve().parent.parent / 'schemas' / 'case_card.json'
WEIGHTS = {'severity': 20, 'a2a_fit': 20, 'feasibility': 15, 'evidence': 15,
           'frequency': 15, 'preventable_share': 10, 'adoption': 5}
CORE = ('severity', 'a2a_fit', 'feasibility', 'evidence')
PRIMARY = {'operator_record', 'direct_observation'}
ALL_LOCAL = PRIMARY | {'operator_confirmation', 'baseline_test', 'replay_case',
                       'access_record', 'commitment_record'}


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Duplicate JSON key: {key}')
        result[key] = value
    return result


def load_json(path):
    def reject_constant(value):
        raise ValueError(f'Non-finite JSON number: {value}')
    value = json.loads(Path(path).read_text(encoding='utf-8'),
                       object_pairs_hook=no_duplicates, parse_constant=reject_constant)
    return value


def validator():
    schema = load_json(SCHEMA_PATH)
    # The checked-in schema is entirely local; prohibit accidental remote resolution.
    def local_refs(node):
        if isinstance(node, dict):
            if '$ref' in node and not node['$ref'].startswith('#/'):
                raise ValueError('Schema must contain only local $ref values')
            for value in node.values():
                local_refs(value)
        elif isinstance(node, list):
            for value in node:
                local_refs(value)
    local_refs(schema)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def semantic_errors(card):
    """Cross-field checks JSON Schema cannot express; never trust declared counts."""
    errors = []
    roles = [r['role_id'] for r in card['roles']]
    artifacts = [a['artifact_id'] for a in card['supporting_artifacts']]
    steps = [s['step_id'] for s in card['trace']]
    for label, values in [('role', roles), ('artifact', artifacts), ('step', steps)]:
        if len(set(values)) != len(values):
            errors.append(f'Duplicate {label} ID')
    role_set, artifact_set, step_set = set(roles), set(artifacts), set(steps)

    def walk(node, path='$'):
        if isinstance(node, dict):
            for key, value in node.items():
                child = f'{path}.{key}'
                if key in {'artifact_refs', 'replay_case_refs', 'cash', 'rework', 'frequency'} and isinstance(value, list):
                    for item in value:
                        if item not in artifact_set:
                            errors.append(f'{child}: unknown artifact {item}')
                if key in {'actor_role_id', 'recipient_role_id', 'confirmation_role_id',
                           'trial_approver_role_id', 'from_role_id', 'to_role_id', 'interviewee_role'}:
                    if value is not None and value not in role_set:
                        errors.append(f'{child}: unknown role {value}')
                if key in {'from_step_id', 'to_step_id'} and value not in step_set:
                    errors.append(f'{child}: unknown step {value}')
                if key == 'step_ids':
                    for item in value:
                        if item not in step_set:
                            errors.append(f'{child}: unknown step {item}')
                walk(value, child)
        elif isinstance(node, list):
            for i, item in enumerate(node):
                walk(item, f'{path}[{i}]')
        elif isinstance(node, (float, int)) and not isinstance(node, bool):
            if not math.isfinite(node):
                errors.append(f'{path}: number must be finite')
    walk(card)
    interview = date.fromisoformat(card['interview_date']) if card['interview_date'] else None
    for name in ('incident_date_range', 'observation_window'):
        period = card[name]
        if period:
            start, end = date.fromisoformat(period['start']), date.fromisoformat(period['end'])
            if start > end:
                errors.append(f'{name}: start must not follow end')
            if interview and end > interview:
                errors.append(f'{name}: must be closed by interview_date')
    if [s['sequence'] for s in card['trace']] != list(range(1, len(steps) + 1)):
        errors.append('trace: sequence must be consecutive chronological positions starting at 1')
    previous = None
    used = set()
    for step in card['trace']:
        used.add(step['actor_role_id'])
        if step['recipient_role_id']:
            used.add(step['recipient_role_id'])
        stamp = step['occurred_at']
        if step['time_basis'] == 'timestamp' and stamp is None:
            errors.append(f"{step['step_id']}: timestamp basis requires occurred_at")
        if step['time_basis'] != 'timestamp' and stamp is not None:
            errors.append(f"{step['step_id']}: estimate/unknown must keep occurred_at null; use time_note")
        if step['time_basis'] == 'estimate' and not step['time_note']:
            errors.append(f"{step['step_id']}: estimated time needs its uncertainty in time_note")
        parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00')) if stamp else None
        if parsed:
            if previous and parsed < previous:
                errors.append('trace: known timestamps are not chronological')
            previous = parsed
            period = card['incident_date_range']
            if period and not period['start'] <= parsed.date().isoformat() <= period['end']:
                errors.append(f"{step['step_id']}: timestamp outside incident_date_range")
        for name in ('acknowledged_at', 'completed_at'):
            value = step[name]
            if parsed and value and datetime.fromisoformat(value.replace('Z', '+00:00')) < parsed:
                errors.append(f"{step['step_id']}: {name} precedes event")
    if card['a2a_suitability']['distinct_operational_roles'] != len(used):
        errors.append('a2a_suitability.distinct_operational_roles must equal unique roles actually in trace')
    step_map = {s['step_id']: s for s in card['trace']}
    for dependency in card['a2a_suitability']['dependencies']:
        a, b = dependency['from_step_id'], dependency['to_step_id']
        if a in step_map and b in step_map:
            if step_map[a]['sequence'] >= step_map[b]['sequence']:
                errors.append('Dependency must point to a later trace step')
            for key, step_id in [('from_role_id', a), ('to_role_id', b)]:
                if dependency[key] not in {step_map[step_id]['actor_role_id'], step_map[step_id]['recipient_role_id']}:
                    errors.append(f'Dependency {key} does not participate in its referenced step')
    count, opportunities = card['incident_count'], card['eligible_opportunities']
    if count is not None and opportunities is not None and count > opportunities:
        errors.append('incident_count must count affected opportunities once, not exceed eligible_opportunities')
    frequency = card['observed_frequency_per_month']
    if frequency is not None:
        window = card['observation_window']
        if count is None or not window:
            errors.append('observed_frequency_per_month requires incident_count and observation_window')
        else:
            days = (date.fromisoformat(window['end']) - date.fromisoformat(window['start'])).days + 1
            if days <= 0 or not math.isclose(frequency, count * 30 / days, rel_tol=1e-8, abs_tol=1e-8):
                errors.append('observed_frequency_per_month must equal incident_count * 30 / inclusive window days')
    return errors


def evaluate(card, *, synthetic_test=False):
    result = {'case_id': card.get('case_id') if isinstance(card, dict) else None,
              'status': 'invalid', 'accepted': False, 'errors': [], 'gates': {},
              'weighted_score': None, 'contributions': {}, 'selection_reasons': [],
              'synthetic_test': synthetic_test,
              'qualification': 'Internal screening of recorded evidence; not verified truth or an official GITA result.'}
    errors = sorted(validator().iter_errors(card), key=lambda e: str(list(e.absolute_path)))
    if errors:
        result['errors'] = [f"$/{'/'.join(map(str, e.absolute_path))}: {e.message}" for e in errors]
        return result
    errors = semantic_errors(card)
    if errors:
        result['errors'] = errors
        return result
    result['status'] = 'rejected'
    artifacts = {a['artifact_id']: a for a in card['supporting_artifacts']}

    def supported(refs, kinds=ALL_LOCAL):
        return bool(refs) and all(artifacts[r]['reviewed'] and
                                 artifacts[r]['evidence_label'] in {'D', 'O'} and
                                 artifacts[r]['kind'] in kinds for r in refs)

    def has_kind(refs, kinds):
        return supported(refs) and any(artifacts[r]['kind'] in kinds for r in refs)

    def gate(name, checks):
        reasons = [reason for passed, reason in checks if not passed]
        result['gates'][name] = {'passed': not reasons, 'reasons': reasons}

    e, a = card['gate_evidence'], card['a2a_suitability']
    real = e['real_problem']
    gate('G1', [
        (not card['is_synthetic'] or synthetic_test, 'Synthetic cases cannot establish a real problem outside --self-test.'),
        (card['interview_date'] is not None and card['incident_date_range'] is not None,
         'A dated operator interview and incident range are required.'),
        (card['interviewee_role'] is not None and bool(card['incident_summary']), 'Identify the interviewee role and actual episode.'),
        (real['recent_episode_confirmed'] is True and bool(real['recency_rationale']), 'Recency is unknown or lacks an explicit reviewer basis; no invented automatic day cutoff.'),
        (real['operator_confirmed_consequence'] is True and real['confirmation_role_id'] is not None and bool(real['consequence']), 'A relevant role must confirm a concrete consequence.'),
        (has_kind(real['artifact_refs'], PRIMARY), 'Need reviewed operator record/direct observation; press or analyst opinion alone is insufficient.'),
        (has_kind(real['artifact_refs'], {'operator_confirmation', 'direct_observation'}), 'Need a recorded consequence confirmation or direct observation.'),
        (bool(card['trace']) and all(supported(s['artifact_refs'], PRIMARY | {'operator_confirmation'}) for s in card['trace']), 'Every trace step needs reviewed primary episode evidence.'),
    ])
    window = card['observation_window']
    count, opportunities = card['incident_count'], card['eligible_opportunities']
    quantified = (window is not None and count is not None and count >= 1 and
                  opportunities is not None and opportunities >= 1 and bool(card['opportunity_unit']) and
                  supported(card['quantification_artifacts']['frequency'], PRIMARY))
    material = e['materiality']
    serious = (material['operator_confirmed'] is True and bool(material['rationale']) and
               supported(material['artifact_refs'], PRIMARY | {'operator_confirmation'}))
    amounts_verified = all(value is None or supported(card['quantification_artifacts'][key], PRIMARY)
                           for value, key in [(card['verified_cash_leakage_gel'], 'cash'),
                                              (card['staff_rework_minutes'], 'rework')])
    gate('G2', [
        (quantified, 'Need a closed observation period, counted incidents, positive eligible-opportunity denominator, unit, and primary evidence.'),
        ((count is not None and count >= 2) or serious, 'Need repeated incidents or an operator-confirmed sufficiently serious consequence with evidence.'),
        (amounts_verified, 'Non-null verified cash/rework values require reviewed primary measurement artifacts, including a claimed zero.'),
    ])
    mechanism = card['handover_failure_mechanism']
    dependencies_ok = bool(a['dependencies']) and all(
        d['from_role_id'] != d['to_role_id'] and d['asynchronous'] is True and
        supported(d['artifact_refs'], PRIMARY) for d in a['dependencies'])
    gate('G3', [
        (a['distinct_operational_roles'] >= 2, 'Need at least two distinct operational responsibilities actually represented in the trace.'),
        (a['asynchronous_state_dependencies'] is True and dependencies_ok, 'Need evidenced asynchronous cross-role state/constraint dependencies, not an asserted flag alone.'),
        (a['single_database_crud'] is False, 'Single-database CRUD or an unknown CRUD assessment does not establish A2A fit.'),
        (bool(mechanism['summary']) and len(mechanism['step_ids']) >= 2 and supported(mechanism['artifact_refs'], PRIMARY), 'Identify the consequential negotiation/ownership/acknowledgement failure and its trace steps.'),
    ])
    software = e['software_leverage']
    gate('G4', [
        (card['root_cause_code'] != 'OUTSIDE_SOFTWARE_SCOPE', 'Root-cause taxonomy excludes this case from the software intervention scope.'),
        (software['software_only'] is True and software['binding_constraint'] in {'coordination', 'software_data'}, 'Binding physical/hardware, labor-economics, external-demand, or unknown constraint cannot pass as software leverage.'),
        (bool(software['permitted_action']) and bool(software['available_information']) and supported(software['artifact_refs'], PRIMARY | {'access_record'}), 'Specify an evidenced permitted software action and the information available to change the failure path.'),
    ])
    access = e['access_authority']
    gate('G5', [
        (access['inputs_available'] is True and supported(access['artifact_refs'], PRIMARY | {'access_record'}), 'Need available/redacted inputs and reviewed access evidence.'),
        (access['adapter_mode'] in {'verified_connector', 'redacted_import', 'honest_simulator'} and bool(access['adapter_description']), 'Need a usable adapter/import or explicitly honest simulator; assumed integration is insufficient.'),
        (bool(access['write_limits']) and access['trial_approver_role_id'] is not None and access['authority_confirmed'] is True and has_kind(access['artifact_refs'], {'access_record'}), 'Need explicit write limits and evidenced authority of a role able to approve trial actions.'),
    ])
    feasible = e['feasibility']
    gate('G6', [
        (feasible['estimated_hours'] is not None and feasible['estimated_hours'] <= 115, 'Need an explicit bounded estimate within 115 hours.'),
        (all(feasible[k] for k in ['bounded_workflow', 'deterministic_oracle', 'baseline_comparison', 'failure_recovery_test']), 'Need an end-to-end boundary, deterministic state oracle, baseline comparison, and recovery test.'),
        (supported(feasible['replay_case_refs'], {'replay_case'}), 'Need available reviewed replay-case artifacts.'),
        (supported(feasible['artifact_refs'], PRIMARY | {'baseline_test', 'replay_case', 'access_record'}), 'Feasibility needs supporting artifacts, not only an optimistic estimate.'),
    ])
    simple = e['simple_rule']
    gate('G7', [
        (simple['tested'] is True and simple['simple_rule_sufficient'] is False, 'A simple rule/task-list baseline must be tested and shown insufficient; unknown or sufficient fails.'),
        (bool(simple['baseline_description']) and bool(simple['observed_failure']) and bool(a['simple_rule_inadequacy_rationale']), 'Describe the tested simple control, its observed failure, and why dependency negotiation/adaptation matters.'),
        (supported(simple['artifact_refs'], {'baseline_test'}), 'Need reviewed evidence of the baseline comparison.'),
    ])
    if not all(g['passed'] for g in result['gates'].values()):
        result['selection_reasons'] = ['Rejected before scoring: ' + ', '.join(k for k, g in result['gates'].items() if not g['passed'])]
        return result
    if not card['reviewer']:
        result['selection_reasons'].append('Named/pseudonymous reviewer is missing.')
    for name, rating in card['scores'].items():
        if rating['rating'] is None:
            result['selection_reasons'].append(f'{name}: rating unknown; no midpoint/default assigned.')
        if not rating['rationale'] or not supported(rating['artifact_refs']):
            result['selection_reasons'].append(f'{name}: needs rationale and reviewed local evidence references.')
    if result['selection_reasons']:
        return result
    result['contributions'] = {name: weight * card['scores'][name]['rating'] / 4
                               for name, weight in WEIGHTS.items()}
    result['weighted_score'] = sum(result['contributions'].values())
    if result['weighted_score'] < 70:
        result['selection_reasons'].append('Weighted score is below 70.')
    for name in CORE:
        if card['scores'][name]['rating'] == 0:
            result['selection_reasons'].append(f'{name}: a core dimension cannot be zero.')
    result['accepted'] = not result['selection_reasons']
    if result['accepted']:
        result['status'] = 'accepted_synthetic_test' if synthetic_test else 'accepted'
    return result


def blank_card():
    """Schema-valid unknown state, intentionally ineligible; no fabricated field facts."""
    return {
        'schema_version': '1.0', 'is_synthetic': False, 'case_id': 'CASE_REPLACE',
        'property_type': 'unknown', 'room_count': None, 'interviewee_role': None,
        'interview_date': None, 'incident_date_range': None, 'roles': [],
        'incident_summary': None, 'trace': [],
        'handover_failure_mechanism': {'summary': None, 'step_ids': [], 'artifact_refs': []},
        'verified_cash_leakage_gel': None, 'staff_rework_minutes': None,
        'observed_frequency_per_month': None, 'observation_window': None,
        'incident_count': None, 'eligible_opportunities': None, 'opportunity_unit': None,
        'quantification_artifacts': {'cash': [], 'rework': [], 'frequency': []},
        'supporting_artifacts': [], 'root_cause_code': 'OUTSIDE_SOFTWARE_SCOPE',
        'alternative_explanations': [],
        'a2a_suitability': {'distinct_operational_roles': 0, 'asynchronous_state_dependencies': None,
            'dependencies': [], 'single_database_crud': None, 'simple_rule_inadequacy_rationale': None},
        'gate_evidence': {
            'real_problem': {'recent_episode_confirmed': None, 'recency_rationale': None,
                'operator_confirmed_consequence': None, 'confirmation_role_id': None,
                'consequence': None, 'artifact_refs': []},
            'materiality': {'operator_confirmed': None, 'rationale': None, 'artifact_refs': []},
            'software_leverage': {'software_only': None, 'binding_constraint': 'unknown',
                'permitted_action': None, 'available_information': None, 'artifact_refs': []},
            'access_authority': {'inputs_available': None, 'adapter_mode': 'unknown',
                'adapter_description': None, 'write_limits': None, 'trial_approver_role_id': None,
                'authority_confirmed': None, 'artifact_refs': []},
            'feasibility': {'estimated_hours': None, 'bounded_workflow': None, 'deterministic_oracle': None,
                'replay_case_refs': [], 'baseline_comparison': None, 'failure_recovery_test': None, 'artifact_refs': []},
            'simple_rule': {'tested': None, 'baseline_description': None, 'observed_failure': None,
                'simple_rule_sufficient': None, 'artifact_refs': []}},
        'scores': {key: {'rating': None, 'rationale': None, 'artifact_refs': []} for key in WEIGHTS},
        'reviewer': None,
    }


def mock_cases():
    """Entirely invented software-test fixtures. No hotel/market evidence asserted."""
    card = blank_card()
    card.update(is_synthetic=True, case_id='SYNTH_A2A', property_type='boutique_hotel', room_count=12,
                interviewee_role='reception', interview_date='2026-09-01',
                incident_date_range={'start': '2026-08-30', 'end': '2026-08-30'},
                incident_summary='SYNTHETIC: competing service commitments need reassignment after a change.',
                verified_cash_leakage_gel=40, staff_rework_minutes=25,
                observed_frequency_per_month=4, observation_window={'start': '2026-08-02', 'end': '2026-08-31'},
                incident_count=4, eligible_opportunities=80, opportunity_unit='requests (one incident per affected request)',
                root_cause_code='SERVICE_DEPENDENCY', reviewer='SYNTHETIC_TEST_REVIEWER')
    card['roles'] = [{'role_id': key, 'responsibility': job, 'person_label': 'synthetic-person'}
                     for key, job in [('reception', 'Guest commitments'), ('service', 'Service capacity')]]
    for key, kind in [('record', 'operator_record'), ('confirmation', 'operator_confirmation'),
                      ('baseline', 'baseline_test'), ('access', 'access_record'), ('replay', 'replay_case')]:
        card['supporting_artifacts'].append({'artifact_id': key, 'kind': kind,
            'locator': f'SYNTHETIC_ONLY/{key}', 'evidence_label': 'O', 'reviewed': True,
            'summary': 'Invented offline test artifact; never field evidence.', 'collected_on': '2026-09-01'})
    for i, role in enumerate(['reception', 'service'], 1):
        card['trace'].append({'step_id': f'step{i}', 'sequence': i,
            'occurred_at': f'2026-08-30T10:0{i}:00+04:00', 'time_basis': 'timestamp', 'time_note': None,
            'actor_role_id': role, 'recipient_role_id': None, 'source_system': 'synthetic replay',
            'input_state': 'Changed commitment with stale capacity view.', 'expected_action': 'Reconcile commitment with capacity.',
            'actual_outcome': 'Conflict remains pending.', 'acknowledged_at': None, 'completed_at': None,
            'artifact_refs': ['record']})
    card['handover_failure_mechanism'] = {'summary': 'SYNTHETIC: acceptance did not follow a versioned capacity change.',
                                        'step_ids': ['step1', 'step2'], 'artifact_refs': ['record']}
    card['quantification_artifacts'] = {key: ['record'] for key in ['cash', 'rework', 'frequency']}
    card['a2a_suitability'] = {'distinct_operational_roles': 2, 'asynchronous_state_dependencies': True,
        'single_database_crud': False, 'simple_rule_inadequacy_rationale': 'SYNTHETIC baseline cannot choose between competing capacity commitments.',
        'dependencies': [{'from_step_id': 'step1', 'to_step_id': 'step2', 'from_role_id': 'reception',
                          'to_role_id': 'service', 'state_dependency': 'Accepted promise depends on latest capacity version.',
                          'constraint': 'Competing commitments cannot consume the same capacity.',
                          'asynchronous': True, 'artifact_refs': ['record']}]}
    card['gate_evidence'] = {
        'real_problem': {'recent_episode_confirmed': True, 'recency_rationale': 'SYNTHETIC interview reconstructs the preceding shift.',
            'operator_confirmed_consequence': True, 'confirmation_role_id': 'reception',
            'consequence': 'SYNTHETIC rework and compensation.', 'artifact_refs': ['record', 'confirmation']},
        'materiality': {'operator_confirmed': True, 'rationale': 'SYNTHETIC disruption judged material.', 'artifact_refs': ['confirmation']},
        'software_leverage': {'software_only': True, 'binding_constraint': 'coordination',
            'permitted_action': 'Reassign pending task after policy check.', 'available_information': 'Versioned commitment and capacity records.', 'artifact_refs': ['record', 'access']},
        'access_authority': {'inputs_available': True, 'adapter_mode': 'honest_simulator',
            'adapter_description': 'Explicit replay adapter; no live integration.', 'write_limits': 'Simulated task writes only; no money or guest messages.',
            'trial_approver_role_id': 'reception', 'authority_confirmed': True, 'artifact_refs': ['access', 'record']},
        'feasibility': {'estimated_hours': 100, 'bounded_workflow': 'Reconcile one changed commitment end to end.',
            'deterministic_oracle': 'No duplicate allocation; every commitment completed or escalated.',
            'replay_case_refs': ['replay'], 'baseline_comparison': 'Same replay against simple queue and coordinator.',
            'failure_recovery_test': 'Restart and replay duplicate event without duplicate action.', 'artifact_refs': ['baseline', 'replay']},
        'simple_rule': {'tested': True, 'baseline_description': 'Shared queue with fixed first-in-first-out rule.',
            'observed_failure': 'SYNTHETIC replay leaves competing commitments unresolved.',
            'simple_rule_sufficient': False, 'artifact_refs': ['baseline']}}
    card['scores'] = {key: {'rating': 4 if key in {'severity', 'a2a_fit'} else 3,
                           'rationale': 'SYNTHETIC reviewer rating for engine testing only.',
                           'artifact_refs': ['record', 'baseline']} for key in WEIGHTS}
    crud = deepcopy(card)
    crud['case_id'] = 'SYNTH_CRUD'
    crud['incident_summary'] = 'SYNTHETIC: correct a guest address in one database.'
    crud['a2a_suitability']['single_database_crud'] = True
    crud['a2a_suitability']['asynchronous_state_dependencies'] = False
    crud['a2a_suitability']['dependencies'] = []
    crud['gate_evidence']['simple_rule']['simple_rule_sufficient'] = True
    physical = deepcopy(card)
    physical['case_id'] = 'SYNTH_PHYSICAL'
    physical['root_cause_code'] = 'OUTSIDE_SOFTWARE_SCOPE'
    physical['incident_summary'] = 'SYNTHETIC: unavailable physical room capacity requires construction.'
    physical['gate_evidence']['software_leverage'].update(software_only=False, binding_constraint='physical_hardware')
    return {'a2a': card, 'crud': crud, 'physical': physical}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.card = mock_cases()['a2a']

    def run_case(self, card=None):
        return evaluate(self.card if card is None else card, synthetic_test=True)

    def test_schema_and_blank_template(self):
        validator().validate(blank_card())
        self.assertFalse(evaluate(blank_card())['accepted'])

    def test_mock_outcomes(self):
        for name, card in mock_cases().items():
            with self.subTest(name=name):
                result = self.run_case(card)
                self.assertEqual(result['accepted'], name == 'a2a')
                if name == 'a2a':
                    self.assertEqual(result['weighted_score'], 85)
                    self.assertTrue(all(g['passed'] for g in result['gates'].values()))
                else:
                    self.assertIsNone(result['weighted_score'])
                    self.assertFalse(result['gates']['G3' if name == 'crud' else 'G4']['passed'])

    def test_synthetic_cannot_pass_normal_evaluation(self):
        result = evaluate(self.card)
        self.assertFalse(result['gates']['G1']['passed'])

    def test_every_gate_fails_closed(self):
        mutations = {
            'G1': ('real_problem', 'operator_confirmed_consequence', None),
            'G2': ('materiality', 'operator_confirmed', None),
            'G4': ('software_leverage', 'software_only', None),
            'G5': ('access_authority', 'authority_confirmed', None),
            'G6': ('feasibility', 'deterministic_oracle', None),
            'G7': ('simple_rule', 'tested', None),
        }
        for gate_id, (section, key, value) in mutations.items():
            with self.subTest(gate=gate_id):
                card = deepcopy(self.card)
                card['gate_evidence'][section][key] = value
                if gate_id == 'G2':
                    card['incident_count'] = card['observed_frequency_per_month'] = 1
                result = self.run_case(card)
                self.assertFalse(result['gates'][gate_id]['passed'])
                self.assertIsNone(result['weighted_score'])
        self.card['a2a_suitability']['asynchronous_state_dependencies'] = None
        self.assertFalse(self.run_case()['gates']['G3']['passed'])

    def test_threshold_and_weights(self):
        self.assertEqual(sum(WEIGHTS.values()), 100)
        for value, expected in [(0, 0), (3, 75), (4, 100)]:
            for rating in self.card['scores'].values():
                rating['rating'] = value
            self.assertEqual(self.run_case()['weighted_score'], expected)
        # All 3 => 75; reducing severity from 3 to 2 yields exactly 70.
        for rating in self.card['scores'].values():
            rating['rating'] = 3
        self.card['scores']['severity']['rating'] = 2
        self.assertTrue(self.run_case()['accepted'])
        self.assertEqual(self.run_case()['weighted_score'], 70)
        self.card['scores']['adoption']['rating'] = 2
        self.assertEqual(self.run_case()['weighted_score'], 68.75)
        self.assertFalse(self.run_case()['accepted'])

    def test_core_zero_cannot_be_offset(self):
        for core in CORE:
            with self.subTest(core=core):
                for rating in self.card['scores'].values():
                    rating['rating'] = 4
                self.card['scores'][core]['rating'] = 0
                result = self.run_case()
                self.assertGreaterEqual(result['weighted_score'], 70)
                self.assertFalse(result['accepted'])

    def test_unknown_or_unsupported_scores(self):
        for field in ('rating', 'rationale', 'artifact_refs'):
            card = deepcopy(self.card)
            card['scores']['frequency'][field] = [] if field == 'artifact_refs' else None
            self.assertIsNone(self.run_case(card)['weighted_score'])

    def test_schema_rejects_typos_ranges_types_and_dates(self):
        cards = []
        c = deepcopy(self.card); c['extra'] = True; cards.append(c)
        c = deepcopy(self.card); c['trace'][0]['invented'] = True; cards.append(c)
        c = deepcopy(self.card); c['scores']['severity']['rating'] = 5; cards.append(c)
        c = deepcopy(self.card); c['scores']['severity']['rating'] = True; cards.append(c)
        c = deepcopy(self.card); c['verified_cash_leakage_gel'] = -1; cards.append(c)
        c = deepcopy(self.card); c['incident_date_range']['start'] = '2026-02-30'; cards.append(c)
        c = deepcopy(self.card); c['gate_evidence']['real_problem']['recent_episode_confirmed'] = 'yes'; cards.append(c)
        c = deepcopy(self.card); del c['scores']['adoption']; cards.append(c)
        for card in cards:
            with self.subTest(card=cards.index(card)):
                self.assertEqual(self.run_case(card)['status'], 'invalid')

    def test_semantic_integrity(self):
        for mode in ('reference', 'roles', 'time', 'date_range', 'frequency', 'count', 'sequence', 'duplicate', 'nonfinite', 'estimate'):
            c = deepcopy(self.card)
            if mode == 'reference': c['trace'][0]['artifact_refs'] = ['missing']
            if mode == 'roles': c['a2a_suitability']['distinct_operational_roles'] = 9
            if mode == 'time': c['trace'][1]['occurred_at'] = '2026-08-30T09:00:00+04:00'
            if mode == 'date_range': c['incident_date_range']['start'] = '2026-09-02'
            if mode == 'frequency': c['observed_frequency_per_month'] = 999
            if mode == 'count': c['eligible_opportunities'] = 1
            if mode == 'sequence': c['trace'][0]['sequence'] = 2
            if mode == 'duplicate': c['supporting_artifacts'].append(deepcopy(c['supporting_artifacts'][0]))
            if mode == 'nonfinite': c['gate_evidence']['feasibility']['estimated_hours'] = float('inf')
            if mode == 'estimate': c['trace'][0]['time_basis'] = 'estimate'
            with self.subTest(mode=mode):
                self.assertEqual(self.run_case(c)['status'], 'invalid')

    def test_primary_evidence_denominator_and_measurements(self):
        for mode in ('press', 'unreviewed', 'denominator', 'cash'):
            c = deepcopy(self.card)
            if mode == 'press': c['supporting_artifacts'][0]['kind'] = 'practitioner_article'
            if mode == 'unreviewed': c['supporting_artifacts'][0]['reviewed'] = False
            if mode == 'denominator': c['eligible_opportunities'] = None
            if mode == 'cash': c['quantification_artifacts']['cash'] = []
            result = self.run_case(c)
            self.assertFalse(result['accepted'])
            self.assertIsNone(result['weighted_score'])

    def test_rare_material_and_honest_simulator(self):
        self.card['incident_count'] = self.card['observed_frequency_per_month'] = 1
        self.assertTrue(self.run_case()['gates']['G2']['passed'])
        self.assertTrue(self.run_case()['gates']['G5']['passed'])
        self.card['gate_evidence']['feasibility']['estimated_hours'] = 115
        self.assertTrue(self.run_case()['gates']['G6']['passed'])
        self.card['gate_evidence']['feasibility']['estimated_hours'] = 115.1
        self.assertFalse(self.run_case()['gates']['G6']['passed'])

    def test_only_core_dimensions_prohibit_zero(self):
        for rating in self.card['scores'].values():
            rating['rating'] = 4
        self.card['scores']['adoption']['rating'] = 0
        result = self.run_case()
        self.assertEqual(result['weighted_score'], 95)
        self.assertTrue(result['accepted'])

    def test_json_loader_rejects_duplicates_and_nonfinite_constants(self):
        with tempfile.TemporaryDirectory(prefix='smartstay-json-test-') as directory:
            path = Path(directory) / 'input.json'
            for content in ('{"case_id":"A","case_id":"B"}', '{"value":NaN}', '{"value":Infinity}'):
                path.write_text(content)
                with self.subTest(content=content), self.assertRaises(ValueError):
                    load_json(path)

    def test_cli_paths_offline(self):
        script = str(Path(__file__).resolve())
        with tempfile.TemporaryDirectory(prefix='smartstay-cli-test-') as directory:
            def run(*args):
                return subprocess.run([sys.executable, script, *args], cwd=directory,
                                      capture_output=True, text=True, timeout=30)
            template = run('--template')
            self.assertEqual(template.returncode, 0, template.stderr)
            validator().validate(json.loads(template.stdout))
            path = Path(directory) / 'card.json'
            path.write_text(template.stdout)
            rejected = run('evaluate', str(path))
            self.assertEqual(rejected.returncode, 1, rejected.stderr)
            self.assertEqual(json.loads(rejected.stdout)['status'], 'rejected')
            path.write_text('{invalid-json')
            invalid = run('evaluate', str(path))
            self.assertEqual(invalid.returncode, 2)
            self.assertFalse(json.loads(invalid.stdout)['accepted'])
            missing = run('evaluate', str(Path(directory) / 'missing.json'))
            self.assertEqual(missing.returncode, 2)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--self-test', action='store_true')
    mode.add_argument('--template', action='store_true', help='Print a schema-valid, unscored blank field card')
    parser.add_argument('command', nargs='?', choices=['evaluate'])
    parser.add_argument('path', nargs='?')
    args = parser.parse_args(argv)
    if args.self_test or args.template:
        if args.command or args.path:
            parser.error('Do not combine --self-test/--template with evaluate')
    elif args.command != 'evaluate' or not args.path:
        parser.error('Use evaluate <path>, --self-test, or --template')
    try:
        if args.self_test:
            suite = unittest.defaultTestLoader.loadTestsFromTestCase(EngineTests)
            passed = unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful()
            for name, card in mock_cases().items():
                result = evaluate(card, synthetic_test=True)
                print(json.dumps({'mock': name, 'synthetic_only': True, 'status': result['status'],
                                  'score': result['weighted_score'], 'gates': result['gates']}))
            return 0 if passed else 1
        if args.template:
            card = blank_card()
            validator().validate(card)
            print(json.dumps(card, ensure_ascii=False, indent=2, allow_nan=False))
            return 0
        result = evaluate(load_json(args.path))
        print(json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False))
        return 2 if result['status'] == 'invalid' else 0 if result['accepted'] else 1
    except (OSError, ValueError, TypeError, OverflowError, SchemaError) as error:
        print(json.dumps({'status': 'invalid', 'accepted': False, 'errors': [str(error)]}))
        return 2


if __name__ == '__main__':
    sys.exit(main())
