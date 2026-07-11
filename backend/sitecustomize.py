"""Railway startup shim.

Background the expensive function/tool dependency installation during app startup
so Railway health checks can pass before long downloads finish.
"""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)

try:
    import open_webui.main as open_webui_main
except Exception as exc:  # pragma: no cover - best effort startup shim
    log.debug("sitecustomize could not import open_webui.main: %s", exc)
else:
    original_install = getattr(open_webui_main, "install_tool_and_function_dependencies", None)

    if original_install is not None:
        async def _install_tool_and_function_dependencies(*args, **kwargs):
            try:
                asyncio.create_task(original_install(*args, **kwargs))
            except RuntimeError:
                await original_install(*args, **kwargs)
            return None

        open_webui_main.install_tool_and_function_dependencies = _install_tool_and_function_dependencies
        log.info("Patched open_webui.main.install_tool_and_function_dependencies to run in background")
