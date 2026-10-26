# Resume Customizer — Backend

FastAPI backend for the Resume Customizer app. Paste a job description (JD),
upload a resume (PDF or DOCX), and get back a tailored resume as structured
JSON — plus match scores, matched/missing keywords, ATS tips, cover letters,
and a clean `.docx` export.

- **Python 3.11+**, FastAPI, Uvicorn
- **Parsing:** pymupdf (PDF), python-docx (DOCX) — processed entirely in
  memory, uploads are never written to disk
- **LLM:** `google-genai` SDK, model(s) configurable via `GEMINI_MODEL`
  (comma-separated fallback chain), structured JSON output with retries,
  exponential backoff, and timeouts
- **Config:** pydantic-settings reading `.env`
- **Tests:** pytest + httpx (the LLM call is mocked — tests never hit the API)

---

## 1. Setup

```bash
cd backend

python -m venv venv

# macOS / Linux
source venv/bin/activate
# Windows PowerShell
# .\venv\Scripts\Activate.ps1

pip install -r requirements.txt

cp .env.example .env      # Windows: Copy-Item .env.example .env
# edit .env and set GEMINI_API_KEY
```

### Get a free Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with a Google account.
3. Click **Create API key** and copy the key.
4. Paste it into `.env`:

   ```env
   GEMINI_API_KEY=your_real_key_here
   ```

The app **fails fast at startup** with a clear message if `GEMINI_API_KEY` is
missing or still set to the placeholder value. Never hardcode or commit keys.

### Configuration (`.env`)

| Variable         | Default                | Description                                  |
| ---------------- | ---------------------- | -------------------------------------------- |
| `GEMINI_API_KEY` | *(required)*           | Google AI Studio API key                     |
| `GEMINI_MODEL`   | `gemini-3.8-flash`     | Gemini model id(s); comma-separated = ordered fallback chain |
| `ALLOWED_ORIGINS`| `http://localhost:3000`| Comma-separated CORS origins                 |
| `MAX_FILE_MB`    | `5`                    | Maximum upload size in MB                    |
| `MIN_JD_CHARS`   | `100`                  | Minimum JD length                            |
| `MAX_JD_CHARS`   | `15000`                | Maximum JD length                            |

### Run

```bash
uvicorn app.main:app --reload
```

Interactive API docs: <http://localhost:8000/docs>

---

## 2. Endpoints

| Method | Path                 | Body                                | Returns                         |
| ------ | -------------------- | ----------------------------------- | ------------------------------- |
| GET    | `/`                  | —                                   | Redirects to `/docs`            |
| GET    | `/health`            | —                                   | `{"status": "ok"}`              |
| POST   | `/api/customize`     | multipart: `jd`, `resume`, `sections?` | `CustomizeResponse`          |
| POST   | `/api/cover-letter`  | multipart: `jd`, `resume`           | `CoverLetterResponse`           |
| POST   | `/api/export/docx`   | JSON: `CustomizedResume`            | `.docx` file download           |

### `GET /health`

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### `POST /api/customize`

Multipart fields:

- `jd` — job description text (length validated against `MIN_JD_CHARS`/`MAX_JD_CHARS`)
- `resume` — the resume file, `.pdf` or `.docx` (max `MAX_FILE_MB`)
- `sections` *(optional)* — comma-separated subset of
  `summary,skills,experience,projects`. When provided, only these sections are
  rewritten; everything else is copied verbatim from `original` — enforced
  server-side, not just requested from the model. `education` is always
  copied from `original`. Omit it to rewrite all four sections.

```bash
curl -X POST http://localhost:8000/api/customize \
  -F "jd=$(cat jd.txt)" \
  -F "resume=@resume.pdf" \
  -F "sections=summary,skills"
```

Response:

```json
{
  "original": {
    "summary": "Backend engineer with 6 years of Python experience.",
    "skills": ["Python", "Django", "PostgreSQL"],
    "experience": [
      {"title": "Software Engineer", "company": "Acme Corp",
       "duration": "2018 - 2020",
       "bullets": ["Worked on Django web applications"]}
    ],
    "projects": [{"name": "Blog Engine", "bullets": ["Built with Django"]}],
    "education": ["BSc Computer Science, State University, 2016"]
  },
  "customized": {
    "summary": "Backend engineer with 6 years of Python ...",
    "skills": ["Python", "FastAPI", "PostgreSQL"],
    "experience": [
      {"title": "Senior Python Engineer", "company": "Acme Corp",
       "duration": "2020 - Present",
       "bullets": ["Led migration to FastAPI, reducing p95 latency by 25%"]}
    ],
    "projects": [{"name": "Ingestion Pipeline", "bullets": ["..."]}],
    "education": ["BSc Computer Science, State University, 2018"]
  },
  "matched_keywords": ["python", "fastapi", "postgresql"],
  "missing_keywords": ["kubernetes"],
  "match_score_before": 55,
  "match_score_after": 72,
  "ats_tips": ["Mirror the JD phrase 'REST APIs' in the summary."]
}
```

### `POST /api/cover-letter`

```bash
curl -X POST http://localhost:8000/api/cover-letter \
  -F "jd=$(cat jd.txt)" \
  -F "resume=@resume.pdf"
# {"cover_letter":"Dear Hiring Manager, ..."}
```

Returns 3–4 short, professional paragraphs. No invented facts — only what is
in the resume.

### `POST /api/export/docx`

```bash
curl -X POST http://localhost:8000/api/export/docx \
  -H "Content-Type: application/json" \
  -d @customized.json \
  -o customized_resume.docx
```

Body is a `CustomizedResume` object (the `customized` field of a
`CustomizeResponse`). Returns an ATS-friendly `.docx` (simple headings,
standard fonts, no tables or images) with
`Content-Disposition: attachment; filename="customized_resume.docx"`.

---

## 3. Error codes

All errors return JSON in the shape `{"detail": "<message>"}`.

| Status | When                                                                  | Example detail                                                    |
| ------ | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 400    | JD empty, shorter than `MIN_JD_CHARS`, or longer than `MAX_JD_CHARS`  | `Job description is too short (9 characters). Minimum is 100 ...`  |
| 400    | File extension not `.pdf`/`.docx`, or magic bytes wrong (PDF `%PDF`, DOCX `PK`) | `Unsupported file type "resume.txt". Upload a .pdf or .docx resume.` |
| 400    | Unknown name in `sections`                                           | `Unknown section(s): education. Allowed sections: summary, ...`   |
| 413    | File larger than `MAX_FILE_MB`                                       | `File is too large (6.0 MB). Maximum allowed is 5 MB.`            |
| 422    | File corrupted/unreadable (also empty or password-protected)         | `Could not read the PDF; the file may be corrupted.`              |
| 422    | Extracted text under 100 chars (likely a scanned/image-based PDF)    | `... likely a scanned or image-based PDF; please upload ...`      |
| 502    | LLM failure after retries, or unusable LLM output                    | `All LLM attempts failed: attempt 1: LLM request failed with HTTP 429 ...` |
| 504    | LLM timeout after retries (90s per call)                             | `LLM request timed out after 90s using model 'gemini-3.6-flash'.` |
| 500    | Any unexpected server error                                          | `Internal server error`                                           |

Non-retryable Gemini errors surface the model name, Google's error text, and
a setup hint — e.g. a 404 returns `LLM request failed with HTTP 404 for model
'gemini-2.5-flash'. Gemini said: ... Check that GEMINI_MODEL in .env ...`
so a wrong `GEMINI_MODEL` or key is obvious from the response alone.

**Model fallback chain**: `GEMINI_MODEL` may be a comma-separated list, e.g.
`gemini-3.6-flash,gemini-3.5-flash,gemini-flash-lite-latest`. Each retry
attempt rotates to the next model, and an HTTP 404 (model not available to
your key) also advances the chain — so one overloaded or unavailable model
falls back to a healthy one instead of failing the request. Attempts retry
transient errors with exponential backoff: 429s wait 5s/10s (rate-limit
windows are per minute), 5xx/timeouts wait 2s/4s.

Some models (the `*-lite` family) reject `thinking_config` with HTTP 400.
When that happens the same model is immediately re-called **without** that
field (this does not consume a retry attempt), and the degraded config is
kept for the rest of the request — so lite models remain usable as chain
fallbacks. When every attempt fails, the error lists each attempt in order,
e.g. `All LLM attempts failed: attempt 1: ...HTTP 429 for model
'gemini-3.6-flash'... | attempt 2: ...` so the first cause is never masked
by the last.

**Latency tuning** (constants in `app/llm.py`):

| Constant              | Default | Why |
| --------------------- | ------- | --- |
| `CALL_TIMEOUT_SECONDS`| `90`    | Structured output carries two full resumes; retries use exponential backoff on top. |
| `BACKOFF_BASE_SECONDS`| `2.0`   | Waits 2s then 4s between retries — long enough to ride out Gemini capacity spikes (503s). |
| `RATE_LIMIT_BASE_SECONDS`| `5.0`| 429 quota errors wait 5s then 10s instead, because rate-limit windows are per minute. |
| `MAX_ATTEMPTS`      | `3`     | Attempts rotate through the `GEMINI_MODEL` fallback chain. |
| `THINKING_BUDGET`     | `0`     | Gemini thinking is disabled so the JSON arrives quickly. Raise it for higher quality, or delete the `thinking_config` argument if your model rejects it (you'll see a 400 naming the field). |
| `MAX_OUTPUT_TOKENS`   | `16384` | Guaranteed headroom for `original` + `customized` + keywords + tips. |
| `TEMPERATURE`         | `0.35`  | Deterministic enough for resume rewriting. |

Validation order for the upload endpoints:
**400 → 413 → 422 → 502 → 504**.

---

## 4. Tests

```bash
cd backend
pytest            # or: python -m pytest
```

- `tests/test_parsers.py` — PDF/DOCX extraction from generated fixtures,
  unsupported types, empty/corrupt files, text cap.
- `tests/test_api.py` — `/health`, every documented error code, and the
  happy paths with the LLM function monkeypatched (no real API calls).

`tests/conftest.py` sets a dummy `GEMINI_API_KEY` before the app is imported,
so tests run without any configuration.

---

## 5. Deployment

### Docker

```bash
cd backend
docker build -t resume-customizer-api .
docker run -p 8000:8000 -e GEMINI_API_KEY=your_key_here resume-customizer-api
```

The container runs
`uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`.

### Render

Create a Web Service from the repo with:

| Setting            | Value                          |
| ------------------ | ------------------------------ |
| Root Directory     | `backend`                      |
| Build Command      | `pip install -r requirements.txt` |
| Start Command      | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Environment        | `GEMINI_API_KEY=<your key>` (plus optional `GEMINI_MODEL`, `ALLOWED_ORIGINS`, limits) |

Add your frontend origin (e.g. `https://your-frontend.vercel.app`) to
`ALLOWED_ORIGINS` so CORS lets it through.

---

## 6. Project structure

```
backend/
  app/
    main.py       # FastAPI app, CORS, routes, validation, exception handlers
    config.py     # pydantic-settings (.env), fail-fast API key check
    parsers.py    # in-memory PDF/DOCX text extraction + typed errors
    llm.py        # prompts, Gemini calls (async), retries, schema validation
    schemas.py    # pydantic models (CustomizeResponse, CoverLetterResponse, ...)
    exporters.py  # ATS-friendly .docx generation
  tests/
    test_parsers.py
    test_api.py   # LLM mocked
  requirements.txt
  .env.example
  Dockerfile
  pytest.ini
  README.md
```
