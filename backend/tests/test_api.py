"""API tests: validation order, error codes, and mocked LLM flows.

The Gemini call is always monkeypatched - no test hits the real API.
"""
from __future__ import annotations

from typing import Any

import pytest
from conftest import make_pdf
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors

from app.llm import LLMError, _api_error_detail
from app.schemas import (
    CoverLetterResponse,
    CustomizedResume,
    CustomizeResponse,
    ExperienceItem,
    ProjectItem,
)

UPLOAD_URL = "/api/customize"
COVER_LETTER_URL = "/api/cover-letter"
EXPORT_URL = "/api/export/docx"


@pytest.fixture
def fixed_customize_response() -> CustomizeResponse:
    """A canned CustomizeResponse returned by the mocked LLM.

    ``original`` is deliberately different from ``customized`` (summary,
    skills, experience bullets, education) so scope-enforcement assertions
    are meaningful.
    """
    return CustomizeResponse(
        original=CustomizedResume(
            summary="Backend engineer with Python experience.",
            skills=["Python", "Django", "PostgreSQL"],
            experience=[
                ExperienceItem(
                    title="Software Engineer",
                    company="Acme Corp",
                    duration="2018 - 2020",
                    bullets=["Worked on Django web applications"],
                )
            ],
            projects=[ProjectItem(name="Blog Engine", bullets=["Built with Django"])],
            education=["BSc Computer Science, State University, 2016"],
        ),
        customized=CustomizedResume(
            summary="Senior Python engineer tailoring backend APIs to the role.",
            skills=["Python", "FastAPI", "PostgreSQL"],
            experience=[
                ExperienceItem(
                    title="Senior Python Engineer",
                    company="Acme Corp",
                    duration="2020 - Present",
                    bullets=["Led migration to FastAPI, reducing p95 latency by 25%"],
                )
            ],
            projects=[ProjectItem(name="Ingestion Pipeline", bullets=["Built with Python"])],
            education=["MSc Software Engineering, State University, 2020"],
        ),
        matched_keywords=["python", "fastapi", "postgresql"],
        missing_keywords=["kubernetes"],
        match_score_before=55,
        match_score_after=72,
        ats_tips=[
            "Mirror the JD phrase 'REST APIs' in the summary.",
            "Add a skills sub-header for cloud tooling.",
            "Keep bullets to one line each.",
        ],
    )


def _upload(
    client: TestClient,
    *,
    jd: str,
    content: bytes,
    filename: str = "resume.pdf",
    content_type: str = "application/pdf",
    url: str = UPLOAD_URL,
    extra_fields: dict[str, str] | None = None,
) -> Any:
    """POST a multipart request with a JD and a resume file."""
    data: dict[str, str] = {"jd": jd}
    if extra_fields:
        data.update(extra_fields)
    return client.post(
        url,
        data=data,
        files={"resume": (filename, content, content_type)},
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

def test_health(client: TestClient) -> None:
    """/health returns the documented payload."""
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ---------------------------------------------------------------------------
# Validation errors
# ---------------------------------------------------------------------------

def test_short_jd_returns_400(client: TestClient, sample_pdf: bytes) -> None:
    """A JD below MIN_JD_CHARS is rejected with 400."""
    response = _upload(client, jd="too short", content=sample_pdf)

    assert response.status_code == 400
    assert "too short" in response.json()["detail"]


def test_empty_jd_returns_400(client: TestClient, sample_pdf: bytes) -> None:
    """An empty JD is rejected with 400."""
    response = _upload(client, jd="   ", content=sample_pdf)

    assert response.status_code == 400
    assert "required" in response.json()["detail"]


def test_bad_extension_returns_400(client: TestClient, valid_jd: str, sample_pdf: bytes) -> None:
    """A .txt upload is rejected with 400 before any parsing."""
    response = _upload(
        client,
        jd=valid_jd,
        content=sample_pdf,
        filename="resume.txt",
        content_type="text/plain",
    )

    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_wrong_magic_bytes_returns_400(client: TestClient, valid_jd: str) -> None:
    """A .pdf that is not really a PDF is rejected with 400."""
    response = _upload(client, jd=valid_jd, content=b"not a pdf at all")

    assert response.status_code == 400
    assert "PDF" in response.json()["detail"]


def test_oversized_file_returns_413(client: TestClient, valid_jd: str) -> None:
    """A file over MAX_FILE_MB is rejected with 413 (after the type check)."""
    oversized = b"%PDF-1.4\n" + b"x" * (5 * 1024 * 1024 + 1024)

    response = _upload(client, jd=valid_jd, content=oversized)

    assert response.status_code == 413
    assert "too large" in response.json()["detail"]


def test_blank_pdf_returns_422(client: TestClient, valid_jd: str, blank_pdf: bytes) -> None:
    """A PDF without selectable text is rejected with 422 (scanned document)."""
    response = _upload(client, jd=valid_jd, content=blank_pdf)

    assert response.status_code == 422
    assert "scanned" in response.json()["detail"].lower()


def test_short_extracted_text_returns_422(client: TestClient, valid_jd: str) -> None:
    """Extracted text under 100 characters is rejected with 422."""
    tiny_pdf = make_pdf([["Hi"]])

    response = _upload(client, jd=valid_jd, content=tiny_pdf)

    assert response.status_code == 422
    assert "scanned" in response.json()["detail"].lower()


def test_corrupt_pdf_returns_422(client: TestClient, valid_jd: str) -> None:
    """A corrupted PDF body is rejected with 422."""
    response = _upload(client, jd=valid_jd, content=b"%PDF-1.4\nbroken body")

    assert response.status_code == 422
    assert "detail" in response.json()


def test_unknown_section_returns_400(
    client: TestClient, valid_jd: str, sample_pdf: bytes
) -> None:
    """An unsupported section name is rejected with 400."""
    response = _upload(
        client,
        jd=valid_jd,
        content=sample_pdf,
        extra_fields={"sections": "summary,education"},
    )

    assert response.status_code == 400
    assert "education" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Successful flows (LLM mocked)
# ---------------------------------------------------------------------------

def test_customize_success(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    fixed_customize_response: CustomizeResponse,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A valid request returns the full CustomizeResponse payload."""
    captured: dict[str, Any] = {}

    async def fake_customize(
        jd: str, resume_text: str, sections: tuple[str, ...] | None = None
    ) -> CustomizeResponse:
        captured.update(jd=jd, resume_text=resume_text, sections=sections)
        return fixed_customize_response

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(client, jd=valid_jd, content=sample_pdf)

    assert response.status_code == 200
    body = CustomizeResponse.model_validate(response.json())
    # original is returned untouched alongside the tailored version
    assert body.original.summary == "Backend engineer with Python experience."
    assert body.original.education == ["BSc Computer Science, State University, 2016"]
    assert body.original.experience[0].title == "Software Engineer"
    assert body.customized.summary != body.original.summary
    assert body.match_score_before == 55
    assert body.match_score_after == 72
    assert body.matched_keywords == ["python", "fastapi", "postgresql"]
    assert body.missing_keywords == ["kubernetes"]
    assert len(body.ats_tips) >= 3
    assert body.customized.experience[0].title == "Senior Python Engineer"
    # LLM received the validated JD and extracted resume text
    assert captured["jd"] == valid_jd
    assert "Jane Doe" in captured["resume_text"]
    assert captured["sections"] is None


def test_customize_with_sections_passes_scope_through(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    fixed_customize_response: CustomizeResponse,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The sections field is parsed and forwarded to the LLM call."""
    captured: dict[str, Any] = {}

    async def fake_customize(
        jd: str, resume_text: str, sections: tuple[str, ...] | None = None
    ) -> CustomizeResponse:
        captured["sections"] = sections
        return fixed_customize_response

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(
        client,
        jd=valid_jd,
        content=sample_pdf,
        extra_fields={"sections": "summary, skills"},
    )

    assert response.status_code == 200
    assert captured["sections"] == ("summary", "skills")


def test_sections_scope_is_enforced(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    fixed_customize_response: CustomizeResponse,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Non-listed sections (and education) come verbatim from ``original``."""
    tampered = fixed_customize_response.model_copy(deep=True)
    tampered.customized.experience[0].bullets = ["Invented bullet the model made up"]
    tampered.customized.projects[0].name = "Invented Project"
    tampered.customized.education = ["PhD Made Up University, 2099"]

    async def fake_customize(
        jd: str, resume_text: str, sections: tuple[str, ...] | None = None
    ) -> CustomizeResponse:
        return tampered

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(
        client,
        jd=valid_jd,
        content=sample_pdf,
        extra_fields={"sections": "summary,skills"},
    )

    assert response.status_code == 200
    body = CustomizeResponse.model_validate(response.json())
    # listed sections keep the LLM's rewritten versions
    assert body.customized.summary == tampered.customized.summary
    assert body.customized.skills == tampered.customized.skills
    # non-listed sections are restored from original
    assert body.customized.experience == body.original.experience
    assert body.customized.projects == body.original.projects
    assert body.customized.education == body.original.education


def test_education_is_always_copied_from_original(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    fixed_customize_response: CustomizeResponse,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Even without a sections field, education comes from ``original``."""
    tampered = fixed_customize_response.model_copy(deep=True)
    tampered.customized.education = ["PhD Made Up University, 2099"]

    async def fake_customize(
        jd: str, resume_text: str, sections: tuple[str, ...] | None = None
    ) -> CustomizeResponse:
        return tampered

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(client, jd=valid_jd, content=sample_pdf)

    assert response.status_code == 200
    body = CustomizeResponse.model_validate(response.json())
    assert body.customized.education == body.original.education
    assert body.customized.education == ["BSc Computer Science, State University, 2016"]
    # rewritable sections still come from the LLM
    assert body.customized.summary == tampered.customized.summary


def test_cover_letter_success(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A valid request returns the generated cover letter."""
    async def fake_cover_letter(jd: str, resume_text: str) -> CoverLetterResponse:
        return CoverLetterResponse(
            cover_letter="Dear Hiring Manager,\n\nI am excited to apply.\n\nBest regards,\nJane"
        )

    monkeypatch.setattr("app.main.generate_cover_letter", fake_cover_letter)

    response = _upload(client, jd=valid_jd, content=sample_pdf, url=COVER_LETTER_URL)

    assert response.status_code == 200
    assert response.json()["cover_letter"].startswith("Dear Hiring Manager")


def test_export_docx_returns_file_download(
    client: TestClient, fixed_customize_response: CustomizeResponse
) -> None:
    """The export endpoint returns real .docx bytes with a download header."""
    resume: CustomizedResume = fixed_customize_response.customized

    response = client.post(EXPORT_URL, json=resume.model_dump())

    assert response.status_code == 200
    assert response.content[:2] == b"PK"  # real docx (zip) bytes
    assert "attachment" in response.headers["content-disposition"]
    assert "customized_resume.docx" in response.headers["content-disposition"]
    assert "wordprocessingml.document" in response.headers["content-type"]


# ---------------------------------------------------------------------------
# LLM failures
# ---------------------------------------------------------------------------

def test_root_redirects_to_docs(client: TestClient) -> None:
    """GET / redirects to the interactive API docs."""
    response = client.get("/", follow_redirects=True)

    assert response.status_code == 200
    assert "Swagger UI" in response.text


def test_model_not_found_error_explains_setup() -> None:
    """A Gemini 404 names the model and points at GEMINI_MODEL / the key."""
    error = genai_errors.APIError(
        404,
        {"error": {"code": 404, "status": "NOT_FOUND",
                   "message": "models/gemini-2.5-flash is not found for API version v1beta"}},
    )

    message = _api_error_detail(error, "gemini-2.5-flash")

    assert "HTTP 404" in message
    assert "gemini-2.5-flash" in message
    assert "is not found" in message
    assert "GEMINI_MODEL" in message
    assert "aistudio.google.com" in message
    assert "test-key" not in message  # never leaks credentials


def test_bad_request_error_points_at_llm_settings() -> None:
    """A Gemini 400 explains which settings to check, including thinking."""
    error = genai_errors.APIError(
        400,
        {"error": {"code": 400, "status": "INVALID_ARGUMENT",
                   "message": "Unknown name 'thinking_config'"}},
    )

    message = _api_error_detail(error, "some-model")

    assert "GEMINI_API_KEY" in message
    assert "GEMINI_MODEL" in message
    assert "THINKING_BUDGET" in message
    assert "Unknown name 'thinking_config'" in message


def test_llm_failure_returns_502(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An LLM failure after retries maps to 502."""
    async def fake_customize(*args: Any, **kwargs: Any) -> CustomizeResponse:
        raise LLMError("LLM request failed with HTTP 503.")

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(client, jd=valid_jd, content=sample_pdf)

    assert response.status_code == 502
    assert response.json()["detail"] == "LLM request failed with HTTP 503."


def test_unexpected_error_returns_500(
    client: TestClient,
    valid_jd: str,
    sample_pdf: bytes,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unexpected exceptions map to a generic 500 payload."""
    async def fake_customize(*args: Any, **kwargs: Any) -> CustomizeResponse:
        raise RuntimeError("boom")

    monkeypatch.setattr("app.main.customize_resume", fake_customize)

    response = _upload(client, jd=valid_jd, content=sample_pdf)

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
