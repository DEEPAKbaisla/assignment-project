"""Unit tests for PDF/DOCX text extraction and typed parsing errors."""
from __future__ import annotations

import pytest
from conftest import make_docx, make_pdf

from app.parsers import (
    MAX_TEXT_CHARS,
    EmptyText,
    UnreadableFile,
    UnsupportedFileType,
    extract_text,
)


def test_pdf_extracts_text_in_page_order(sample_pdf: bytes) -> None:
    """Pages are joined in order and text is preserved."""
    text = extract_text("resume.pdf", sample_pdf)

    assert "Jane Doe - Senior Python Engineer" in text
    assert "reducing p95 latency by 25%" in text
    assert "BSc Computer Science" in text
    assert text.index("Jane Doe") < text.index("BSc Computer Science")


def test_docx_extracts_paragraphs_and_table_cells(sample_docx: bytes) -> None:
    """Paragraph text and table cell text both come through, normalized."""
    text = extract_text("resume.docx", sample_docx)

    assert "Jane Doe - Senior Python Engineer" in text
    assert "Python, FastAPI, PostgreSQL" in text  # table cell
    assert "BSc Computer Science" in text  # second table row
    assert "Summary: Backend engineer" in text  # double space collapsed
    assert "  " not in text  # no runs of leftover whitespace
    assert not text.endswith(" ")  # trailing whitespace stripped


def test_docx_text_is_capped_at_limit(long_docx: bytes) -> None:
    """Extracted text never exceeds MAX_TEXT_CHARS."""
    text = extract_text("resume.docx", long_docx)

    assert len(text) == MAX_TEXT_CHARS


def test_unsupported_extension_is_rejected(sample_pdf: bytes) -> None:
    """A .txt upload raises UnsupportedFileType."""
    with pytest.raises(UnsupportedFileType):
        extract_text("resume.txt", sample_pdf)


def test_pdf_with_wrong_magic_bytes_is_rejected() -> None:
    """A .pdf whose bytes are not a PDF raises UnsupportedFileType."""
    with pytest.raises(UnsupportedFileType):
        extract_text("resume.pdf", b"this is definitely not a pdf")


def test_docx_with_wrong_magic_bytes_is_rejected() -> None:
    """A .docx whose bytes are not a zip raises UnsupportedFileType."""
    with pytest.raises(UnsupportedFileType):
        extract_text("resume.docx", b"plain text pretending to be docx")


def test_empty_file_is_unreadable() -> None:
    """A zero-byte file raises UnreadableFile."""
    with pytest.raises(UnreadableFile):
        extract_text("resume.pdf", b"")


def test_corrupt_pdf_is_unreadable() -> None:
    """A PDF with a valid header but broken body raises UnreadableFile."""
    with pytest.raises(UnreadableFile):
        extract_text("resume.pdf", b"%PDF-1.4\nbroken body without xref")


def test_corrupt_docx_is_unreadable() -> None:
    """A DOCX with a zip header but broken archive raises UnreadableFile."""
    with pytest.raises(UnreadableFile):
        extract_text("resume.docx", b"PK\x03\x04 not a real zip archive")


def test_blank_pdf_raises_empty_text(blank_pdf: bytes) -> None:
    """A PDF without selectable text raises EmptyText (scanned document)."""
    with pytest.raises(EmptyText):
        extract_text("resume.pdf", blank_pdf)


def test_multiline_pdf_text_is_normalized() -> None:
    """Line endings and stray spacing are normalized, null bytes stripped."""
    pdf = make_pdf([["Hello    world", "Second  line here"]])

    text = extract_text("resume.pdf", pdf)

    assert "Hello world" in text
    assert "Second line here" in text
    assert "\x00" not in text


def test_docx_without_text_raises_empty_text() -> None:
    """An empty DOCX raises EmptyText."""
    with pytest.raises(EmptyText):
        extract_text("resume.docx", make_docx(paragraphs=[]))
