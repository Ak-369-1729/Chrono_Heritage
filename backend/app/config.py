"""Environment-based configuration. No secrets are hard-coded."""

from __future__ import annotations

import functools
import secrets
import warnings
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CHRONO_", env_file=".env", extra="ignore")

    env: str = Field("development", description="development | test | production")
    database_url: str = Field("postgresql+psycopg://chrono:chrono_dev@localhost:5432/chronoheritage")
    secret_key: str | None = None
    token_ttl_hours: int = 12
    artifact_dir: Path = Path("./artifacts")
    cors_origins: list[str] = []
    cookie_secure: bool = False
    horizons_enabled: bool = True
    horizons_timeout_s: float = 20.0
    max_upload_bytes: int = 5 * 1024 * 1024
    default_mc_samples: int = 10_000
    registration_mode: Literal["open", "approval", "closed"] = Field(
        "open", description="open: new researcher accounts are active at once; approval: an administrator activates "
                            "every new account; closed: no public sign-up. Privileged roles always need approval.")
    max_active_jobs_per_user: int = Field(3, description="Queued or running jobs allowed per non-admin user")
    register_limit_per_hour: int = Field(10, description="Sign-ups allowed per client address per hour")
    login_limit_per_5min: int = Field(10, description="Sign-in attempts per client address and email per 5 minutes")
    run_jobs_inline: bool = Field(True, description="Run jobs in the API process when no worker is deployed")
    log_level: str = "INFO"

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    def resolved_secret(self) -> str:
        if self.secret_key and not self.secret_key.startswith("change-me"):
            return self.secret_key
        if self.secret_key and self.is_production:
            raise RuntimeError("CHRONO_SECRET_KEY still has the placeholder value from .env.example.")
        if self.is_production:
            raise RuntimeError("CHRONO_SECRET_KEY must be set in production.")
        return _ephemeral_secret()


@functools.lru_cache(maxsize=1)
def _ephemeral_secret() -> str:
    warnings.warn("CHRONO_SECRET_KEY not set: using an ephemeral development secret (sessions reset on restart).",
                  stacklevel=2)
    return secrets.token_urlsafe(48)


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
