from fastapi import HTTPException
from .models import Actor, Risk


def authorize(actor: Actor, capability: str, environment: str, risk: Risk, approval_id: str | None = None) -> None:
    if environment == "production" or risk in {Risk.PRODUCTION_WRITE, Risk.DESTRUCTIVE}:
        if not approval_id:
            raise HTTPException(status_code=409, detail="Explicit single-action approval required")
        if "operator" not in actor.roles and "owner" not in actor.roles:
            raise HTTPException(status_code=403, detail="Actor cannot consume production approval")
    if capability.startswith("terminal.") and not ({"developer", "operator", "owner"} & actor.roles):
        raise HTTPException(status_code=403, detail="Terminal capability is not authorized")
