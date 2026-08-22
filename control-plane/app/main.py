from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID, uuid4
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .auth import current_actor
from .config import Settings, get_settings
from .models import Actor, AuditEvent, Session, SessionCreate, SessionState
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
