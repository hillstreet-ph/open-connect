"""
id: open_connect_pipeline
name: Open Connect Pipeline
description: Forwards Open WebUI chat requests to the Open Connect backend.
category: integration
source: local
version: 1.0.0
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

from fastapi import HTTPException

log = logging.getLogger(__name__)


class Pipe:
    class Valves:
        def __init__(self):
            self.OPEN_CONNECT_BASE_URL: str = os.getenv('OPEN_CONNECT_BASE_URL', 'http://localhost:8080')
            self.OPEN_CONNECT_API_KEY: str = os.getenv('OPEN_CONNECT_API_KEY', '')
            self.MODEL: str = os.getenv('OPEN_CONNECT_MODEL', 'open-connect')
            self.SYSTEM_PROMPT: str = os.getenv('OPEN_CONNECT_SYSTEM_PROMPT', '')
            self.TIMEOUT_SECONDS: int = int(os.getenv('OPEN_CONNECT_TIMEOUT_SECONDS', '300'))

    def __init__(self):
        self.name = 'Open Connect'
        self.valves = self.Valves()

    async def inlet(self, body: Dict[str, Any]) -> Dict[str, Any]:
        messages = body.get('messages', [])
        if self.valves.SYSTEM_PROMPT and not any(message.get('role') == 'system' for message in messages):
            messages = [{'role': 'system', 'content': self.valves.SYSTEM_PROMPT}, *messages]
        body['messages'] = messages
        body.setdefault('model', self.valves.MODEL)
        return body

    async def pipe(
        self,
        body: Dict[str, Any],
        __user__: Dict[str, Any] = None,
        __AI__: Any = None,
        __context__: Dict[str, Any] = None,
    ) -> str:
        try:
            import aiohttp

            payload = await self.inlet(body)
            base_url = self.valves.OPEN_CONNECT_BASE_URL.rstrip('/')
            url = f'{base_url}/api/v1/chat/completions'
            headers = {'Content-Type': 'application/json'}
            if self.valves.OPEN_CONNECT_API_KEY:
                headers['Authorization'] = f'Bearer {self.valves.OPEN_CONNECT_API_KEY}'

            timeout = aiohttp.ClientTimeout(total=self.valves.TIMEOUT_SECONDS)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, json=payload, headers=headers) as resp:
                    if resp.status != 200:
                        error = await resp.text()
                        raise HTTPException(status_code=resp.status, detail=error)

                    data = await resp.json()
                    choices = data.get('choices') or []
                    if choices and choices[0].get('message'):
                        return choices[0]['message'].get('content', '')
                    return ''
        except Exception as exc:
            log.error('Open Connect pipeline error: %s', exc)
            raise HTTPException(status_code=500, detail=str(exc))
