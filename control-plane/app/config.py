from functools import lru_cache
import re
from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OC_", env_file=".env", extra="ignore")

    environment: str = "staging"
    allow_production: bool = False
    public_base_url: AnyHttpUrl
    oidc_issuer: AnyHttpUrl
    oidc_audience: str = "authenticated"
    allowed_origins: str = ""
    e2b_credential_ref: str | None = None
    openbrowser_url: AnyHttpUrl | None = None
    openbrowser_credential_ref: str | None = None
    browser_worker_url: AnyHttpUrl | None = None
    browser_worker_credential_ref: str | None = None
    browser_profile_store_ref: str | None = None
    guacamole_url: AnyHttpUrl | None = None
    guacamole_credential_ref: str | None = None
    model_gateway_url: AnyHttpUrl | None = None
    model_gateway_credential_ref: str | None = None
    session_ttl_seconds: int = Field(default=1800, ge=60, le=14400)

    def assert_safe(self) -> None:
        if self.environment == "production" and not self.allow_production:
            raise RuntimeError(
                "Production startup requires OC_ALLOW_PRODUCTION=true in the deployment secret store"
            )
        # These are opaque broker references, never credentials or URLs to fetch.
        # Match the BrowserAction vault-reference character contract in models.py.
        # Preserve empty/unset values for disabled, optional integrations.
        reference_fields = (
            "e2b_credential_ref",
            "openbrowser_credential_ref",
            "browser_worker_credential_ref",
            "browser_profile_store_ref",
            "guacamole_credential_ref",
            "model_gateway_credential_ref",
        )
        for field in reference_fields:
            reference = getattr(self, field)
            if reference and re.fullmatch(r"vault://[a-zA-Z0-9._/-]+", reference) is None:
                # Do not include the supplied value: it may be a pasted secret.
                raise RuntimeError(
                    f"{field} must contain a vault:// reference with a nonempty opaque path"
                )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()  # type: ignore[call-arg]
    settings.assert_safe()
    return settings
