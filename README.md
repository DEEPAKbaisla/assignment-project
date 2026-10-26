# Resume Customizer

Paste a job description, upload your resume (PDF or DOCX), and get an
ATS-friendly, tailored resume back — rewritten by Gemini to match the JD while
staying completely truthful to your actual experience.

**Live app:** _add your deployed URLs here after deploying (see [Deployment](#deployment))_

- Frontend: `https://frontend-iota-ebon-23.vercel.app`
- Backend API: `https://assignment-project-t2mv.onrender.com/` (interactive docs at `/docs`)

## What it does

1. **Job description input** — textarea with length validation (100–15,000 chars).
2. **Resume upload** — `.pdf` / `.docx` up to 5 MB, validated by extension _and_ magic bytes, parsed entirely in memory (never written to disk).
3. **LLM-powered customization** — Gemini rewrites the summary, promotes JD-matching skills, reorders/rephrases experience and project bullets with JD terminology, and lists missing keywords — without inventing any facts, employers, dates, or metrics.
4. **Output** — clean resume view, word-level before/after diff of every section, and downloads as `.docx` (ATS-friendly), plain text, or PDF (via print).

### Bonus features included

| Feature | How |
| --- | --- |
| Match Score | Honest 0–100 before/after scores, capped at +25 points per run |
| Diff View | Section-by-section word diff of original vs. tailored resume |
| Section-wise customization | Pick which sections to rewrite; the rest are copied verbatim **server-side** |
| Cover Letter Generator | Lazy-loaded `/api/cover-letter`, 3–4 paragraphs, no invented facts |
| ATS Tips | 3–5 specific, actionable tips per run |
| Prompt-injection defense | JD and resume are wrapped in tags and treated strictly as data |

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| Parsing | PyMuPDF (PDF), python-docx (DOCX) |
| LLM | **Google Gemini** via the `google-genai` SDK (free key from [Google AI Studio](https://aistudio.google.com/apikey)) |
| Model | `gemini-3.6-flash` with a comma-separated fallback chain (`gemini-3.6-flash,gemini-3.5-flash,gemini-flash-lite-latest`) rotated across retries |
| Export | python-docx (ATS-friendly `.docx`) |
| Tests | pytest + httpx (LLM mocked — tests never hit the API) |

## Architecture

```
┌────────────────────────────┐        REST (multipart / JSON)      ┌────────────────────────────┐
│   Next.js Frontend         │ ──────────────────────────────────▶ │   FastAPI Backend          │
│   (Vercel)                 │                                     │   (Render)                 │
│                            │  POST /api/customize                │                            │
│  - JD textarea + validation│  ◀────────────────────────────────  │  - Validation (400→413→422)│
│  - PDF/DOCX upload         │        CustomizeResponse JSON       │  - PDF/DOCX text extraction│
│  - Resume view + diff      │                                     │  - Prompt engineering      │
│  - Cover letter tab        │  POST /api/cover-letter             │  - Structured-output calls │
│  - Downloads (docx/txt/pdf)│  ◀────────────────────────────────  │  - DOCX export             │
│                            │        CoverLetterResponse JSON     │                            │
└────────────────────────────┘                                     └─────────────┬──────────────┘
                                                                                 │ Gemini API
                                                                                 ▼
                                                                   ┌────────────────────────────┐
                                                                   │   Google Gemini            │
                                                                   │   (structured JSON output) │
                                                                   └────────────────────────────┘
```

Request flow: the frontend uploads the JD text and resume file as
`multipart/form-data` → the backend validates inputs, extracts text in memory,
and calls Gemini with a Pydantic response schema → the validated structured
response (original + tailored resume, scores, keywords, ATS tips) returns as
JSON → the frontend renders it and posts the tailored resume back to
`/api/export/docx` for download.

## Repo structure

```
resume-customizer/
├── backend/                 # FastAPI app
│   ├── app/
│   │   ├── main.py          # routes, CORS, validation order, error handlers
│   │   ├── config.py        # pydantic-settings (.env), fail-fast API key check
│   │   ├── parsers.py       # in-memory PDF/DOCX extraction + typed errors
│   │   ├── llm.py           # prompts, async Gemini calls, retries, fallback chain
│   │   ├── schemas.py       # Pydantic models (request/response + LLM schema)
│   │   └── exporters.py     # ATS-friendly .docx generation
│   ├── tests/               # pytest (LLM mocked)
│   ├── Dockerfile
│   ├── requirements.txt
│   └── .env.example
└── frontend/                # Next.js app
    ├── app/                 # App Router page + layout
    ├── components/          # JDInput, ResumeUpload, DiffView, ScoreCard, ...
    ├── hooks/               # useCustomize, useCoverLetter
    ├── lib/                 # api.ts, types.ts, validation.ts, format.ts
    └── .env.example
```

## Local setup

### Prerequisites

- Python 3.11+
- Node.js 20.9+
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

cp .env.example .env            # Windows: Copy-Item .env.example .env
# edit .env and set GEMINI_API_KEY=<your key>

uvicorn app.main:app --reload
```

API docs: <http://localhost:8000> · Health check: `GET /health`

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

App: <http://localhost:3000>

### Environment variables

**Backend** (`backend/.env`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | *(required)* | Google AI Studio API key — app fails fast at startup without it |
| `GEMINI_MODEL` | `gemini-3.6-flash,...` | Comma-separated fallback chain, rotated across retry attempts |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins (add your frontend URL in production) |
| `MAX_FILE_MB` | `5` | Maximum upload size |
| `MIN_JD_CHARS` / `MAX_JD_CHARS` | `100` / `15000` | JD length bounds |

**Frontend** (`frontend/.env.local`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL of the backend (set to your deployed API URL in production) |

## API overview

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/health` | — | `{"status": "ok"}` |
| POST | `/api/customize` | multipart: `jd`, `resume`, `sections?` | tailored resume + original + scores + keywords + ATS tips |
| POST | `/api/cover-letter` | multipart: `jd`, `resume` | 3–4 paragraph cover letter |
| POST | `/api/export/docx` | JSON: `CustomizedResume` | `.docx` download |

Error contract (documented and tested):
**400** (bad JD/type/sections) → **413** (file too large) → **422**
(corrupt/scanned file) → **502** (LLM failure after retries) → **504** (LLM
timeout). Full details in [`backend/README.md`](backend/README.md).

## Tests

```bash
cd backend
pytest
```

Covers PDF/DOCX extraction (generated fixtures), every documented error code,
and happy paths with the LLM function monkeypatched — no API key needed.

## Deployment

> A live URL is required for submission. One option (both with free tiers):

### Backend → Render

1. Push the repo to GitHub.
2. On [render.com](https://render.com): **New → Web Service** → connect the repo.
3. Settings:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - (Alternatively deploy the included `backend/Dockerfile` as a Docker web service.)
4. Environment: `GEMINI_API_KEY=<your key>`, and
   `ALLOWED_ORIGINS=https://<your-frontend>.vercel.app`.
5. Note the service URL, e.g. `https://resume-customizer-api.onrender.com`.

### Frontend → Vercel

1. On [vercel.com](https://vercel.com): **Import** the repo.
2. Settings → General → **Root Directory**: `frontend`.
3. Environment variable: `NEXT_PUBLIC_API_URL=https://resume-customizer-api.onrender.com`
   (bake-time variable — set it _before_ the first deploy).
4. Deploy and open the live URL — then verify the full flow: paste a JD,
   upload a resume, customize, download.

## Known limitations & trade-offs

- **LLM output is structured JSON, not streaming** — responses take roughly
  5–30 s (the client allows up to 5 min for the worst case of 3 retries).
  Streaming was skipped in favor of guaranteed schema-validated output.
- **`original` is parsed by the LLM**, not a deterministic parser — rare
  wording drift is possible in the "before" side of the diff, though the
  prompt pins it to verbatim parsing and `education` is copied server-side.
- **Match/ATS scores are LLM estimates**, honest by prompt design (score gain
  capped at +25) but not a real ATS engine.
- **No database or auth** — stateless by design; every request re-uploads the
  resume. History/multi-version saving was out of scope.
- **DOCX export is intentionally plain** (one column, standard fonts, no
  tables/images) to maximize ATS readability — not a pixel-perfect clone of
  the uploaded resume's design.
- **Scanned/image-based PDFs are rejected** (no OCR) with a clear error.
- **Free-tier hosting cold starts**: Render's free backend spins down when
  idle; the first request after idle can take ~30 s.
