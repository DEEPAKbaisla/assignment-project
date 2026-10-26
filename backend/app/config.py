"""Application settings loaded from the environment and an optional .env file."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the Resume Customizer backend.

    Values are read from environment variables first, then from a local
    ``.env`` file (see ``.env.example``). Secrets are never hardcoded.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    gemini_api_key: str = Field(
        default="",
        description="Google AI Studio API key used to call the Gemini API.",
    )
    gemini_model: str = Field(
        default="gemini-3.8-flash",
        description=(
            "Gemini model id(s) for generation. Comma-separated values form an "
            "ordered fallback chain, rotated across retry attempts."
        ),
    )
    allowed_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated list of CORS origins.",
    )
    max_file_mb: int = Field(default=5, description="Maximum upload size in MB.")
    min_jd_chars: int = Field(default=100, description="Minimum job description length.")
    max_jd_chars: int = Field(default=15000, description="Maximum job description length.")

    @model_validator(mode="after")
    def _require_api_key(self) -> Settings:
        """Fail fast with a clear message when the Gemini API key is missing."""
        key = self.gemini_api_key.strip()
        if not key or key == "your_key_here":
            raise ValueError(
                "GEMINI_API_KEY is missing or still set to the placeholder value. "
                "Copy .env.example to .env and set GEMINI_API_KEY. "
                "Get a free key at https://aistudio.google.com/apikey"
            )
        if not self.gemini_models:
            raise ValueError(
                "GEMINI_MODEL must name at least one model "
                "(comma-separated for a fallback chain)."
            )
        return self

    @property
    def gemini_models(self) -> list[str]:
        """Return the ordered model fallback chain from ``GEMINI_MODEL``."""
        return [name.strip() for name in self.gemini_model.split(",") if name.strip()]

    @property
    def allowed_origins_list(self) -> list[str]:
        """Return the CORS origins as a cleaned list."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def max_file_bytes(self) -> int:
        """Return the maximum allowed upload size in bytes."""
        return self.max_file_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance (validated on first use)."""
    return Settings()
