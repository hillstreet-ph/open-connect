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


REFERENCE_FIELDS = (
    "e2b_credential_ref",
    "openbrowser_credential_ref",
    "browser_worker_credential_ref",
    "browser_profile_store_ref",
    "guacamole_credential_ref",
    "model_gateway_credential_ref",
)


@pytest.mark.parametrize("field", REFERENCE_FIELDS)
@pytest.mark.parametrize(
    "reference",
    [None, "", "vault://models/chatgpt", "vault://team-1/browser_profile.v2/key"],
)
def test_all_optional_broker_references_allow_valid_or_disabled_values(
    field: str, reference: str | None
) -> None:
    settings(**{field: reference}).assert_safe()


@pytest.mark.parametrize("field", REFERENCE_FIELDS)
@pytest.mark.parametrize(
    "reference",
    [
        "vault://",
        "plain-text-secret-do-not-log",
        "https://vault.example/key",
        "credential://models/chatgpt",
        "VAULT://models/key",
        " vault://models/key",
        "vault://models/key ",
        "vault://models/key\n",
        "vault://models/\nkey",
        "vault://models/key\r",
        "vault://models/\tkey",
        "vault://models/key?token=do-not-log",
        "vault://models/key#fragment",
        "vault://models/%2Fkey",
        "vault://models/key@host",
        "vault://models/clé",
    ],
)
def test_all_broker_references_reject_malformed_values_without_disclosure(
    field: str, reference: str
) -> None:
    with pytest.raises(RuntimeError) as error:
        settings(**{field: reference}).assert_safe()
    message = str(error.value)
    assert field in message
    assert "vault:// reference" in message
    assert reference not in message
    assert "do-not-log" not in message


def test_cached_settings_validate_environment_reference(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("OC_PUBLIC_BASE_URL", "https://control.open-connect.site")
    monkeypatch.setenv("OC_OIDC_ISSUER", "https://example.supabase.co/auth/v1")
    monkeypatch.setenv("OC_ENVIRONMENT", "staging")
    monkeypatch.setenv("OC_MODEL_GATEWAY_CREDENTIAL_REF", "vault://models/key?bad=1")
    try:
        with pytest.raises(RuntimeError, match="model_gateway_credential_ref"):
            get_settings()
    finally:
        get_settings.cache_clear()
