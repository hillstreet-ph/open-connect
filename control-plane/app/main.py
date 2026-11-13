from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .auth import current_actor
from .config import Settings, get_settings
from .models import (
    Actor,
    AgentProvider,
    AuditEvent,
    BrowserAction,
    BrowserActionResult,
    CollaborationTask,
    Risk,
    Session,
    SessionCreate,
    SessionState,
)
from .policy import authorize
from .providers import ProviderUnavailable, providers

app = FastAPI(title="Open-Connect Control", version="0.1.0")
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in settings.allowed_origins.split(",") if o],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Approval-ID", "X-Correlation-ID"],
)

sessions: dict[UUID, Session] = {}
audit_events: list[AuditEvent] = []

AGENT_PROVIDERS = [
    AgentProvider(
        id="chatgpt", display_name="ChatGPT", adapter="api",
        status="authorization_required", credential_ref="vault://models/chatgpt",
        capabilities=["reasoning", "coding", "tools"],
    ),
    AgentProvider(
        id="claude", display_name="Claude Code / Cowork", adapter="api",
        status="authorization_required", credential_ref="vault://models/claude",
        capabilities=["reasoning", "coding"],
    ),
    AgentProvider(
        id="grok", display_name="Grok", adapter="api",
        status="authorization_required", credential_ref="vault://models/grok",
        capabilities=["reasoning", "research"],
    ),
    AgentProvider(
        id="mistral", display_name="Mistral", adapter="openai-compatible",
        status="authorization_required", credential_ref="vault://models/mistral",
        capabilities=["reasoning", "coding"],
    ),
    AgentProvider(
        id="kimi", display_name="Kimi", adapter="openai-compatible",
        status="authorization_required", credential_ref="vault://models/kimi",
        capabilities=["reasoning", "long-context"],
    ),
    AgentProvider(
        id="manus", display_name="Manus", adapter="api",
        status="endpoint_required", credential_ref="vault://agents/manus",
        capabilities=["browser", "workflow"],
    ),
    AgentProvider(
        id="hermes", display_name="Hermes / Open-System", adapter="local-runtime",
        status="endpoint_required", credential_ref="vault://agents/hermes",
        capabilities=["planning", "routing", "workers", "review"],
    ),
]


@app.get("/")
async def readiness() -> dict[str, str]:
    """Serve the provider startup probe without exposing protected state."""
    return {"status": "ok", "service": "open-connect-control"}


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/v1/capabilities")
async def capabilities(actor: Annotated[Actor, Depends(current_actor)]) -> dict:
    discovered = {}
    for name, provider in providers(settings).items():
        available, reason = await provider.available()
        discovered[name] = {"available": available, "reason": reason}
    return {"environment": settings.environment, "actor": actor.actor_id, "providers": discovered}


@app.get("/api/v1/agents", response_model=list[AgentProvider])
async def agent_registry(actor: Annotated[Actor, Depends(current_actor)]) -> list[AgentProvider]:
    """Return non-secret provider metadata for the authenticated workspace."""
    return AGENT_PROVIDERS


@app.post("/api/v1/collaborations/plan")
async def plan_collaboration(
    request: CollaborationTask,
    actor: Annotated[Actor, Depends(current_actor)],
) -> dict:
    """Create a deterministic, auditable plan without executing provider actions."""
    selected = request.preferred_agents or ["chatgpt", "claude", "hermes"]
    known = {provider.id for provider in AGENT_PROVIDERS}
    unknown = sorted(set(selected) - known)
    if unknown:
        raise HTTPException(status_code=422, detail={"unknown_agents": unknown})
    return {
        "goal": request.goal,
        "project": request.project,
        "environment": request.environment,
        "schedule": request.schedule,
        "context_refs": request.context_refs,
        "workflow": [
            {"stage": "plan", "agent": selected[0]},
            {"stage": "implement", "agents": selected},
            {"stage": "review", "agent": "hermes" if "hermes" in selected else selected[-1]},
            {"stage": "verify", "agent": selected[0]},
        ],
        "execution_state": "planned",
        "approval_required_before_production": request.environment == "production",
        "actor": actor.actor_id,
    }


@app.post("/api/v1/sessions", response_model=Session)
async def create_session(
    request: SessionCreate,
    actor: Annotated[Actor, Depends(current_actor)],
    approval_id: Annotated[str | None, Header(alias="X-Approval-ID")] = None,
    correlation_id: Annotated[UUID | None, Header(alias="X-Correlation-ID")] = None,
) -> Session:
    correlation_id = correlation_id or uuid4()
    capability = f"{request.capability}.create_session"
    authorize(actor, capability, settings.environment, request.risk, approval_id)
    provider = providers(settings)[request.provider]
    available, reason = await provider.available()
    if not available:
        raise HTTPException(status_code=503, detail=f"Provider unavailable: {reason}")
    try:
        result = await provider.create(request)
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    now = datetime.now(UTC)
    session = Session(
        tenant_id=actor.tenant_id,
        actor_id=actor.actor_id,
        agent_id=actor.agent_id,
        provider=request.provider,
        capability=request.capability,
        environment=settings.environment,
        state=SessionState.READY,
        created_at=now,
        expires_at=now + timedelta(seconds=settings.session_ttl_seconds),
        profile_ref=request.profile_ref,
        provider_handle=result.handle,
    )
    sessions[session.session_id] = session
    audit_events.append(AuditEvent(
        correlation_id=correlation_id, timestamp=now, tenant_id=actor.tenant_id,
        actor_id=actor.actor_id, agent_id=actor.agent_id, capability=capability,
        target=request.target, environment=settings.environment, result="created",
        approval_id=UUID(approval_id) if approval_id else None, evidence=result.evidence,
    ))
    return session


@app.post("/api/v1/sessions/{session_id}/actions", response_model=BrowserActionResult)
async def execute_browser_action(
    session_id: UUID,
    request: BrowserAction,
    actor: Annotated[Actor, Depends(current_actor)],
    approval_id: Annotated[str | None, Header(alias="X-Approval-ID")] = None,
    correlation_id: Annotated[UUID | None, Header(alias="X-Correlation-ID")] = None,
) -> BrowserActionResult:
    session = sessions.get(session_id)
    if not session or session.tenant_id != actor.tenant_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.actor_id != actor.actor_id and not ({"operator", "owner"} & actor.roles):
        raise HTTPException(status_code=403, detail="Session is owned by another actor")
    if session.state != SessionState.READY:
        raise HTTPException(status_code=409, detail="Session is not ready")
    now = datetime.now(UTC)
    if now >= session.expires_at:
        session.state = SessionState.CLOSED
        raise HTTPException(status_code=410, detail="Session expired")
    if session.capability not in {"browser", "computer"} or not session.provider_handle:
        raise HTTPException(status_code=422, detail="Session does not support browser actions")

    risk = Risk.PRODUCTION_WRITE if request.protected else Risk.DEVELOPMENT_WRITE
    authorize(actor, f"browser.{request.action}", settings.environment, risk, approval_id)
    try:
        result = await providers(settings)[session.provider].act(session.provider_handle, request)
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    audit_events.append(AuditEvent(
        correlation_id=correlation_id or uuid4(), timestamp=now,
        tenant_id=actor.tenant_id, actor_id=actor.actor_id, agent_id=actor.agent_id,
        capability=f"browser.{request.action}", target=str(request.url or request.element_ref or "session"),
        environment=settings.environment, result=result.status,
        approval_id=UUID(approval_id) if approval_id else None,
        evidence={"provider": session.provider, "session_id": str(session_id)},
    ))
    return result


@app.delete("/api/v1/sessions/{session_id}", response_model=Session)
async def close_session(session_id: UUID, actor: Annotated[Actor, Depends(current_actor)]) -> Session:
    session = sessions.get(session_id)
    if not session or session.tenant_id != actor.tenant_id:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.actor_id != actor.actor_id and not ({"operator", "owner"} & actor.roles):
        raise HTTPException(status_code=403, detail="Session is owned by another actor")
    if session.provider_handle:
        await providers(settings)[session.provider].close(session.provider_handle)
    session.state = SessionState.CLOSED
    return session
