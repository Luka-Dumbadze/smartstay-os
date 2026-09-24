"""Offline contract proof, not a production runtime or external-action worker."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
import hashlib
import json
import sqlite3
from typing import Awaitable, Callable, Protocol

from jsonschema import Draft202012Validator

Json = dict

def encode(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False)

def clone(value: Json) -> Json:
    return json.loads(encode(value))

def validate(schema: Json, value: Json) -> None:
    Draft202012Validator(schema).validate(value)

class Model(Protocol):
    async def complete(self, role: str, facts: Json, schema: Json) -> Json: ...

@dataclass(frozen=True)
class AgentSpec:
    role: str
    model_binding: str
    output_schema: Json

@dataclass(frozen=True)
class AppManifest:
    app_id: str
    version: str
    input_schema: Json
    output_schema: Json
    agents: tuple[AgentSpec, ...]
    tools: tuple[str, ...]
    handle: Callable[[Context, Json], Awaitable[Json]]
    check: Callable[[Json, Json], None]

class Context:
    def __init__(self, app: AppManifest, models: dict[str, Model], tools: dict,
                 state: Json, max_calls: int = 4):
        self._app, self._models, self._tools = app, models, tools
        self.state = clone(state)
        self.calls, self.max_calls = 0, max_calls

    async def ask(self, role: str, facts: Json) -> Json:
        self.calls += 1
        if self.calls > self.max_calls:
            raise RuntimeError('model-call budget exhausted')
        agent = next((a for a in self._app.agents if a.role == role), None)
        if agent is None:
            raise PermissionError('undeclared role')
        value = await asyncio.wait_for(self._models[agent.model_binding].complete(
            role, clone(facts), agent.output_schema), timeout=1)
        validate(agent.output_schema, value)
        return clone(value)

    def tool(self, name: str, arguments: Json) -> Json:
        if name not in self._app.tools:
            raise PermissionError('undeclared tool')
        return clone(self._tools[name](clone(arguments)))

class Host:
    def __init__(self, path: str, models: dict[str, Model], tools: dict):
        self.models, self.tools, self.apps = models, tools, {}
        self.db = sqlite3.connect(path)
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS state (
            scope TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts (
            scope TEXT, command_id TEXT, fingerprint TEXT, output TEXT,
            PRIMARY KEY(scope, command_id));
          CREATE TABLE IF NOT EXISTS outbox (
            scope TEXT, command_id TEXT, body TEXT,
            PRIMARY KEY(scope, command_id));
        ''')

    def mount(self, app: AppManifest) -> None:
        if app.app_id in self.apps:
            raise ValueError('duplicate app')
        if len({a.role for a in app.agents}) != len(app.agents):
            raise ValueError('duplicate role')
        for schema in [app.input_schema, app.output_schema,
                       *(a.output_schema for a in app.agents)]:
            Draft202012Validator.check_schema(schema)
        if any(a.model_binding not in self.models for a in app.agents):
            raise ValueError('missing model binding')
        if not set(app.tools) <= self.tools.keys():
            raise ValueError('missing tool binding')
        self.apps[app.app_id] = app

    def snapshot(self, scope: str) -> tuple[int, Json]:
        row = self.db.execute('SELECT version,body FROM state WHERE scope=?',
                              (scope,)).fetchone()
        return (row[0], json.loads(row[1])) if row else (0, {})

    async def run(self, app_id: str, tenant: str, case: str, command_id: str,
                  expected_version: int, payload: Json, *, inject_failure=False) -> Json:
        app = self.apps[app_id]
        scope = encode([tenant, app.app_id, app.version, case])
        validate(app.input_schema, payload)
        fingerprint = hashlib.sha256(encode([expected_version, payload]).encode()).hexdigest()
        prior = self.db.execute('SELECT fingerprint,output FROM receipts '
                                'WHERE scope=? AND command_id=?', (scope, command_id)).fetchone()
        if prior:
            if prior[0] != fingerprint:
                raise ValueError('idempotency key reused with different input')
            return json.loads(prior[1])
        version, state = self.snapshot(scope)
        if version != expected_version:
            raise ValueError('stale version')
        ctx = Context(app, self.models, self.tools, state)
        output = await asyncio.wait_for(app.handle(ctx, clone(payload)), timeout=3)
        validate(app.output_schema, output)
        app.check(clone(payload), clone(output))
        # No network or model await inside the local transaction.
        try:
            self.db.execute('BEGIN IMMEDIATE')
            if self.snapshot(scope)[0] != expected_version:
                raise ValueError('concurrent state change')
            self.db.execute('INSERT INTO state VALUES (?,?,?) ON CONFLICT(scope) '
                            'DO UPDATE SET version=excluded.version,body=excluded.body',
                            (scope, version + 1, encode(output)))
            self.db.execute('INSERT INTO outbox VALUES (?,?,?)',
                            (scope, command_id, encode({'kind': 'proposal.recorded', 'result': output})))
            if inject_failure:
                raise RuntimeError('injected crash before commit')
            self.db.execute('INSERT INTO receipts VALUES (?,?,?,?)',
                            (scope, command_id, fingerprint, encode(output)))
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise
        return clone(output)

class FixtureModel:
    """Deterministic output provider, explicitly NOT a language model."""
    async def complete(self, role: str, facts: Json, schema: Json) -> Json:
        await asyncio.sleep(0)
        return {'limit': facts['available'] if role == 'capacity' else facts['spend_limit']}
