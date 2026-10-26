"""FastAPI application: routes, CORS, validation order, and error handling.

Validation order for the upload endpoints (documented contract):
400 (JD / extension / magic bytes) -> 413 (size) -> 422 (corrupt or empty
text) -> 502 (LLM failure) -> 504 (LLM timeout).
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response

from app.config import get_settings
from app.exporters import build_docx
from app.llm import LLMError, LLMTimeoutError, customize_resume, generate_cover_letter
from app.parsers import (
    EmptyText,
    UnreadableFile,
    UnsupportedFileType,
    check_file_type,
    extract_text,
)
from app.schemas import CoverLetterResponse, CustomizedResume, CustomizeResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

ALLOWED_SECTIONS = ("summary", "skills", "experience", "projects")
MIN_EXTRACTED_CHARS = 100
DOCX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
DOCX_FILENAME = "customized_resume.docx"

settings = get_settings()  # fails fast if GEMINI_API_KEY is missing

app = FastAPI(
    title="Resume Customizer API",
    version="1.0.0",
    description=(
        "Tailor a resume (PDF/DOCX) to a job description with Gemini: "
        "structured resume JSON, match scores, keywords, ATS tips, cover "
        "letters, and DOCX export."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Exception handlers (documented status codes)
# ---------------------------------------------------------------------------

@app.exception_handler(UnsupportedFileType)
async def unsupported_file_handler(_request: Request, exc: UnsupportedFileType) -> JSONResponse:
    """Bad extension or magic bytes -> 400."""
    logger.warning("Rejected upload: %s", exc)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(UnreadableFile)
async def unreadable_file_handler(_request: Request, exc: UnreadableFile) -> JSONResponse:
    """Empty or corrupted file -> 422."""
    logger.warning("Unreadable upload: %s", exc)
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(EmptyText)
async def empty_text_handler(_request: Request, exc: EmptyText) -> JSONResponse:
    """No selectable text (scanned document) -> 422."""
    logger.warning("No extractable text: %s", exc)
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(LLMTimeoutError)
async def llm_timeout_handler(_request: Request, exc: LLMTimeoutError) -> JSONResponse:
    """LLM did not answer in time -> 504."""
    logger.error("LLM timeout: %s", exc)
    return JSONResponse(status_code=504, content={"detail": str(exc)})


@app.exception_handler(LLMError)
async def llm_error_handler(_request: Request, exc: LLMError) -> JSONResponse:
    """LLM failure after retries -> 502."""
    logger.error("LLM failure: %s", exc)
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Anything unexpected -> 500 with a generic message."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_jd(jd: str | None) -> str:
    """Validate the job description length.

    Returns:
        The stripped JD text.

    Raises:
        HTTPException: 400 when the JD is empty, too short, or too long.
    """
    text = (jd or "").strip()
    if not text:
        raise HTTPException(
            status_code=400,
            detail="Job description is required and cannot be empty.",
        )
    if len(text) < settings.min_jd_chars:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Job description is too short ({len(text)} characters). "
                f"Minimum is {settings.min_jd_chars} characters."
            ),
        )
    if len(text) > settings.max_jd_chars:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Job description is too long ({len(text)} characters). "
                f"Maximum is {settings.max_jd_chars} characters."
            ),
        )
    return text


async def validate_upload(upload: UploadFile) -> bytes:
    """Read the upload in memory and check type (400) then size (413).

    Returns:
        The raw file bytes.

    Raises:
        HTTPException: 400 for a bad type, 413 when over ``MAX_FILE_MB``.
    """
    content = await upload.read()
    check_file_type(upload.filename or "", content)  # raises 400-mapped errors
    if len(content) > settings.max_file_bytes:
        size_mb = len(content) / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=(
                f"File is too large ({size_mb:.1f} MB). "
                f"Maximum allowed is {settings.max_file_mb} MB."
            ),
        )
    return content


def parse_sections(sections: str | None) -> tuple[str, ...] | None:
    """Parse the optional comma-separated ``sections`` field.

    Returns:
        A deduplicated tuple of allowed section names, or ``None`` when the
        field is absent (meaning: rewrite all sections).

    Raises:
        HTTPException: 400 when a section name is not allowed.
    """
    if sections is None or not sections.strip():
        return None
    names = [part.strip().lower() for part in sections.split(",") if part.strip()]
    if not names:
        raise HTTPException(
            status_code=400,
            detail=f"sections must be a comma-separated subset of: {', '.join(ALLOWED_SECTIONS)}.",
        )
    invalid = [name for name in names if name not in ALLOWED_SECTIONS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown section(s): {', '.join(invalid)}. "
                f"Allowed sections: {', '.join(ALLOWED_SECTIONS)}."
            ),
        )
    return tuple(dict.fromkeys(names))


def enforce_sections_scope(
    result: CustomizeResponse,
    sections: tuple[str, ...] | None,
) -> CustomizeResponse:
    """Make the non-rewritten sections come verbatim from ``original``.

    The LLM is instructed to copy them, but this makes the guarantee
    deterministic: ``education`` is always copied from ``original``, and when
    ``sections`` restricts the scope, every non-listed section is copied too.

    Args:
        result: The LLM response containing ``original`` and ``customized``.
        sections: The allowed-to-change sections, or ``None`` for all.

    Returns:
        A new response whose ``customized`` resume respects the scope.
    """
    original = result.original.model_copy(deep=True)
    customized = result.customized.model_copy(deep=True)
    customized.education = original.education
    if sections is not None:
        for name in ALLOWED_SECTIONS:
            if name not in sections:
                setattr(customized, name, getattr(original, name))
    return result.model_copy(update={"customized": customized})


def extract_resume_text(filename: str, content: bytes) -> str:
    """Extract text and enforce the minimum usable length.

    Returns:
        Extracted resume text with at least ``MIN_EXTRACTED_CHARS`` characters.

    Raises:
        HTTPException: 422 when the text is too short (likely scanned).
        EmptyText: When no selectable text exists at all (422-mapped).
    """
    text = extract_text(filename, content)
    if len(text) < MIN_EXTRACTED_CHARS:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Only {len(text)} characters of text could be extracted "
                f"(minimum {MIN_EXTRACTED_CHARS}). The file is likely a scanned "
                "or image-based PDF; please upload a text-based resume."
            ),
        )
    return text


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe."""
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Redirect the root URL to the interactive API docs."""
    return RedirectResponse(url="/docs")


@app.post("/api/customize", response_model=CustomizeResponse)
async def customize(
    resume: Annotated[UploadFile, File(description="Resume file (.pdf or .docx)")],
    jd: Annotated[str | None, Form(description="Job description text")] = None,
    sections: Annotated[
        str | None,
        Form(description="Comma-separated subset of: summary,skills,experience,projects"),
    ] = None,
) -> CustomizeResponse:
    """Tailor an uploaded resume to a job description.

    Validates inputs in the documented order, extracts the resume text in
    memory, and returns structured resume JSON plus scores, keywords, and
    ATS tips.
    """
    jd_text = validate_jd(jd)
    selected = parse_sections(sections)
    content = await validate_upload(resume)
    resume_text = extract_resume_text(resume.filename or "", content)

    result = await customize_resume(jd_text, resume_text, selected)
    result = enforce_sections_scope(result, selected)
    logger.info(
        "POST /api/customize ok: score_before=%d score_after=%d matched=%d missing=%d sections=%s",
        result.match_score_before,
        result.match_score_after,
        len(result.matched_keywords),
        len(result.missing_keywords),
        ",".join(selected) if selected else "all",
    )
    return result


@app.post("/api/cover-letter", response_model=CoverLetterResponse)
async def cover_letter(
    resume: Annotated[UploadFile, File(description="Resume file (.pdf or .docx)")],
    jd: Annotated[str | None, Form(description="Job description text")] = None,
) -> CoverLetterResponse:
    """Generate a 3-4 paragraph cover letter for an uploaded resume."""
    jd_text = validate_jd(jd)
    content = await validate_upload(resume)
    resume_text = extract_resume_text(resume.filename or "", content)

    result = await generate_cover_letter(jd_text, resume_text)
    logger.info("POST /api/cover-letter ok: %d characters", len(result.cover_letter))
    return result


@app.post("/api/export/docx")
def export_docx(resume: CustomizedResume) -> Response:
    """Render a CustomizedResume JSON body as a clean .docx download."""
    document = build_docx(resume)
    logger.info("POST /api/export/docx ok: %d bytes", len(document))
    return Response(
        content=document,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{DOCX_FILENAME}"'},
    )
