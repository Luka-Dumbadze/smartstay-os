import asyncio
from dataclasses import replace
import tempfile
import unittest
from pathlib import Path
from jsonschema import ValidationError
from mini_host import Context, FixtureModel, Host, encode
from sample_app import mount

class ContractProof(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.tmp.name) / 'proof.sqlite')
        self.models = {'reasoner': FixtureModel(), 'classifier': FixtureModel()}
        self.tools = {'bounded_proposal': lambda x: {'approved_units': min(x.values())}}
        self.host = Host(self.path, self.models, self.tools)
        mount(self.host)
        self.app = self.host.apps['sample.capacity_budget']
        self.payload = dict(requested=8, available=6, spend_limit=5)

    async def asyncTearDown(self):
        self.host.db.close()
        self.tmp.cleanup()

    async def run_case(self, command='one', tenant='A', version=0, **kw):
        return await self.host.run(self.app.app_id, tenant, 'case', command,
                                   version, self.payload, **kw)

    async def test_mount_two_roles_and_commit(self):
        self.assertEqual(await self.run_case(), {'approved_units': 5})
        self.assertEqual(self.host.db.execute('SELECT count(*) FROM outbox').fetchone()[0], 1)

    async def test_duplicate_replay_no_second_intent(self):
        self.assertEqual(await self.run_case(), await self.run_case())
        self.assertEqual(self.host.db.execute('SELECT count(*) FROM outbox').fetchone()[0], 1)

    async def test_reused_key_different_payload_rejected(self):
        await self.run_case()
        self.payload['requested'] = 9
        with self.assertRaisesRegex(ValueError, 'different input'):
            await self.run_case()

    async def test_transaction_rolls_back_state_receipt_and_outbox(self):
        with self.assertRaisesRegex(RuntimeError, 'injected crash'):
            await self.run_case(inject_failure=True)
        for table in ['state', 'receipts', 'outbox']:
            self.assertEqual(self.host.db.execute(f'SELECT count(*) FROM {table}').fetchone()[0], 0)

    async def test_restart_keeps_idempotency(self):
        result = await self.run_case()
        self.host.db.close()
        self.host = Host(self.path, self.models, self.tools)
        mount(self.host)
        self.assertEqual(await self.run_case(), result)

    async def test_tenants_and_contexts_isolated(self):
        await self.run_case()
        await self.run_case(tenant='B')
        self.assertEqual(self.host.db.execute('SELECT count(*) FROM state').fetchone()[0], 2)
        state = {'nested': {'value': 1}}
        ctx = Context(self.app, self.models, self.tools, state)
        ctx.state['nested']['value'] = 2
        self.assertEqual(state['nested']['value'], 1)

    async def test_stale_version_rejected(self):
        await self.run_case()
        with self.assertRaisesRegex(ValueError, 'stale version'):
            await self.run_case(command='two')

    async def test_concurrent_proposals_only_one_commits(self):
        results = await asyncio.gather(self.run_case(), self.run_case(command='two'),
                                       return_exceptions=True)
        self.assertEqual(sum(isinstance(x, ValueError) for x in results), 1)
        self.assertEqual(self.host.db.execute('SELECT count(*) FROM outbox').fetchone()[0], 1)

    async def test_bad_input_rejected(self):
        self.payload['extra'] = 1
        with self.assertRaises(ValidationError):
            await self.run_case()

    async def test_bad_model_output_rejected(self):
        class Bad:
            async def complete(self, *args): return {'limit': 'six'}
        self.models['reasoner'] = Bad()
        with self.assertRaises(ValidationError):
            await self.run_case()

    async def test_policy_blocks_inflated_model_output(self):
        class Inflated:
            async def complete(self, *args): return {'limit': 999}
        self.models.update(reasoner=Inflated(), classifier=Inflated())
        with self.assertRaisesRegex(ValueError, 'source constraints'):
            await self.run_case()

    async def test_model_deadline(self):
        class Slow:
            async def complete(self, *args): await asyncio.sleep(5)
        self.models['reasoner'] = Slow()
        with self.assertRaises(TimeoutError):
            await self.run_case()

    async def test_undeclared_tool_and_call_budget(self):
        ctx = Context(self.app, self.models, self.tools, {}, max_calls=0)
        with self.assertRaises(PermissionError): ctx.tool('refund', {})
        with self.assertRaisesRegex(RuntimeError, 'budget'):
            await ctx.ask('capacity', {'available': 6})

    async def test_missing_binding_and_duplicate_mount(self):
        with self.assertRaisesRegex(ValueError, 'duplicate app'): mount(self.host)
        new_host = Host(':memory:', {}, self.tools)
        try:
            with self.assertRaisesRegex(ValueError, 'model binding'): mount(new_host)
        finally:
            new_host.db.close()

if __name__ == '__main__':
    unittest.main(verbosity=2)
