from functools import lru_cache
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from .config import Settings, get_settings
from .models import Actor

bearer = HTTPBearer(auto_error=True)


@lru_cache(maxsize=4)
def jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(f"{issuer.rstrip('/')}/.well-known/jwks.json")


def current_actor(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Actor:
    try:
        key = jwks_client(str(settings.oidc_issuer)).get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.oidc_audience,
            issuer=str(settings.oidc_issuer).rstrip("/"),
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid identity token") from exc
    tenant_id = claims.get("app_metadata", {}).get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Token lacks tenant binding")
    return Actor(
        actor_id=claims["sub"],
        tenant_id=tenant_id,
        agent_id=claims.get("agent_id", "user-agent"),
        roles=set(claims.get("app_metadata", {}).get("roles", [])),
    )
