import asyncio
import copy
import json
import tempfile
import unittest
from pathlib import Path
import httpx

from core import MonitorBlocked, Store, format_alert, money, normalize
from delivery import deliver
from source import collect, same_listing, validate_config
from worker import acquire_lock

NOW = '2026-10-14T10:00:00+00:00'


def config():
    return {
        'listing_url': 'https://kobeplayhq.com/fixture-only', 'mapping_verified': True,
        'listing_scope': 'all-statuses', 'expected_account': 'fixture-operator',
        'account_selector': '#account', 'ready_selector': '#ready', 'empty_selector': '#empty',
        'rows_selector': '.row', 'total_selector': '#total', 'next_page_selector': '#next',
        'source_timezone': 'Asia/Manila', 'poll_seconds': 60, 'statuses': {'Pending': 'pending', 'Paid': 'completed'},
        'fields': {key: key for key in ['request_id', 'username', 'amount', 'currency', 'requested_at', 'status']},
        'live_enabled': False,
    }


def raw(amount='3,000.00'):
    return dict(request_id='fixture-1', username='fixture-player', amount=amount, currency='PHP',
                requested_at='2026-10-14T09:00:00+00:00', status='Pending')


class CoreTests(unittest.TestCase):
    def test_exact_threshold_and_reject_ambiguous_amounts(self):
        for value, expected in [('2,999.99', 299999), ('3,000.00', 300000), ('3000.01', 300001)]:
            self.assertEqual(money(value), expected)
            message = format_alert(normalize(raw(value), config()), NOW)
            self.assertEqual('HUMAN REVIEW REQUIRED' in message, expected >= 300000)
        for value in ['3.000,00', '3,00', '-3000', 'NaN', '1e3', 'PHP 3000', '3000.001']:
            with self.assertRaises(MonitorBlocked): money(value)

    def test_missing_evidence_never_becomes_passed(self):
        message = format_alert(normalize(raw(), config()), NOW)
        self.assertIn('Promotion VTO: Unverified', message)
        self.assertIn('Met before request: Unverified', message)
        self.assertNotIn('Passed', message)
        self.assertIn('1h 0m', message)

    def test_unknown_currency_status_and_date_fail_closed(self):
        for field, value in [('currency', 'USD'), ('status', 'Some new status'), ('requested_at', 'tomorrow')]:
            r = raw(); r[field] = value
            with self.assertRaises(MonitorBlocked): normalize(r, config())

    def test_unverified_example_cannot_activate(self):
        c = json.loads(Path(__file__).with_name('config.example.json').read_text())
        with self.assertRaises(MonitorBlocked): validate_config(c)
        c = config(); validate_config(c)
        c['live_enabled'] = True
        with self.assertRaises(MonitorBlocked): validate_config(c)

    def test_same_origin_is_not_enough_for_pagination(self):
        self.assertTrue(same_listing('https://kobeplayhq.com/fixture-only?page=2', config()['listing_url']))
        for url in ['https://evil.example/fixture-only', 'https://kobeplayhq.com/admin/delete', 'http://kobeplayhq.com/fixture-only', 'https://user@kobeplayhq.com/fixture-only']:
            self.assertFalse(same_listing(url, config()['listing_url']))

    def test_duplicate_snapshot_restart_and_status_transition(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'state.db'; r = normalize(raw(), config())
            db = Store(path)
            self.assertEqual(db.ingest([r], NOW, True), 1)
            self.assertEqual(db.ingest([r], NOW, True), 0)
            db.close(); db = Store(path)
            self.assertEqual(db.ingest([r], NOW, True), 0)
            r['phase'] = 'completed'; r['status'] = 'Paid'
            self.assertEqual(db.ingest([r], NOW, True), 1)
            db.ingest([], NOW, True)
            self.assertEqual(db.db.execute('SELECT COUNT(*) FROM records').fetchone()[0], 1)
            self.assertEqual(db.counts()['pending'], 2)
            db.close()

    def test_initial_historical_completions_are_not_broadcast(self):
        with tempfile.TemporaryDirectory() as d:
            db = Store(Path(d) / 'state.db')
            r = raw(); r['status'] = 'Paid'
            db.ingest([normalize(r, config())], NOW, True)
            self.assertEqual(db.counts(), {'baseline': 1})
            db.close()

    def test_live_mode_promotes_dry_run_pending_once(self):
        with tempfile.TemporaryDirectory() as d:
            db = Store(Path(d) / 'state.db'); r = normalize(raw(), config())
            db.ingest([r], NOW, False)
            self.assertEqual(db.ingest([r], NOW, True), 1)
            self.assertEqual(db.ingest([r], NOW, True), 0)
            db.close()

    def test_crashed_send_is_quarantined_not_replayed(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'state.db'; db = Store(path)
            db.ingest([normalize(raw(), config())], NOW, True)
            self.assertIsNotNone(db.next_delivery(0)); db.close()
            db = Store(path)
            self.assertEqual(db.counts(), {'ambiguous': 1})
            self.assertIsNone(db.next_delivery(100)); db.close()

    def test_concurrent_process_cannot_use_same_profile(self):
        with tempfile.TemporaryDirectory() as d:
            lock = acquire_lock(Path(d))
            try:
                with self.assertRaises(MonitorBlocked): acquire_lock(Path(d))
            finally: lock.close()


class FakeLocator:
    def __init__(self, page, selector, row=None): self.page, self.selector, self.row = page, selector, row
    async def inner_text(self, **kwargs):
        if self.row is not None: return self.row[self.selector]
        return {'#account': self.page.account, '#total': str(self.page.total)}[self.selector]
    async def wait_for(self, **kwargs): return None
    async def count(self):
        if self.selector == 'input[type=password]': return int(self.page.password)
        return len(self.page.rows)
    async def is_visible(self): return self.page.empty if self.selector == '#empty' else bool(self.page.next)
    async def get_attribute(self, name): return self.page.next
    def nth(self, index): return FakeLocator(self.page, self.selector, self.page.rows[index])
    def locator(self, selector): return FakeLocator(self.page, selector, self.row)


class FakePage:
    def __init__(self, rows, total, *, account='fixture-operator', password=False, empty=False, next_url=None):
        self.rows, self.total, self.account, self.password, self.empty, self.next = rows, total, account, password, empty, next_url
        self.url = ''
    async def goto(self, url, **kwargs): self.url = url; return None
    def locator(self, selector): return FakeLocator(self, selector)


class SourceTests(unittest.IsolatedAsyncioTestCase):
    async def test_complete_snapshot(self):
        records = await collect(FakePage([raw()], 1), config())
        self.assertEqual(records[0]['amount_minor'], 300000)

    async def test_empty_requires_explicit_zero_and_empty_marker(self):
        self.assertEqual(await collect(FakePage([], 0, empty=True), config()), [])
        for page in [FakePage([], 0), FakePage([], 2, empty=True)]:
            with self.assertRaises(MonitorBlocked): await collect(page, config())

    async def test_session_expiry_account_mismatch_and_partial_page_block(self):
        for page in [FakePage([raw()], 1, password=True), FakePage([raw()], 1, account='wrong'), FakePage([raw()], 2), FakePage([raw()], 2, next_url='https://evil.example')]:
            with self.assertRaises(MonitorBlocked): await collect(page, config())

    async def test_repeated_pagination_never_yields_partial_success(self):
        with self.assertRaises(MonitorBlocked):
            await collect(FakePage([raw()], 3, next_url=config()['listing_url']), config())


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def attempt(self, handler):
        with tempfile.TemporaryDirectory() as d:
            db = Store(Path(d) / 'state.db'); db.ingest([normalize(raw(), config())], NOW, True)
            item = db.next_delivery(0)
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                try:
                    await deliver(db, item, client, 'fixture-only', {'chat_id': '-100123', 'topic_id': 9}, 100)
                except MonitorBlocked: pass
            row = dict(db.db.execute('SELECT * FROM outbox').fetchone()); db.close()
            return row

    async def test_topic_success_and_destination_mismatch(self):
        def handler(request):
            body = json.loads(request.content)
            self.assertEqual(body['message_thread_id'], 9)
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 10, 'message_thread_id': 9, 'chat': {'id': -100123}}})
        self.assertEqual((await self.attempt(handler))['state'], 'sent')
        row = await self.attempt(lambda _: httpx.Response(200, json={'ok': True, 'result': {'message_id': 10, 'chat': {'id': -100123}}}))
        self.assertEqual(row['state'], 'ambiguous')

    async def test_timeout_not_automatically_retried(self):
        def handler(_): raise httpx.ReadTimeout('fixture')
        self.assertEqual((await self.attempt(handler))['state'], 'ambiguous')

    async def test_rate_limit_honored_and_permanent_failure_stops(self):
        row = await self.attempt(lambda _: httpx.Response(429, json={'ok': False, 'parameters': {'retry_after': 120}}))
        self.assertEqual((row['state'], row['retry_at']), ('pending', 220))
        row = await self.attempt(lambda _: httpx.Response(403, json={'ok': False}))
        self.assertEqual(row['state'], 'failed')


if __name__ == '__main__': unittest.main()
