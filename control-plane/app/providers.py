from abc import ABC, abstractmethod
from dataclasses import dataclass
from importlib.util import find_spec
from shutil import which
import httpx
from .config import Settings
from .models import SessionCreate


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
    async def available(self) -> tuple[bool, str]:
        ok = which("agent-browser") is not None
        return ok, "installed" if ok else "agent-browser CLI not installed"
    async def create(self, request: SessionCreate) -> ProviderResult:
        raise ProviderUnavailable("agent-browser worker execution is disabled until an isolated worker broker is configured")
    async def close(self, handle: str) -> None: return None


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
        "agent-browser": AgentBrowserProvider(),
        "openbrowser": OpenBrowserProvider(settings),
        "guacamole": GuacamoleProvider(settings),
    }
