# Resume Customizer - Frontend

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui client for the
FastAPI backend in `../backend`.

Paste a job description, upload a `.pdf` / `.docx` resume, and get:

- a customized resume (summary, skills, experience, projects, education)
- before / after match scores and matched vs. missing keywords
- a lazily generated cover letter
- ATS tips
- downloads as plain text, PDF (print dialog), or `.docx` (backend export)

## Requirements

- Node.js 20.9+
- The backend running locally (see `../backend/README.md`), which serves the API
  at `http://localhost:8000` by default.

## Setup

```bash
cd frontend
cp .env.example .env.local   # adjust NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                  # http://localhost:3000
```

Environment variables are read-only at build time (`NEXT_PUBLIC_` prefix), so
restart `npm run dev` after changing `.env.local`.

| Variable             | Default                 | Purpose                                   |
| -------------------- | ----------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_API_URL`| `http://localhost:8000` | Base URL of the FastAPI backend.          |

The backend allows CORS from `http://localhost:3000` by default; set
`ALLOWED_ORIGINS` on the backend if you run the frontend elsewhere.

## Scripts

| Command          | What it does                     |
| ---------------- | -------------------------------- |
| `npm run dev`    | Development server (Turbopack)   |
| `npm run build`  | Production build + type checking |
| `npm run start`  | Serve the production build       |
| `npm run lint`   | ESLint                           |

## Project structure

```
app/            page.tsx (single page), layout.tsx, globals.css (+ print styles)
components/     JDInput, ResumeUpload, SectionPicker, ScoreCard, KeywordChips,
                ResumeView, DiffView, CoverLetterPanel, DownloadMenu, LoadingState
hooks/          useCustomize (request state), useCoverLetter (lazy fetch)
lib/            api.ts (typed fetch + ApiError), types.ts, format.ts,
                validation.ts, utils.ts
```

## Deploying to Vercel

1. Import the repository and set **Root Directory** to `frontend`
   (Settings -> General -> Root Directory), so Vercel builds the Next.js app and
   not the Python backend.
2. Add the environment variable `NEXT_PUBLIC_API_URL` pointing at your deployed
   backend, e.g. `https://your-backend.onrender.com`.
3. Deploy. Also add the Vercel frontend URL to the backend's `ALLOWED_ORIGINS`.

## Notes

- The Diff tab compares the full resume: the backend returns the input resume
  parsed into the same schema (`original`) alongside the tailored one
  (`customized`), so every section (summary, skills, experience, projects,
  education) gets a word-level diff, with unchanged sections collapsed.
- All requests have a 5-minute (300s) client timeout — long enough for the
  backend's worst case (90s x 3 LLM attempts + backoff). The backend `detail`
  message is shown verbatim in a destructive alert.

## Troubleshooting

- **`npm run build` fails with `TypeError: Cannot read properties of null (reading 'useContext')`**
  while prerendering `/_global-error`: a global `NODE_ENV` set to something
  other than `production` (e.g. `development`) leaks into the build and mixes
  development and production React bundles. Run the build with
  `NODE_ENV=production npm run build` (PowerShell: `$env:NODE_ENV="production"; npm run build`).
- **CORS errors in the browser**: the backend only allows origins listed in
  `ALLOWED_ORIGINS` (default `http://localhost:3000`).
