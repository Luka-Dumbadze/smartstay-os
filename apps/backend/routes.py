"""SmartStay OS MVP - REST API, SSE stream, outbox relay and the AI Team orchestrator.

Event flow: every state change is written together with an outbox row in the owning app's schema (one transaction,
one app). The relay drains the outboxes (FOR UPDATE SKIP LOCKED, per tenant context) and publishes to the in-process SSE
broker. The orchestrator is a deterministic local planner (no external LLM, no API keys): it reads CRM memory, retrieves
approved knowledge, hands off between Mia / Sommelier / Operations Coordinator, creates operations tasks, and replies only
with facts grounded in approved, currently valid evidence.
"""
import asyncio
import json
import os
import re
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

import db

router = APIRouter(prefix='/api')
PACE = float(os.environ.get('SMARTSTAY_AGENT_PACE', '0.6'))
CONV_ID = '6f1c2d3e-0000-4000-8000-0000000c0de1'
STAFF = {'levan': '6f1c2d3e-0000-4000-8000-00000000b001', 'tamar': '6f1c2d3e-0000-4000-8000-00000000b002',
         'ana': '6f1c2d3e-0000-4000-8000-00000000b003', 'giorgi': '6f1c2d3e-0000-4000-8000-00000000b004'}
ATTESTATION = 'I personally completed and checked this hotel service.'


def jsonable(v):
    if isinstance(v, dict): return {k: jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)): return [jsonable(x) for x in v]
    if isinstance(v, uuid.UUID): return str(v)
    if hasattr(v, 'isoformat'): return v.isoformat()
    if hasattr(v, 'lower') and hasattr(v, 'upper') and not isinstance(v, str): return {'from': jsonable(v.lower), 'until': jsonable(v.upper)}
    return v


# ======================================================================================= SSE broker + outbox relay
class Broker:
    def __init__(self):
        self.subscribers: set[asyncio.Queue] = set()
        self.history: deque = deque(maxlen=500)
        self.seq = 0

    def publish(self, event: dict):
        self.seq += 1
        item = (self.seq, event)
        self.history.append(item)
        for q in list(self.subscribers):
            try: q.put_nowait(item)
            except asyncio.QueueFull: pass

    def subscribe(self):
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self.subscribers.add(q)
        return q


broker = Broker()
relay_wake = asyncio.Event()
relay_stats = {'published': 0, 'last_batch_at': None}
OUTBOXES = ['contact_center.outbox', 'ops.outbox', 'workforce.outbox']


def _claim_outbox_batch():
    """Claim and mark a batch from every app outbox in one transaction under the tenant's context."""
    rows = []
    with db.tx() as cur:
        for ob in OUTBOXES:
            cur.execute(f"""WITH c AS (SELECT space_id, id FROM {ob} WHERE published_at IS NULL ORDER BY created_at, id LIMIT 200 FOR UPDATE SKIP LOCKED)
                UPDATE {ob} o SET published_at = clock_timestamp() FROM c WHERE o.space_id = c.space_id AND o.id = c.id
                RETURNING o.id, o.event_type, o.payload, o.created_at""")
            rows += [dict(r, source=ob.split('.')[0]) for r in cur.fetchall()]
    return sorted(rows, key=lambda r: (r['created_at'], str(r['id'])))


async def relay_loop():
    while True:
        try:
            batch = await run_in_threadpool(_claim_outbox_batch)
            for r in batch:
                broker.publish({'id': str(r['id']), 'type': r['event_type'], 'source': r['source'], 'at': r['created_at'].isoformat(), 'data': r['payload']})
            if batch:
                relay_stats['published'] += len(batch); relay_stats['last_batch_at'] = datetime.now(timezone.utc).isoformat()
        except Exception as e:                                  # keep relaying; the outbox keeps the events durable
            print('[relay] error:', e)
        try:
            await asyncio.wait_for(relay_wake.wait(), timeout=0.25)
        except asyncio.TimeoutError:
            pass
        relay_wake.clear()


def emit(cur, outbox, aggregate_id, event_type, payload):
    cur.execute(f"INSERT INTO {outbox} (space_id, aggregate_id, event_type, payload) VALUES (platform.tenant(), %s, %s, %s)",
                (str(aggregate_id), event_type, json.dumps(jsonable(payload))))


def wake():
    try: relay_wake.set()
    except Exception: pass


@router.get('/stream')
async def stream(request: Request):
    q = broker.subscribe()
    last = request.headers.get('last-event-id')

    async def gen():
        try:
            yield f"event: hello\ndata: {json.dumps({'server_time': datetime.now(timezone.utc).isoformat(), 'published': relay_stats['published']})}\n\n"
            if last and last.isdigit():
                for seq, ev in list(broker.history):
                    if seq > int(last): yield f"id: {seq}\ndata: {json.dumps(ev)}\n\n"
            while True:
                if await request.is_disconnected(): break
                try:
                    seq, ev = await asyncio.wait_for(q.get(), timeout=15)
                    yield f"id: {seq}\ndata: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ': heartbeat\n\n'
        finally:
            broker.subscribers.discard(q)
    return StreamingResponse(gen(), media_type='text/event-stream', headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


# ======================================================================================= read model
def _overview():
    with db.tx() as cur:
        cur.execute('SELECT id, property_code, name, region, timezone, lifecycle FROM platform.spaces')
        space = cur.fetchone()
        cur.execute('SELECT id, display_name, role FROM platform.staff WHERE enabled ORDER BY display_name')
        staff = cur.fetchall()
        cur.execute('SELECT * FROM ops.rooms ORDER BY number::int')
        rooms = cur.fetchall()
        cur.execute("""SELECT t.*, s.display_name AS assignee_name FROM ops.tasks t LEFT JOIN platform.staff s ON s.space_id = t.space_id AND s.id = t.assignee_staff_id
                       ORDER BY (t.status IN ('COMPLETED','CANCELLED')), t.created_at DESC LIMIT 30""")
        tasks = cur.fetchall()
        cur.execute('SELECT * FROM guest_crm.profiles LIMIT 1')
        guest = cur.fetchone()
        cur.execute('SELECT domain, label, value, sensitive, basis, evidence FROM guest_crm.preferences WHERE profile_id = %s AND status = %s ORDER BY domain, label',
                    (guest['id'], 'active'))
        prefs = cur.fetchall()
        cur.execute('SELECT c.*, s.display_name AS owner_name FROM contact_center.conversations c LEFT JOIN platform.staff s ON s.space_id = c.space_id AND s.id = c.owner_staff_id WHERE c.id = %s', (CONV_ID,))
        conv = cur.fetchone()
        cur.execute('SELECT * FROM contact_center.messages WHERE conversation_id = %s ORDER BY seq', (CONV_ID,))
        messages = cur.fetchall()
        cur.execute('SELECT key, display_name, persona, model_route, enabled FROM workforce.agents ORDER BY key')
        agents = cur.fetchall()
        cur.execute('SELECT * FROM workforce.sessions ORDER BY started_at DESC LIMIT 1')
        session = cur.fetchone()
        steps = []
        if session:
            cur.execute('SELECT * FROM workforce.steps WHERE session_id = %s ORDER BY seq', (session['id'],))
            steps = cur.fetchall()
        cur.execute("SELECT count(*) AS n FROM contact_center.outbox WHERE published_at IS NULL")
        backlog = cur.fetchone()['n']
    pending = [t for t in tasks if t['status'] in ('QUEUED', 'CLAIMED', 'IN_PROGRESS')]
    stats = {'active_guests': 1 if guest and guest['stay_status'] in ('ARRIVING', 'IN_HOUSE') else 0,
             'pending_requests': len(pending), 'rooms_ready': sum(1 for r in rooms if r['cleaning_state'] == 'CLEAN'), 'rooms_total': len(rooms),
             'outbox_backlog': backlog, 'events_relayed': relay_stats['published']}
    return jsonable({'property': space, 'stats': stats, 'staff': staff, 'rooms': rooms, 'tasks': tasks, 'guest': dict(guest, preferences=prefs),
                     'conversation': conv, 'messages': messages, 'agents': agents, 'session': session, 'steps': steps,
                     'isolation': {'rls': 'forced on every table', 'db_role': 'smartstay_app (NOSUPERUSER, NOBYPASSRLS)', 'tenant_context': 'SET LOCAL per transaction'},
                     'engine': {'planner': 'deterministic local planner (no external LLM)', 'retrieval': 'PostgreSQL full-text over approved, currently valid knowledge'}})


@router.get('/health')
def health():
    with db.tx() as cur:
        cur.execute('SELECT name FROM platform.spaces')
        row = cur.fetchone()
    return {'ok': True, 'property': row['name'] if row else None, 'relayed': relay_stats['published']}


@router.get('/overview')
async def overview():
    return await run_in_threadpool(_overview)


# ======================================================================================= writes shared by routes + orchestrator
def _append_message(cur, direction, author_kind, author_name, body, evidence=None, session_id=None):
    cur.execute('SELECT next_seq, state, control_version FROM contact_center.conversations WHERE id = %s FOR UPDATE', (CONV_ID,))
    c = cur.fetchone()
    cur.execute("""INSERT INTO contact_center.messages (space_id, conversation_id, seq, direction, author_kind, author_name, body, evidence, session_id)
                   VALUES (platform.tenant(), %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (CONV_ID, c['next_seq'], direction, author_kind, author_name, body, json.dumps(evidence or []), session_id))
    m = cur.fetchone()
    cur.execute('UPDATE contact_center.conversations SET next_seq = next_seq + 1 WHERE id = %s', (CONV_ID,))
    emit(cur, 'contact_center.outbox', CONV_ID, 'message.created', m)
    return m


def _guest_notice(cur, body):
    """App 1 is the only sender; notices go out only while the AI (not a staff member) owns the conversation."""
    cur.execute('SELECT state FROM contact_center.conversations WHERE id = %s', (CONV_ID,))
    if cur.fetchone()['state'] == 'AI_ACTIVE':
        _append_message(cur, 'outbound', 'system', 'Chateau Telavi', body)


# ======================================================================================= AI Team orchestrator
NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'a': 1, 'an': 1}
AMENITY = r'(towels?|pillows?|bathrobes?|blankets?|slippers)'
WINES = ['saperavi', 'rkatsiteli', 'kindzmarauli']


def plan_intents(text):
    t = text.lower()
    intents = []
    wine = next((w for w in WINES if w in t), None) or ('wine' if re.search(r'\b(wine|bottle|qvevri|red|white)\b', t) else None)
    if wine:
        order = bool(re.search(r"\b(order|bring|send|want|would like|i'?ll have|get me|deliver)\b", t))
        vintage = (re.search(r'\b(19|20)\d{2}\b', t) or [None])[0]
        intents.append({'kind': 'wine_order' if order else 'wine_info', 'wine': wine, 'vintage': vintage})
    m = re.search(r'\b(\d+|one|two|three|four|five|a|an)\s+(?:extra\s+|more\s+|fresh\s+)?' + AMENITY, t) or re.search(r'(?:extra|more|fresh)\s+' + AMENITY, t)
    if m:
        qty = m.group(1) if m.re.groups == 2 else '1'
        item = m.group(m.re.groups)
        qty = int(qty) if qty.isdigit() else NUM.get(qty, 1)
        intents.append({'kind': 'amenity', 'item': item if item.endswith('s') or qty == 1 else item + 's', 'quantity': qty})
    if re.search(r'late check.?out|check.?out time|check.?out', t):
        intents.append({'kind': 'policy', 'topic': 'checkout', 'query': 'checkout late'})
    if re.search(r'cancel', t) and re.search(r'tasting|tour', t):
        intents.append({'kind': 'policy', 'topic': 'tasting_cancellation', 'query': 'tastings cancelled'})
    room = re.search(r'room\s*#?\s*(\d{1,4})', t)
    return intents, (room.group(1) if room else None)


class Pipeline:
    def __init__(self, text):
        self.text, self.seq, self.session_id, self.t0 = text, 0, None, time.time()

    def step(self, agent, kind, title, detail=None):
        def _w():
            with db.tx() as cur:
                self.seq += 1
                cur.execute("""INSERT INTO workforce.steps (space_id, session_id, seq, agent_key, kind, title, detail)
                               VALUES (platform.tenant(), %s, %s, %s, %s, %s, %s) RETURNING *""",
                            (self.session_id, self.seq, agent, kind, title, json.dumps(jsonable(detail or {}))))
                s = cur.fetchone()
                emit(cur, 'workforce.outbox', self.session_id, 'agent.step', s)
        return run_in_threadpool(_w)

    async def say(self, agent, kind, title, detail=None, pause=1.0):
        await self.step(agent, kind, title, detail); wake()
        await asyncio.sleep(PACE * pause)


def _start(text):
    with db.tx() as cur:
        msg = _append_message(cur, 'inbound', 'guest', 'Nino Kakhetelashvili', text)
        cur.execute("""INSERT INTO workforce.sessions (space_id, conversation_id, trigger_message_id) VALUES (platform.tenant(), %s, %s) RETURNING *""",
                    (CONV_ID, msg['id']))
        s = cur.fetchone()
        emit(cur, 'workforce.outbox', s['id'], 'agent.session', {'phase': 'started', **s})
    return msg, s


def _crm_lookup():
    with db.tx() as cur:
        cur.execute('SELECT id, full_name, locale, loyalty_tier, room_number, arrival_date, departure_date, stay_status, privacy_epoch, contact_verified_at FROM guest_crm.profiles LIMIT 1')
        p = cur.fetchone()
        cur.execute("SELECT domain, label, value, sensitive FROM guest_crm.preferences WHERE profile_id = %s AND status = 'active'", (p['id'],))
        return p, cur.fetchall()


def _kb_search(query, limit=3):
    with db.tx() as cur:
        cur.execute('SELECT * FROM kb.search(%s, %s)', (query, limit))
        return cur.fetchall()


def _evidence_still_valid(chunk_ids):
    with db.tx() as cur:
        cur.execute("""SELECT count(*) AS n FROM kb.chunks c JOIN kb.documents d ON d.space_id = c.space_id AND d.id = c.document_id
                       WHERE c.id = ANY(%s::uuid[]) AND d.state = 'APPROVED_ACTIVE' AND d.valid_during @> now()""", ([str(x) for x in chunk_ids],))
        return cur.fetchone()['n'] == len(chunk_ids)


def _create_task(session_id, category, title, detail, room, quantity, team, minutes, confirm=False, priority='ROUTINE'):
    with db.tx() as cur:
        cur.execute("""INSERT INTO ops.tasks (space_id, conversation_id, session_id, category, title, detail, room_number, quantity, priority,
                         assigned_team, requires_staff_confirmation, due_at)
                       VALUES (platform.tenant(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now() + make_interval(mins => %s)) RETURNING *""",
                    (CONV_ID, session_id, category, title, detail, room, quantity, priority, team, confirm, minutes))
        t = cur.fetchone()
        emit(cur, 'ops.outbox', t['id'], 'task.created', t)
    return t


def _finish(session_id, reply_body, evidence, state):
    with db.tx() as cur:
        cur.execute('SELECT state, control_version, owner_staff_id FROM contact_center.conversations WHERE id = %s FOR UPDATE', (CONV_ID,))
        c = cur.fetchone()
        if c['state'] == 'AI_ACTIVE':
            m = _append_message(cur, 'outbound', 'ai', 'Mia · AI Concierge', reply_body, evidence, session_id)
            final = state
        else:                                           # a staff member owns the conversation: AI may only draft privately
            m = _append_message(cur, 'internal', 'ai', 'Mia · draft for staff', reply_body, evidence, session_id)
            final = 'HANDED_TO_HUMAN'
        cur.execute("""UPDATE workforce.sessions SET state = %s, finished_at = clock_timestamp(), reply_message_id = %s WHERE id = %s RETURNING *""",
                    (final, m['id'], session_id))
        s = cur.fetchone()
        emit(cur, 'workforce.outbox', session_id, 'agent.session', {'phase': 'finished', **s})
    return m, final, c


_conv_lock = asyncio.Lock()


async def run_pipeline(text: str):
    async with _conv_lock:                               # one reasoning session per conversation at a time
        msg, session = await run_in_threadpool(_start, text)
        P = Pipeline(text); P.session_id = session['id']; wake()
        await asyncio.sleep(PACE * 0.5)
        intents, room_hint = plan_intents(text)
        await P.say('mia', 'THOUGHT', 'Reading the guest message', {'message': text, 'channel': 'WhatsApp'}, 0.8)
        await P.say('mia', 'DECISION', f"Classified {len(intents) or 'no'} supported intent{'s' if len(intents) != 1 else ''}",
                    {'route': 'FAST classifier', 'intents': [i['kind'] for i in intents] or ['unsupported']})
        await P.say('mia', 'TOOL_CALL', 'Checking CRM preferences (Layer-1 memory)', {'tool': 'crm.lookup', 'audience': 'contact_center', 'purpose': 'service_personalization'}, 0.7)
        profile, prefs = await run_in_threadpool(_crm_lookup)
        visible = [p for p in prefs if not p['sensitive']]
        allergies = [p['value'] for p in prefs if p['sensitive'] and p['label'].lower().startswith('allergen')]
        await P.say('mia', 'TOOL_RESULT', f"{profile['full_name']} · {profile['loyalty_tier']} · room {profile['room_number']} · {profile['stay_status'].lower().replace('_', '-')}",
                    {'preferences': [f"{p['label']}: {p['value']}" for p in visible], 'sensitive_facts': f'{len(allergies)} (explicit consent, not shown to the model beyond safety checks)',
                     'privacy_epoch': profile['privacy_epoch']})
        room = room_hint or profile['room_number']
        evidence, parts, created, citation = [], [], [], None
        first = profile['full_name'].split()[0]

        if not intents:
            await P.say('mia', 'GUARDRAIL', 'No supported intent - handing the conversation to the front desk', {'reason': 'unsupported request; no guessing'})
            await run_in_threadpool(_create_task, P.session_id, 'front_desk', 'Guest needs a personal reply', f'Guest wrote: "{text[:180]}"', room, None,
                                    'Front desk', 10, False, 'URGENT')
            m, final, _ = await run_in_threadpool(_finish, P.session_id,
                f"Thank you, {first}. I've passed your message to our front desk team - a colleague will reply to you personally in a few minutes.", [], 'HANDED_TO_HUMAN')
            wake(); return {'message': msg, 'reply': m, 'session_state': final, 'tasks': [], 'citation': None}

        for it in intents:
            if it['kind'] in ('wine_order', 'wine_info'):
                await P.say('mia', 'HANDOFF', 'Handing off to Sommelier', {'from': 'Mia', 'to': 'Sommelier', 'reason': 'cellar question', 'context': 'minimal: wine request + explicit wine preferences'})
                q = ' '.join(x for x in [it['wine'] if it['wine'] != 'wine' else 'saperavi', it.get('vintage')] if x)
                await P.say('sommelier', 'TOOL_CALL', 'Querying cellar menu (approved Cellar & Wine List)', {'tool': 'knowledge.search', 'query': q, 'audience': 'GUEST',
                            'retrieval': 'PostgreSQL full-text, approved + valid-now only'}, 0.9)
                hits = [h for h in await run_in_threadpool(_kb_search, q, 3) if h['structured'].get('item')]
                if not hits:
                    await P.say('sommelier', 'GUARDRAIL', 'No approved cellar entry matches - abstaining', {'rule': 'never state an unverified price'})
                    parts.append("I couldn't find that wine on our approved cellar list, so our sommelier will confirm availability with you personally.")
                    continue
                h = hits[0]; s = h['structured']
                citation = {'item': s['item'], 'vintage': s.get('vintage'), 'price_gel': s['price_gel'], 'unit': s['unit'], 'allergens': s.get('allergens', []),
                            'allergen_verified': s.get('allergen_verified', False), 'notes': s.get('notes'), 'document': h['document_title'],
                            'document_version': h['document_version'], 'approved_by': h['approved_by'], 'approved_at': h['approved_at'],
                            'valid_until': h['valid_until'], 'chunk_id': h['chunk_id'], 'content_sha256': h['content_sha256'], 'quote': h['content']}
                await P.say('sommelier', 'TOOL_RESULT', f"{s['item']} · {s['price_gel']} GEL / {s['unit']}", {'citation': citation, 'rank': round(float(h['rank']), 3)})
                conflict = [a for a in allergies if any(a.lower() in x.lower() for x in s.get('allergens', []))]
                await P.say('sommelier', 'GUARDRAIL', 'Allergen check passed' if not conflict else 'Allergen conflict - human confirmation required',
                            {'wine_allergens': s.get('allergens', []), 'guest_avoidance': f'{len(allergies)} sensitive item(s)', 'conflict': bool(conflict)})
                evidence.append({'knowledge_item_id': str(h['chunk_id']), 'document': h['document_title'], 'policy_version': str(h['document_version']),
                                 'valid_at': datetime.now(timezone.utc).isoformat()})
                if it['kind'] == 'wine_order':
                    await P.say('sommelier', 'HANDOFF', 'Handing off to Operations Coordinator', {'from': 'Sommelier', 'to': 'Operations Coordinator', 'reason': 'bottle delivery'})
                    await P.say('ops', 'TOOL_CALL', 'Creating cellar delivery task (charge needs front-desk confirmation)', {'tool': 'operations.request', 'category': 'food_beverage',
                                'room': room, 'authority': 'no autonomous charges - staff confirms before billing'})
                    t = await run_in_threadpool(_create_task, P.session_id, 'food_beverage', f"Deliver {s['item']}", f"1 x {s['unit']} ({s['price_gel']} GEL) to room {room}. Front desk confirms the room charge.",
                                                room, 1, 'Cellar & F&B', 45, True)
                    created.append(t)
                    await P.say('ops', 'TOOL_RESULT', f"Task queued for Cellar & F&B · room {room}", {'task_id': t['id'], 'status': t['status']})
                    parts.append(f"Our {s['item']} is {s['price_gel']} GEL per {s['unit'].replace('750ml', '750 ml')} - a qvevri-aged dry red that suits your taste for Saperavi. "
                                 f"It contains {', '.join(s.get('allergens', [])) or 'no listed allergens'}. I've asked our sommelier to bring a bottle to room {room}; "
                                 "the front desk will confirm the room charge before it is billed.")
                else:
                    parts.append(f"Our {s['item']} is {s['price_gel']} GEL per {s['unit'].replace('750ml', '750 ml')} and contains {', '.join(s.get('allergens', [])) or 'no listed allergens'}. "
                                 "Would you like me to have a bottle brought to your room?")
                await P.say('sommelier', 'HANDOFF', 'Returning to Mia', {'from': 'Sommelier', 'to': 'Mia'}, 0.6)
            elif it['kind'] == 'amenity':
                await P.say('mia', 'HANDOFF', 'Handing off to Operations Coordinator', {'from': 'Mia', 'to': 'Operations Coordinator', 'reason': 'housekeeping request'})
                pol = await run_in_threadpool(_kb_search, 'extra towels pillows delivered housekeeping', 1)
                await P.say('ops', 'TOOL_CALL', f"Creating {it['item']} task for housekeeping", {'tool': 'operations.request', 'category': 'housekeeping', 'quantity': it['quantity'], 'room': room}, 0.9)
                t = await run_in_threadpool(_create_task, P.session_id, 'housekeeping', f"Deliver {it['quantity']} extra {it['item']}",
                                            f"{it['quantity']} x {it['item']} to room {room}", room, it['quantity'], 'Housekeeping', 30)
                created.append(t)
                await P.say('ops', 'TOOL_RESULT', f"Housekeeping task queued · room {room}", {'task_id': t['id'], 'status': t['status'], 'sla': '30 min (Guest Services Policy)'})
                if pol:
                    evidence.append({'knowledge_item_id': str(pol[0]['chunk_id']), 'document': pol[0]['document_title'], 'policy_version': str(pol[0]['document_version']),
                                     'valid_at': datetime.now(timezone.utc).isoformat()})
                parts.append(f"Housekeeping is bringing {it['quantity']} extra {it['item']} to room {room} - usually within 30 minutes, complimentary.")
                await P.say('ops', 'HANDOFF', 'Returning to Mia', {'from': 'Operations Coordinator', 'to': 'Mia'}, 0.6)
            elif it['kind'] == 'policy':
                await P.say('mia', 'TOOL_CALL', 'Looking up the Guest Services Policy', {'tool': 'knowledge.search', 'query': it['query'], 'audience': 'GUEST'}, 0.8)
                hits = [h for h in await run_in_threadpool(_kb_search, it['query'], 3) if h['structured'].get('topic') == it['topic']]
                if hits:
                    h = hits[0]
                    await P.say('mia', 'TOOL_RESULT', f"{h['document_title']} v{h['document_version']}", {'quote': h['content'], 'approved_by': h['approved_by']})
                    evidence.append({'knowledge_item_id': str(h['chunk_id']), 'document': h['document_title'], 'policy_version': str(h['document_version']),
                                     'valid_at': datetime.now(timezone.utc).isoformat()})
                    if citation is None:
                        citation = {'item': h['document_title'], 'quote': h['content'], 'document': h['document_title'], 'document_version': h['document_version'],
                                    'approved_by': h['approved_by'], 'approved_at': h['approved_at'], 'valid_until': h['valid_until'], 'chunk_id': h['chunk_id'],
                                    'content_sha256': h['content_sha256'], 'price_gel': None, 'allergens': []}
                    parts.append(h['content'] + (" As a Gold member you qualify - I've asked the front desk to confirm availability for you." if it['topic'] == 'checkout' else ''))
                    if it['topic'] == 'checkout':
                        t = await run_in_threadpool(_create_task, P.session_id, 'front_desk', 'Confirm late checkout (14:00)', f'Gold member, room {room}: confirm availability',
                                                    room, None, 'Front desk', 20, True)
                        created.append(t)
                else:
                    parts.append("Let me have the front desk confirm that for you.")

        await P.say('mia', 'GUARDRAIL', 'Dispatch gate: evidence approved & valid now, no unverified claims, conversation owner checked',
                    {'evidence_items': len(evidence), 'evidence_valid': await run_in_threadpool(_evidence_still_valid, [e['knowledge_item_id'] for e in evidence]) if evidence else True,
                     'promises': 'no completion claimed before staff attestation'}, 0.7)
        reply = f"Gamarjoba, {first}! " + ' '.join(parts)
        await P.say('mia', 'REPLY', 'Composing grounded reply', {'route': 'FRONTIER_HIGH (template-grounded)', 'chars': len(reply)}, 0.5)
        m, final, conv = await run_in_threadpool(_finish, P.session_id, reply, evidence, 'COMPLETED')
        wake()
        return {'message': msg, 'reply': m, 'session_state': final, 'tasks': created, 'citation': citation, 'elapsed_s': round(time.time() - P.t0, 2)}


# ======================================================================================= commands
class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class TaskAction(BaseModel):
    action: str
    staff_id: Optional[str] = None
    expected_version: Optional[int] = None


class RoomAction(BaseModel):
    action: str
    staff_id: Optional[str] = None


class ControlIn(BaseModel):
    mode: str
    staff_id: Optional[str] = STAFF['levan']


class OperatorMsg(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    staff_id: Optional[str] = STAFF['levan']


@router.post('/chat/send')
async def chat_send(body: ChatIn):
    return jsonable(await run_pipeline(body.text.strip()))


def _task_action(task_id, a: TaskAction):
    with db.tx() as cur:
        cur.execute('SELECT * FROM ops.tasks WHERE id = %s FOR UPDATE', (task_id,))
        t = cur.fetchone()
        if not t: raise HTTPException(404, 'task not found')
        if a.expected_version is not None and a.expected_version != t['state_version']:
            raise HTTPException(409, f"stale action: task is at version {t['state_version']}")
        staff = a.staff_id or (STAFF['giorgi'] if t['category'] == 'food_beverage' else STAFF['levan'] if t['category'] == 'front_desk' else STAFF['tamar'])
        cur.execute('SELECT display_name FROM platform.staff WHERE id = %s AND enabled', (staff,))
        who = cur.fetchone()
        if not who: raise HTTPException(403, 'unknown or disabled staff member')
        if a.action == 'ClaimTask':
            if t['status'] != 'QUEUED': raise HTTPException(409, f"cannot claim a {t['status']} task")
            cur.execute("UPDATE ops.tasks SET status = 'CLAIMED', assignee_staff_id = %s, state_version = state_version + 1 WHERE id = %s", (staff, task_id))
        elif a.action == 'StartTask':
            if t['status'] != 'CLAIMED' or str(t['assignee_staff_id']) != staff: raise HTTPException(409, 'only the assignee can start a claimed task')
            cur.execute("UPDATE ops.tasks SET status = 'IN_PROGRESS', state_version = state_version + 1 WHERE id = %s", (task_id,))
        elif a.action == 'AttestCompleted':
            if t['status'] != 'IN_PROGRESS' or str(t['assignee_staff_id']) != staff: raise HTTPException(409, 'only the assignee can attest an in-progress task')
            cur.execute('INSERT INTO ops.attestations (space_id, task_id, staff_id, statement, evidence_ref) VALUES (platform.tenant(), %s, %s, %s, %s)',
                        (task_id, staff, ATTESTATION, f'checklist:{task_id}'))
            cur.execute("UPDATE ops.tasks SET status = 'COMPLETED', completed_at = clock_timestamp(), state_version = state_version + 1 WHERE id = %s", (task_id,))
        elif a.action == 'ReleaseTask':
            if t['status'] != 'CLAIMED': raise HTTPException(409, 'only claimed tasks can be released')
            cur.execute("UPDATE ops.tasks SET status = 'QUEUED', assignee_staff_id = NULL, state_version = state_version + 1 WHERE id = %s", (task_id,))
        else:
            raise HTTPException(400, 'unknown action')
        cur.execute('SELECT t.*, s.display_name AS assignee_name FROM ops.tasks t LEFT JOIN platform.staff s ON s.space_id = t.space_id AND s.id = t.assignee_staff_id WHERE t.id = %s', (task_id,))
        nt = cur.fetchone()
        emit(cur, 'ops.outbox', task_id, 'task.updated', {**nt, 'action': a.action, 'by': who['display_name']})
    if a.action == 'AttestCompleted' and nt['conversation_id']:           # completion callback -> App 1 (separate transaction, App 1 only)
        with db.tx() as cur:
            done = {'housekeeping': f"Your {nt['quantity'] or ''} extra {nt['title'].split('extra ')[-1] if 'extra' in nt['title'] else 'items'} have been delivered to room {nt['room_number']}.",
                    'food_beverage': f"Your {nt['title'].replace('Deliver ', '')} has been delivered to room {nt['room_number']}. Enjoy!",
                    'front_desk': 'The front desk has taken care of your request.'}[nt['category']]
            _guest_notice(cur, done.replace('  ', ' '))
    return nt


@router.post('/tasks/{task_id}/action')
async def task_action(task_id: str, body: TaskAction):
    r = await run_in_threadpool(_task_action, task_id, body); wake()
    return jsonable(r)


def _room_action(room_id, a: RoomAction):
    transitions = {'StartCleaning': ('DIRTY', 'CLEANING', STAFF['tamar']), 'MarkClean': ('CLEANING', 'CLEAN', STAFF['ana']), 'MarkDirty': ('CLEAN', 'DIRTY', STAFF['tamar'])}
    if a.action not in transitions: raise HTTPException(400, 'unknown action')
    src, dst, default_staff = transitions[a.action]
    with db.tx() as cur:
        cur.execute('SELECT * FROM ops.rooms WHERE id = %s OR number = %s FOR UPDATE', (room_id if re.fullmatch(r'[0-9a-f-]{36}', room_id) else None, room_id))
        r = cur.fetchone()
        if not r: raise HTTPException(404, 'room not found')
        if r['cleaning_state'] != src: raise HTTPException(409, f"room {r['number']} is {r['cleaning_state']}, not {src}")
        cur.execute('SELECT display_name, role FROM platform.staff WHERE id = %s', (a.staff_id or default_staff,))
        who = cur.fetchone()
        if a.action == 'MarkClean' and who['role'] != 'HOUSEKEEPING_SUPERVISOR': raise HTTPException(403, 'a housekeeping supervisor must inspect and release the room')
        cur.execute('UPDATE ops.rooms SET cleaning_state = %s WHERE id = %s RETURNING *', (dst, r['id']))
        nr = cur.fetchone()
        emit(cur, 'ops.outbox', r['id'], 'room.updated', {**nr, 'action': a.action, 'by': who['display_name']})
    if dst == 'CLEAN':
        with db.tx() as cur:
            cur.execute("SELECT full_name FROM guest_crm.profiles WHERE room_number = %s AND stay_status = 'ARRIVING'", (nr['number'],))
            g = cur.fetchone()
            if g: _guest_notice(cur, f"Good news, {g['full_name'].split()[0]} - your room {nr['number']} is cleaned, inspected and ready for you.")
    return nr


@router.post('/rooms/{room_id}/action')
async def room_action(room_id: str, body: RoomAction):
    r = await run_in_threadpool(_room_action, room_id, body); wake()
    return jsonable(r)


def _control(c: ControlIn):
    with db.tx() as cur:
        cur.execute('SELECT * FROM contact_center.conversations WHERE id = %s FOR UPDATE', (CONV_ID,))
        cv = cur.fetchone()
        if c.mode == 'operator':
            if cv['state'] == 'OPERATOR_LOCKED': return cv
            cur.execute("UPDATE contact_center.conversations SET state = 'OPERATOR_LOCKED', owner_staff_id = %s, control_version = control_version + 1 WHERE id = %s RETURNING *", (c.staff_id, CONV_ID))
        elif c.mode == 'ai':
            if cv['state'] == 'AI_ACTIVE': return cv
            cur.execute("UPDATE contact_center.conversations SET state = 'AI_ACTIVE', owner_staff_id = NULL, control_version = control_version + 1 WHERE id = %s RETURNING *", (CONV_ID,))
        else:
            raise HTTPException(400, 'mode must be operator or ai')
        n = cur.fetchone()
        cur.execute('SELECT display_name FROM platform.staff WHERE id = %s', (c.staff_id,))
        emit(cur, 'contact_center.outbox', CONV_ID, 'conversation.control', {**n, 'by': (cur.fetchone() or {}).get('display_name')})
        return n


@router.post('/conversations/control')
async def control(body: ControlIn):
    r = await run_in_threadpool(_control, body); wake()
    return jsonable(r)


def _operator_send(o: OperatorMsg):
    with db.tx() as cur:
        cur.execute('SELECT state, owner_staff_id FROM contact_center.conversations WHERE id = %s FOR UPDATE', (CONV_ID,))
        c = cur.fetchone()
        if c['state'] != 'OPERATOR_LOCKED' or str(c['owner_staff_id']) != o.staff_id:
            raise HTTPException(409, 'take over the conversation before replying as staff')
        cur.execute('SELECT display_name FROM platform.staff WHERE id = %s', (o.staff_id,))
        return _append_message(cur, 'outbound', 'operator', cur.fetchone()['display_name'] + ' · Front desk', o.text)


@router.post('/chat/operator')
async def operator_send(body: OperatorMsg):
    r = await run_in_threadpool(_operator_send, body); wake()
    return jsonable(r)


@router.post('/demo/reset')
async def demo_reset():
    await run_in_threadpool(db.reset_demo)
    broker.publish({'id': str(uuid.uuid4()), 'type': 'demo.reset', 'source': 'platform', 'at': datetime.now(timezone.utc).isoformat(), 'data': {}})
    return {'ok': True}
