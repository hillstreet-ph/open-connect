from functools import lru_cache
from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="OC_", env_file=".env", extra="ignore")

    environment: str = "staging"
    public_base_url: AnyHttpUrl
    oidc_issuer: AnyHttpUrl
    oidc_audience: str = "authenticated"
    allowed_origins: str = ""
    e2b_credential_ref: str | None = None
    openbrowser_url: AnyHttpUrl | None = None
    openbrowser_credential_ref: str | None = None
    guacamole_url: AnyHttpUrl | None = None
    guacamole_credential_ref: str | None = None
    model_gateway_url: AnyHttpUrl | None = None
    model_gateway_credential_ref: str | None = None
    session_ttl_seconds: int = Field(default=1800, ge=60, le=14400)

    def assert_safe(self) -> None:
        if self.environment == "production":
            raise RuntimeError("Production startup requires an explicit deployment override")
        refs = [
            self.e2b_credential_ref,
            self.openbrowser_credential_ref,
            self.guacamole_credential_ref,
            self.model_gateway_credential_ref,
        ]
        if any(ref and not ref.startswith("vault://") for ref in refs):
            raise RuntimeError("Credential settings must contain vault:// references only")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()  # type: ignore[call-arg]
    settings.assert_safe()
    return settings
