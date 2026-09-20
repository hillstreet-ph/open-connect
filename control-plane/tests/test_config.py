import pytest

from app.config import Settings


def settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "public_base_url": "https://control.open-connect.site",
        "oidc_issuer": "https://example.supabase.co/auth/v1",
    }
    values.update(overrides)
    return Settings(**values)


def test_staging_is_allowed_by_default() -> None:
    settings().assert_safe()


def test_production_requires_explicit_opt_in() -> None:
    with pytest.raises(RuntimeError, match="OC_ALLOW_PRODUCTION=true"):
        settings(environment="production").assert_safe()


def test_production_accepts_explicit_opt_in() -> None:
    settings(environment="production", allow_production=True).assert_safe()


def test_credential_refs_must_use_vault_scheme() -> None:
    with pytest.raises(RuntimeError, match="vault://"):
        settings(e2b_credential_ref="plain-text-secret").assert_safe()
