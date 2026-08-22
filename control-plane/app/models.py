from datetime import datetime
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, HttpUrl


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
    provider_handle: str | None = Field(default=None, exclude=True)


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
