"""Synthetic proposal example; deterministic baseline already solves this case."""
import asyncio
from mini_host import AgentSpec, AppManifest

def object_schema(names):
    return {'$schema': 'https://json-schema.org/draft/2020-12/schema',
            'type': 'object', 'additionalProperties': False,
            'properties': {n: {'type': 'integer', 'minimum': 0} for n in names},
            'required': list(names)}

INPUT = object_schema(['requested', 'available', 'spend_limit'])
LIMIT = object_schema(['limit'])
OUTPUT = object_schema(['approved_units'])

async def handle(ctx, event):
    capacity, finance = await asyncio.gather(
        ctx.ask('capacity', {'available': event['available']}),
        ctx.ask('finance', {'spend_limit': event['spend_limit']}))
    return ctx.tool('bounded_proposal', {'requested': event['requested'],
                    'capacity': capacity['limit'], 'finance': finance['limit']})

def check(event, result):
    if result['approved_units'] > min(event.values()):
        raise ValueError('proposal exceeds source constraints')

def mount(host):
    host.mount(AppManifest(
        app_id='sample.capacity_budget', version='1.0.0',
        input_schema=INPUT, output_schema=OUTPUT,
        agents=(AgentSpec('capacity', 'reasoner', LIMIT),
                AgentSpec('finance', 'classifier', LIMIT)),
        tools=('bounded_proposal',), handle=handle, check=check))
