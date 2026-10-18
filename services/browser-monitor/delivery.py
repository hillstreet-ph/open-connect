"""Telegram transport; token comes from a mounted runtime secret, never source/config."""
import re
from pathlib import Path
import httpx
from core import MonitorBlocked


def read_token(path: Path) -> str:
    token = path.read_text().strip()
    if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}', token):
        raise MonitorBlocked('invalid_telegram_secret')
    return token


async def deliver(store, item, client, token: str, config: dict, now: float):
    try:
        response = await client.post(
            f'https://api.telegram.org/bot{token}/sendMessage',
            json={
                'chat_id': config['chat_id'], 'message_thread_id': config['topic_id'],
                'text': item['body'], 'link_preview_options': {'is_disabled': True},
            },
        )
    except httpx.TransportError:
        store.settle(item['id'], 'ambiguous', reason='transport_outcome_unknown')
        raise MonitorBlocked('delivery_requires_reconciliation') from None
    try:
        data = response.json()
    except (ValueError, TypeError):
        store.settle(item['id'], 'ambiguous', reason='invalid_provider_response')
        raise MonitorBlocked('delivery_requires_reconciliation') from None
    if response.status_code == 429 and isinstance(data, dict) and data.get('ok') is False:
        try:
            delay = min(86400, max(1, int(data.get('parameters', {}).get('retry_after', 60))))
        except (TypeError, ValueError):
            delay = 60
        if item['attempts'] >= 5:
            store.settle(item['id'], 'failed', reason='retry_limit')
            raise MonitorBlocked('delivery_retry_limit')
        store.settle(item['id'], 'pending', reason='rate_limited', retry_at=now + delay)
        return False
    if not isinstance(data, dict) or data.get('ok') is not True:
        # 5xx can be delivered-but-response-lost; never assume safe retry.
        ambiguous = response.status_code >= 500 or not isinstance(data, dict)
        store.settle(item['id'], 'ambiguous' if ambiguous else 'failed', reason='provider_rejected_or_unknown')
        raise MonitorBlocked('delivery_requires_reconciliation')
    result = data.get('result', {})
    if (str(result.get('chat', {}).get('id')) != str(config['chat_id'])
            or result.get('message_thread_id') != config['topic_id']
            or type(result.get('message_id')) is not int):
        store.settle(item['id'], 'ambiguous', reason='destination_mismatch')
        raise MonitorBlocked('delivery_destination_mismatch')
    store.settle(item['id'], 'sent', message_id=result['message_id'])
    return True
