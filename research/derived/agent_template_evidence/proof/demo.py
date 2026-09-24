"""Run the offline mounting proof with no API keys or external effects."""
import asyncio
import json
from mini_host import FixtureModel, Host
from sample_app import mount

async def main():
    host = Host(':memory:',
                {'reasoner': FixtureModel(), 'classifier': FixtureModel()},
                {'bounded_proposal': lambda x: {'approved_units': min(x.values())}})
    try:
        mount(host)
        result = await host.run('sample.capacity_budget', 'synthetic-property',
                               'demo-case', 'event-1', 0,
                               {'requested': 8, 'available': 6, 'spend_limit': 5})
        print(json.dumps({'mode': 'fixture', 'result': result}, sort_keys=True))
    finally:
        host.db.close()

if __name__ == '__main__':
    asyncio.run(main())
