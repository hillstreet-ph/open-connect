from abc import ABC, abstractmethod
from dataclasses import dataclass
from importlib.util import find_spec
import httpx
from .config import Settings
from .models import BrowserAction, BrowserActionResult, SessionCreate


class ProviderUnavailable(RuntimeError):
    pass


@dataclass
class ProviderResult:
    handle: str
    evidence: dict[str, str]


class RuntimeProvider(ABC):
    name: str

    @abstractmethod
    async def available(self) -> tuple[bool, str]: ...

    @abstractmethod
    async def create(self, request: SessionCreate) -> ProviderResult: ...

    @abstractmethod
    async def close(self, handle: str) -> None: ...

    async def act(self, handle: str, action: BrowserAction) -> BrowserActionResult:
        raise ProviderUnavailable(f"{self.name} does not support browser actions")


class E2BProvider(RuntimeProvider):
    name = "e2b"
    def __init__(self, settings: Settings): self.settings = settings
    async def available(self) -> tuple[bool, str]:
        ok = bool(self.settings.e2b_credential_ref and find_spec("e2b"))
        return ok, "configured" if ok else "requires vault binding and e2b SDK"
    async def create(self, request: SessionCreate) -> ProviderResult:
        raise ProviderUnavailable("E2B vault resolution must be supplied by the deployed secret broker")
    async def close(self, handle: str) -> None: return None


class AgentBrowserProvider(RuntimeProvider):
    name = "agent-browser"
    def __init__(self, settings: Settings): self.settings = settings
    async def available(self) -> tuple[bool, str]:
        ok = bool(self.settings.browser_worker_url and self.settings.browser_worker_credential_ref)
        return ok, "worker broker configured" if ok else "isolated browser worker and vault binding required"
    async def create(self, request: SessionCreate) -> ProviderResult:
        payload = {
            "capability": request.capability,
            "target": request.target,
            "url": str(request.url) if request.url else None,
            "profile_ref": request.profile_ref,
        }
        result = await self._request("POST", "/v1/sessions", json=payload)
        return ProviderResult(
            handle=str(result["session_id"]),
            evidence={"provider": self.name, "brokered": "true"},
        )
    async def act(self, handle: str, action: BrowserAction) -> BrowserActionResult:
        result = await self._request(
            "POST", f"/v1/sessions/{handle}/actions", json=action.model_dump(mode="json", exclude_none=True)
        )
        return BrowserActionResult.model_validate(result)
    async def close(self, handle: str) -> None:
        await self._request("DELETE", f"/v1/sessions/{handle}")
    async def _request(self, method: str, path: str, **kwargs) -> dict:
        if not self.settings.browser_worker_url or not self.settings.browser_worker_credential_ref:
            raise ProviderUnavailable("browser worker is not configured")
        headers = {"X-Credential-Reference": self.settings.browser_worker_credential_ref}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.request(
                    method,
                    f"{str(self.settings.browser_worker_url).rstrip('/')}{path}",
                    headers=headers,
                    **kwargs,
                )
            response.raise_for_status()
            return response.json() if response.content else {}
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise ProviderUnavailable("isolated browser worker request failed") from exc


class OpenBrowserProvider(RuntimeProvider):
    name = "openbrowser"
    def __init__(self, settings: Settings): self.settings = settings
    async def available(self) -> tuple[bool, str]:
        if not self.settings.openbrowser_url or not self.settings.openbrowser_credential_ref:
            return False, "endpoint and vault binding required"
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                response = await client.get(f"{str(self.settings.openbrowser_url).rstrip('/')}/health")
            return response.is_success, f"health={response.status_code}"
        except httpx.HTTPError:
            return False, "health check failed"
    async def create(self, request: SessionCreate) -> ProviderResult:
        raise ProviderUnavailable("OpenBrowser invocation requires the deployed secret broker adapter")
    async def close(self, handle: str) -> None: return None


class GuacamoleProvider(RuntimeProvider):
    name = "guacamole"
    def __init__(self, settings: Settings): self.settings = settings
    async def available(self) -> tuple[bool, str]:
        ok = bool(self.settings.guacamole_url and self.settings.guacamole_credential_ref)
        return ok, "configured" if ok else "operator console endpoint and vault binding required"
    async def create(self, request: SessionCreate) -> ProviderResult:
        raise ProviderUnavailable("Guacamole connection brokering requires an approved server-side adapter")
    async def close(self, handle: str) -> None: return None


def providers(settings: Settings) -> dict[str, RuntimeProvider]:
    return {
        "e2b": E2BProvider(settings),
        "agent-browser": AgentBrowserProvider(settings),
        "openbrowser": OpenBrowserProvider(settings),
        "guacamole": GuacamoleProvider(settings),
    }
