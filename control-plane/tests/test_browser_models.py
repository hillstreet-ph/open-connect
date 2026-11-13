import pytest
from pydantic import ValidationError

from app.models import BrowserAction, BrowserActionType, SessionCreate


def test_navigate_requires_url() -> None:
    with pytest.raises(ValidationError):
        BrowserAction(action=BrowserActionType.NAVIGATE)


def test_fill_accepts_opaque_credential_reference() -> None:
    action = BrowserAction(
        action=BrowserActionType.FILL,
        element_ref="@password",
        credential_ref="vault://apps/github/master-kanor/password",
    )
    assert action.protected is True
    assert action.value is None


def test_raw_and_brokered_values_are_mutually_exclusive() -> None:
    with pytest.raises(ValidationError):
        BrowserAction(
            action=BrowserActionType.FILL,
            element_ref="@password",
            value="plaintext",
            credential_ref="vault://apps/example/password",
        )


def test_profile_reference_is_opaque() -> None:
    request = SessionCreate(
        provider="agent-browser",
        capability="browser",
        profile_ref="profile://github/master-kanor/staging",
    )
    assert request.profile_ref.startswith("profile://")


def test_profile_action_requires_reference() -> None:
    with pytest.raises(ValidationError):
        BrowserAction(action=BrowserActionType.LOAD_PROFILE)
