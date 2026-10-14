"""DOM-only adapter. Mapping is deployment-private and must be operator verified."""
import re
from urllib.parse import urlsplit, urljoin
from core import MonitorBlocked, normalize


def same_listing(url: str, configured: str) -> bool:
    a, b = urlsplit(url), urlsplit(configured)
    return (a.scheme, a.netloc, a.path) == (b.scheme, b.netloc, b.path) and not a.username and not a.password


def validate_config(c: dict):
    url = urlsplit(c.get('listing_url', ''))
    if url.scheme != 'https' or url.netloc != 'kobeplayhq.com' or url.username or url.password:
        raise MonitorBlocked('invalid_origin')
    if not c.get('mapping_verified') or c.get('listing_scope') != 'all-statuses':
        raise MonitorBlocked('mapping_not_verified')
    for key in ('expected_account', 'account_selector', 'ready_selector', 'empty_selector', 'rows_selector', 'total_selector', 'source_timezone'):
        if not isinstance(c.get(key), str) or not c[key].strip():
            raise MonitorBlocked('mapping_incomplete')
    from zoneinfo import ZoneInfo
    ZoneInfo(c['source_timezone'])
    fields = c.get('fields', {})
    for key in ('request_id', 'username', 'amount', 'currency', 'requested_at', 'status'):
        if not isinstance(fields.get(key), str) or not fields[key].strip():
            raise MonitorBlocked('mapping_incomplete')
    if not c.get('statuses') or any(v not in {'pending', 'approved', 'completed', 'rejected', 'cancelled', 'other'} for v in c['statuses'].values()):
        raise MonitorBlocked('invalid_status_mapping')
    if not 30 <= c.get('poll_seconds', 60) <= 3600:
        raise MonitorBlocked('invalid_poll_interval')
    if not 1 <= c.get('max_pages', 20) <= 100:
        raise MonitorBlocked('invalid_page_limit')
    if c.get('live_enabled'):
        if not c.get('destination_verified') or not re.fullmatch(r'-100\d+', str(c.get('chat_id', ''))):
            raise MonitorBlocked('destination_not_verified')
        if type(c.get('topic_id')) is not int or c['topic_id'] <= 0:
            raise MonitorBlocked('destination_not_verified')


async def assert_identity(page, c):
    if not same_listing(page.url, c['listing_url']):
        raise MonitorBlocked('login_or_redirect_required')
    if await page.locator('input[type=password]').count():
        raise MonitorBlocked('operator_login_required')
    try:
        account = await page.locator(c['account_selector']).inner_text(timeout=5000)
    except Exception as exc:
        raise MonitorBlocked('account_unverified') from exc
    if account.strip() != c['expected_account']:
        raise MonitorBlocked('account_mismatch')


async def collect(page, c):
    records, seen_urls, total = [], set(), None
    url = c['listing_url']
    for _ in range(c.get('max_pages', 20)):
        if not same_listing(url, c['listing_url']) or url in seen_urls:
            raise MonitorBlocked('unsafe_or_repeated_page')
        seen_urls.add(url)
        try:
            response = await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            if response and response.status in {401, 403, 429}:
                raise MonitorBlocked('source_access_blocked')
            await assert_identity(page, c)
            await page.locator(c['ready_selector']).wait_for(state='visible', timeout=15000)
            await assert_identity(page, c)
            text = (await page.locator(c['total_selector']).inner_text()).strip()
            if not re.fullmatch(r'\d+', text):
                raise MonitorBlocked('unverified_list_total')
            if total is not None and total != int(text):
                raise MonitorBlocked('list_changed_during_scan')
            total = int(text)
            if total > 10000:
                raise MonitorBlocked('list_too_large')
            rows = page.locator(c['rows_selector'])
            count = await rows.count()
            if not count and not (total == 0 and await page.locator(c['empty_selector']).is_visible()):
                raise MonitorBlocked('unverified_empty_list')
            for index in range(count):
                raw = {}
                for key, selector in c['fields'].items():
                    if selector:
                        raw[key] = (await rows.nth(index).locator(selector).inner_text(timeout=5000)).strip()
                records.append(normalize(raw, c))
            if len(records) == total:
                if len({r['request_id'] for r in records}) != len(records):
                    raise MonitorBlocked('duplicate_request_ids')
                await assert_identity(page, c)
                return records
            selector = c.get('next_page_selector')
            if not selector or not await page.locator(selector).is_visible():
                raise MonitorBlocked('incomplete_list')
            # Only follow a verified same-listing href. No clicks on arbitrary controls.
            href = await page.locator(selector).get_attribute('href')
            if not href:
                raise MonitorBlocked('pagination_requires_adapter')
            url = urljoin(url, href)
        except MonitorBlocked:
            raise
        except Exception as exc:
            raise MonitorBlocked('source_unavailable_or_mapping_changed') from exc
    raise MonitorBlocked('page_limit_exceeded')
