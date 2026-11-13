"""One isolated browser profile per project/account/environment; no public server."""
import argparse
import asyncio
import fcntl
import json
import os
import signal
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
import httpx

from core import MonitorBlocked, Store
from delivery import deliver, read_token
from source import assert_identity, collect, validate_config


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def write_health(data_dir: Path, state: str, reason: str = '', counts=None):
    # No player data, URL, screenshots, browser state, tokens, or exception text.
    output = {'state': state, 'reason': reason, 'checked_at': now_iso(), 'delivery_counts': counts or {}}
    temp = data_dir / 'health.tmp'
    temp.write_text(json.dumps(output))
    os.replace(temp, data_dir / 'health.json')
    print(json.dumps({'state': state, 'reason': reason}), flush=True)


def acquire_lock(data_dir: Path):
    data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    handle = (data_dir / 'worker.lock').open('a')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise MonitorBlocked('profile_already_in_use') from None
    return handle


def healthy(health: dict, runtime_only: bool = False) -> bool:
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(health['checked_at'])).total_seconds()
    states = {'monitoring', 'dry_run'}
    if runtime_only:
        states.add('standby')
    return health['state'] in states and 0 <= age <= 180


async def prepare_runtime(data_dir: Path, standby: bool):
    """Test this host using a disposable blank browser; never load site credentials."""
    if os.geteuid() == 0:
        raise MonitorBlocked('non_root_runtime_required')
    from playwright.async_api import async_playwright
    lock = acquire_lock(data_dir)
    try:
        with tempfile.TemporaryDirectory(prefix='preflight-', dir=data_dir) as directory:
            async with async_playwright() as engine:
                context = await engine.chromium.launch_persistent_context(
                    directory, headless=True, chromium_sandbox=True,
                    accept_downloads=False, service_workers='block',
                )
                try:
                    page = context.pages[0] if context.pages else await context.new_page()
                    await page.goto('about:blank')
                    if await page.evaluate('1 + 1') != 2:
                        raise MonitorBlocked('browser_preflight_failed')
                finally:
                    await context.close()
        if not standby:
            write_health(data_dir, 'runtime_verified', 'monitor_not_started')
            return
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, stop.set)
        while not stop.is_set():
            write_health(data_dir, 'standby', 'operator_setup_required')
            try:
                await asyncio.wait_for(stop.wait(), timeout=60)
            except TimeoutError:
                # Refresh the runtime heartbeat without accessing the backend.
                continue
        write_health(data_dir, 'stopped', 'operator_setup_required')
    finally:
        lock.close()


async def run(config, data_dir: Path, mode: str, secret_file: Path):
    validate_config(config)
    from playwright.async_api import async_playwright
    lock = acquire_lock(data_dir)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)
    store = Store(data_dir / 'monitor.sqlite3')
    try:
        async with async_playwright() as engine:
            context = await engine.chromium.launch_persistent_context(
                str(data_dir / 'profile'), headless=mode != 'login',
                chromium_sandbox=True, accept_downloads=False,
                service_workers='block',
            )
            try:
                page = context.pages[0] if context.pages else await context.new_page()
                page.set_default_timeout(5000)
                if mode == 'login':
                    # A human types in the provider's protected operator desktop.
                    # No password arguments, autofill, cookie import/export, or screenshot API.
                    await page.goto('https://kobeplayhq.com', wait_until='domcontentloaded')
                    write_health(data_dir, 'operator_login_required')
                    print('Use the protected desktop to sign in and open the configured listing. Press Enter here when ready.', flush=True)
                    await asyncio.to_thread(input)
                    await assert_identity(page, config)
                    await collect(page, config)
                    (data_dir / 'profile-verified').write_text(now_iso())
                    write_health(data_dir, 'profile_verified')
                    return
                if not (data_dir / 'profile-verified').is_file():
                    raise MonitorBlocked('operator_login_required')
                token = read_token(secret_file) if config.get('live_enabled') else ''
                async with httpx.AsyncClient(timeout=20, follow_redirects=False, trust_env=False) as client:
                    while not stop.is_set():
                        # A failed scan creates no source updates and no false zero count.
                        try:
                            records = await collect(page, config)
                            store.ingest(records, now_iso(), bool(config.get('live_enabled')))
                            if config.get('live_enabled'):
                                if store.counts().get('ambiguous') or store.counts().get('failed'):
                                    raise MonitorBlocked('delivery_requires_reconciliation')
                                while not stop.is_set() and (item := store.next_delivery(time.time())):
                                    sent = await deliver(store, item, client, token, config, time.time())
                                    if not sent:
                                        break
                                    await asyncio.sleep(1.1)
                            write_health(data_dir, 'monitoring' if config.get('live_enabled') else 'dry_run', counts=store.counts())
                        except MonitorBlocked as exc:
                            # No automatic relogin, bypass, or infinite access retries.
                            write_health(data_dir, 'blocked', str(exc), store.counts())
                            return
                        if mode == 'check':
                            return
                        try:
                            await asyncio.wait_for(stop.wait(), timeout=config.get('poll_seconds', 60))
                        except TimeoutError:
                            # The polling interval elapsed; collect the next snapshot.
                            continue
            finally:
                await context.close()
    finally:
        store.close()
        lock.close()


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['run', 'check', 'login', 'health', 'preflight', 'standby'])
    parser.add_argument('--runtime-only', action='store_true', help='Health only: accept standby; does not prove monitoring')
    parser.add_argument('--config', type=Path, default=Path('/run/config/monitor.json'))
    parser.add_argument('--data-dir', type=Path, default=Path('/data'))
    parser.add_argument('--telegram-secret-file', type=Path, default=Path('/run/secrets/telegram_bot_token'))
    args = parser.parse_args()
    try:
        if args.mode == 'health':
            health = json.loads((args.data_dir / 'health.json').read_text())
            raise SystemExit(0 if healthy(health, args.runtime_only) else 1)
        if args.mode in {'preflight', 'standby'}:
            asyncio.run(prepare_runtime(args.data_dir, args.mode == 'standby'))
            return 0
        config = json.loads(args.config.read_text())
        if args.mode == 'check':
            config['live_enabled'] = False
        asyncio.run(run(config, args.data_dir, args.mode, args.telegram_secret_file))
    except (MonitorBlocked, OSError, ValueError, KeyError) as exc:
        code = str(exc) if isinstance(exc, MonitorBlocked) else 'configuration_or_runtime_unavailable'
        if code == 'profile_already_in_use':
            # A rejected second process must not overwrite the active worker's health.
            print(json.dumps({'state': 'blocked', 'reason': code}), flush=True)
            return 1
        args.data_dir.mkdir(parents=True, exist_ok=True)
        write_health(args.data_dir, 'blocked', code)
        return 1
    except Exception:
        # Provider exceptions may contain request URLs or DOM text. Never log them.
        write_health(args.data_dir, 'blocked', 'browser_runtime_unavailable')
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
