"""Resume file parsing: PDF and DOCX bytes to normalized plain text.

Uploads are processed entirely in memory; nothing is written to disk.
"""
from __future__ import annotations

import io
import re
from pathlib import Path

import pymupdf
from docx import Document
from docx.document import Document as DocumentObject
from docx.table import Table
from docx.text.paragraph import Paragraph

MAX_TEXT_CHARS = 20_000
PDF_MAGIC = b"%PDF"
ZIP_MAGIC = b"PK"
SUPPORTED_EXTENSIONS = (".pdf", ".docx")
_LEADING_JUNK = b"\x00\t\r\n \xef\xbb\xbf"


class ResumeParseError(Exception):
    """Base class for resume parsing failures."""


class UnsupportedFileType(ResumeParseError):
    """The upload is not a supported .pdf/.docx file (or has wrong magic bytes)."""


class UnreadableFile(ResumeParseError):
    """The file exists but cannot be opened or parsed."""


class EmptyText(ResumeParseError):
    """The file parsed successfully but contains no selectable text."""


def check_file_type(filename: str, content: bytes) -> str:
    """Validate the file extension and magic bytes.

    Args:
        filename: Original filename of the upload.
        content: Raw file bytes.

    Returns:
        The normalized extension (``.pdf`` or ``.docx``).

    Raises:
        UnsupportedFileType: Extension or magic bytes are not PDF/DOCX.
        UnreadableFile: The file is empty.
    """
    extension = Path(filename or "").suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        label = extension or filename or "unknown file"
        raise UnsupportedFileType(
            f'Unsupported file type "{label}". Upload a .pdf or .docx resume.'
        )
    if not content:
        raise UnreadableFile("File is empty.")
    if extension == ".pdf":
        if content.lstrip(_LEADING_JUNK)[:4] != PDF_MAGIC:
            raise UnsupportedFileType(
                "File does not look like a PDF (missing %PDF header)."
            )
    elif content.lstrip(_LEADING_JUNK)[:2] != ZIP_MAGIC:
        raise UnsupportedFileType(
            "File does not look like a DOCX (missing PK zip header)."
        )
    return extension


def extract_text(filename: str, content: bytes) -> str:
    """Extract normalized text from a PDF or DOCX upload.

    Args:
        filename: Original filename of the upload (used for extension checks).
        content: Raw file bytes, read in memory.

    Returns:
        Whitespace-normalized text, capped at ``MAX_TEXT_CHARS`` characters.

    Raises:
        UnsupportedFileType: Extension or magic bytes are not PDF/DOCX.
        UnreadableFile: The file is empty, corrupted, or password-protected.
        EmptyText: No selectable text was found (e.g. a scanned document).
    """
    extension = check_file_type(filename, content)
    raw = _extract_pdf(content) if extension == ".pdf" else _extract_docx(content)
    text = _normalize(raw)
    if not text:
        raise EmptyText(
            "No selectable text found in the file. It is likely a scanned or "
            "image-based PDF; please upload a text-based resume."
        )
    return text[:MAX_TEXT_CHARS]


def _extract_pdf(content: bytes) -> str:
    """Return the text of every PDF page, in page order."""
    try:
        document = pymupdf.open(stream=content, filetype="pdf")
    except Exception as exc:  # pymupdf raises several unrelated error types
        raise UnreadableFile("Could not read the PDF; the file may be corrupted.") from exc
    try:
        if document.needs_pass:
            raise UnreadableFile("The PDF is password-protected.")
        return "\n".join(page.get_text() for page in document)
    finally:
        document.close()


def _extract_docx(content: bytes) -> str:
    """Return paragraph text plus table cell text, in document order."""
    try:
        document = Document(io.BytesIO(content))
    except Exception as exc:  # zip/package errors surface as several types
        raise UnreadableFile("Could not read the DOCX; the file may be corrupted.") from exc
    return "\n".join(_iter_block_text(document))


def _iter_block_text(document: DocumentObject) -> list[str]:
    """Collect text from paragraphs and table cells in document order."""
    blocks: list[str] = []
    for block in document.iter_inner_content():
        if isinstance(block, Paragraph):
            blocks.append(block.text)
        elif isinstance(block, Table):
            for row in block.rows:
                for cell in row.cells:
                    if cell.text.strip():
                        blocks.append(cell.text)
    return blocks


def _normalize(text: str) -> str:
    """Strip null bytes, normalize line endings, and collapse whitespace."""
    text = text.replace("\x00", "")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()
