"""
id: open_connect_bootstrap
name: Open Connect Bootstrap Helper
description: Safe deployment diagnostics for the Open Connect workspace bootstrap.
category: deployment
source: local
version: 1.0.0
"""

from __future__ import annotations

import os


class Tools:
    """Safe deployment diagnostics for Open Connect."""

    def bootstrap_status(self) -> str:
        """Summarize the presence of core deployment env vars without revealing secret values."""
        checks = {
            'OPEN_CONNECT_BASE_URL': bool(os.getenv('OPEN_CONNECT_BASE_URL')),
            'OPEN_CONNECT_API_KEY': bool(os.getenv('OPEN_CONNECT_API_KEY')),
            'SUPABASE_URL': bool(os.getenv('SUPABASE_URL')),
            'REDIS_URL': bool(os.getenv('REDIS_URL')),
            'WEBUI_URL': bool(os.getenv('WEBUI_URL')),
        }
        missing = [name for name, present in checks.items() if not present]
        if missing:
            return 'Open Connect bootstrap helper loaded. Missing env vars: ' + ', '.join(missing)
        return 'Open Connect bootstrap helper loaded. Core deployment env vars are present.'

    def setup_checklist(self) -> str:
        """Return the remaining manual setup checklist for a fresh deployment."""
        return (
            '1. Add secrets through Railway and Supabase secret managers, not git.\n'
            '2. Confirm the Railway health check and startup command are aligned.\n'
            '3. Verify the bootstrap owner env vars are set for workspace seeding.\n'
            '4. Recheck /health and /ready after deploy.'
        )
