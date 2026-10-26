"""Pydantic models used for request bodies, responses, and LLM structured output."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

ALLOWED_SCORE_MIN = 0
ALLOWED_SCORE_MAX = 100


def _clamp_score(value: Any) -> int:
    """Coerce a score to an int and clamp it into the 0-100 range."""
    try:
        score = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("match scores must be integers between 0 and 100") from exc
    return max(ALLOWED_SCORE_MIN, min(ALLOWED_SCORE_MAX, score))


class ExperienceItem(BaseModel):
    """One entry from the resume's work experience section."""

    title: str
    company: str
    duration: str
    bullets: list[str] = Field(default_factory=list)


class ProjectItem(BaseModel):
    """One entry from the resume's projects section."""

    name: str
    bullets: list[str] = Field(default_factory=list)


class CustomizedResume(BaseModel):
    """The tailored resume as structured JSON."""

    summary: str
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)


class CustomizeResponse(BaseModel):
    """Full response of POST /api/customize.

    ``original`` is the input resume parsed into the same structure, kept as
    the untouched source of truth; ``customized`` is the tailored version.
    """

    original: CustomizedResume
    customized: CustomizedResume
    matched_keywords: list[str] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    match_score_before: int
    match_score_after: int
    ats_tips: list[str] = Field(default_factory=list)

    @field_validator("match_score_before", "match_score_after", mode="before")
    @classmethod
    def validate_score(cls, value: Any) -> int:
        """Clamp both match scores into the 0-100 range."""
        return _clamp_score(value)


class CoverLetterResponse(BaseModel):
    """Full response of POST /api/cover-letter."""

    cover_letter: str
