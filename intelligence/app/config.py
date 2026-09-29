"""Validated service configuration loaded from environment / intelligence/.env."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PYTHON_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = "development"
    port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:5000"
    internal_key: str = ""

    github_token: str = ""

    # Phase 4 — direct MongoDB access to the normalized GitHub data that the
    # Node gateway (Phase 3) already synchronized. Read-only usage.
    mongodb_uri: str = ""
    mongodb_database: str = "devdna"

    # Version stamped on every analysis document (§21, §28).
    analysis_version: str = "1.0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
