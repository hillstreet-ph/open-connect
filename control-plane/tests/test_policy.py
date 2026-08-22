import pytest
from fastapi import HTTPException
from app.models import Actor, Risk
from app.policy import authorize


def actor(*roles: str) -> Actor:
    return Actor(actor_id="u1", tenant_id="t1", agent_id="a1", roles=set(roles))


def test_read_is_allowed_for_authorized_actor() -> None:
    authorize(actor("developer"), "browser.create_session", "staging", Risk.READ)


def test_terminal_requires_developer_role() -> None:
    with pytest.raises(HTTPException) as exc:
        authorize(actor("user"), "terminal.exec", "staging", Risk.READ)
    assert exc.value.status_code == 403


def test_production_requires_approval() -> None:
    with pytest.raises(HTTPException) as exc:
        authorize(actor("operator"), "computer.create_session", "production", Risk.PRODUCTION_WRITE)
    assert exc.value.status_code == 409


def test_approval_requires_operator_role() -> None:
    with pytest.raises(HTTPException) as exc:
        authorize(actor("developer"), "computer.create_session", "production", Risk.PRODUCTION_WRITE, "approval")
    assert exc.value.status_code == 403
