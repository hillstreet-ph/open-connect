from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, HttpUrl, model_validator


class Risk(StrEnum):
    READ = "read"
    DEVELOPMENT_WRITE = "development_write"
    PRODUCTION_WRITE = "production_write"
    DESTRUCTIVE = "destructive"


class SessionState(StrEnum):
    REQUESTED = "requested"
    READY = "ready"
    CLOSED = "closed"
    FAILED = "failed"


class Actor(BaseModel):
    actor_id: str
    tenant_id: str
    agent_id: str = "unknown-agent"
    roles: set[str] = Field(default_factory=set)


class SessionCreate(BaseModel):
    provider: Literal["e2b", "agent-browser", "openbrowser", "guacamole"]
    capability: Literal["terminal", "browser", "computer"]
    target: str = "workspace"
    risk: Risk = Risk.READ
    url: HttpUrl | None = None
    profile_ref: str | None = Field(default=None, pattern=r"^profile://[a-zA-Z0-9._/-]+$")


class Session(BaseModel):
    session_id: UUID = Field(default_factory=uuid4)
    tenant_id: str
    actor_id: str
    agent_id: str
    provider: str
    capability: str
    environment: str
    state: SessionState
    created_at: datetime
    expires_at: datetime
    profile_ref: str | None = None
    provider_handle: str | None = Field(default=None, exclude=True)


class BrowserActionType(StrEnum):
    NAVIGATE = "navigate"
    SNAPSHOT = "snapshot"
    CLICK = "click"
    FILL = "fill"
    SELECT = "select"
    PRESS = "press"
    SCROLL = "scroll"
    SCREENSHOT = "screenshot"
    LOAD_PROFILE = "load_profile"
    SAVE_PROFILE = "save_profile"
    LOGIN_HANDOFF = "login_handoff"


class BrowserAction(BaseModel):
    action: BrowserActionType
    element_ref: str | None = Field(default=None, max_length=256)
    value: str | None = Field(default=None, max_length=8000)
    url: HttpUrl | None = None
    credential_ref: str | None = Field(
        default=None, pattern=r"^vault://[a-zA-Z0-9._/-]+$"
    )
    profile_ref: str | None = Field(
        default=None, pattern=r"^profile://[a-zA-Z0-9._/-]+$"
    )

    @model_validator(mode="after")
    def validate_action_fields(self) -> "BrowserAction":
        if self.action == BrowserActionType.NAVIGATE and self.url is None:
            raise ValueError("navigate requires url")
        if self.action in {BrowserActionType.CLICK, BrowserActionType.FILL, BrowserActionType.SELECT}:
            if not self.element_ref:
                raise ValueError(f"{self.action} requires element_ref")
        if self.action in {BrowserActionType.FILL, BrowserActionType.SELECT, BrowserActionType.PRESS}:
            if self.value is None and self.credential_ref is None:
                raise ValueError(f"{self.action} requires value or credential_ref")
        if self.value is not None and self.credential_ref is not None:
            raise ValueError("value and credential_ref are mutually exclusive")
        if self.action in {BrowserActionType.LOAD_PROFILE, BrowserActionType.SAVE_PROFILE}:
            if self.profile_ref is None:
                raise ValueError(f"{self.action} requires profile_ref")
        return self

    @property
    def protected(self) -> bool:
        return bool(
            self.credential_ref
            or self.action
            in {
                BrowserActionType.LOAD_PROFILE,
                BrowserActionType.SAVE_PROFILE,
                BrowserActionType.LOGIN_HANDOFF,
            }
        )


class BrowserActionResult(BaseModel):
    action: BrowserActionType
    status: Literal["completed", "login_required", "approval_required"]
    url: HttpUrl | None = None
    text: str | None = None
    screenshot_ref: str | None = None
    handoff_url: HttpUrl | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class ApprovalRequest(BaseModel):
    action: str
    target: str
    environment: str
    risk: Risk
    parameters_digest: str


class AuditEvent(BaseModel):
    correlation_id: UUID
    timestamp: datetime
    tenant_id: str
    actor_id: str
    agent_id: str
    capability: str
    target: str
    environment: str
    result: str
    approval_id: UUID | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class AgentProvider(BaseModel):
    id: str
    display_name: str
    adapter: Literal["api", "mcp", "openai-compatible", "local-runtime"]
    status: Literal["ready", "authorization_required", "endpoint_required", "disabled"]
    credential_ref: str | None = None
    capabilities: list[str] = Field(default_factory=list)


class CollaborationTask(BaseModel):
    goal: str = Field(min_length=1, max_length=8000)
    project: str
    preferred_agents: list[str] = Field(default_factory=list)
    environment: Literal["development", "staging", "production"] = "development"
    schedule: str | None = None
    context_refs: list[str] = Field(default_factory=list)
