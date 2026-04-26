# Kitkode

Kitkode is a local Python interview-practice app. You browse problems, write Python code, run visible and hidden tests, and get structured feedback. The Python runner is the only source of correctness; AI can phrase hints or coaching, but it never decides whether a solution is correct.

For an operational checklist, startup verification, and environment reference, see [HEALTHCHECK.md](./HEALTHCHECK.md).

## Architecture

| Piece | Role |
| --- | --- |
| `frontend/` | React JavaScript workspace served by Parcel |
| `backend-go/` | Go API for problems, sessions, orchestration, runner calls, and optional DeepSeek hints |
| `runner-python/` | FastAPI Python evaluator for syntax checks, safety checks, visible tests, and hidden tests |
| `shared/` | Shared API contracts and source problem JSON |
| `scripts/` | Maintenance scripts such as PreCode generation and problem JSON encoding scans |

## Frontend Layout

The frontend keeps shared UI separate from feature-owned UI:

- `frontend/src/components/`: reusable UI such as badges, status dots, and workspace composition.
- `frontend/src/features/problems/`: problem browser and problem-facing UI.
- `frontend/src/features/editor/`: Python editor logic.
- `frontend/src/features/evaluation/`: run results and feedback UI.
- `frontend/src/features/hints/`: hint and inline-hint rendering.
- `frontend/src/features/voiceCoach/`: disabled optional voice coach code.
- `frontend/src/lib/`: API clients and utilities.

## Backend Layout

The Go backend is organized around clear boundaries:

- `backend-go/internal/handler/`: HTTP request mapping.
- `backend-go/internal/service/`: orchestration and business logic.
- `backend-go/internal/store/`: SQLite persistence.
- `backend-go/internal/runner/`: client for the Python runner.
- `backend-go/internal/problems/`: embedded problem catalog and category metadata.

The runner remains separate in `runner-python/` and is the authoritative evaluator.

## Curricula

- **PreCode 100**: beginner-friendly Python foundations and problem-solving practice.
- **NeetCode 150**: classic DSA interview practice.
- **Blind 75**: focused subset over existing NeetCode-style problems.
- **Company Practice Tracks**: unofficial curated filters for Google, Microsoft, Amazon, and OpenAI practice.

Problem JSON starts in `shared/problems/` and is mirrored into:

- `backend-go/internal/problems/data/`
- `runner-python/problems/`

Company tracks are not official company problem lists. They reuse existing problems through optional problem metadata:

```json
"company_tags": ["Google", "Amazon"]
```

Problems without `company_tags` simply do not appear in company-specific filters.

## Local Startup

Run these in three terminals.

```powershell
cd runner-python
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

```powershell
cd backend-go
copy .env.example .env
go build -o bin/server ./cmd/server
.\bin\server
```

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

In local dev, Parcel proxies `/api` to the Go backend on `http://127.0.0.1:8080`, so `API_BASE` is usually not needed.

## Environment

Backend defaults are documented in `backend-go/.env.example`:

- `PORT=8080`
- `DATABASE_PATH=./data/pictorhack.db`
- `RUNNER_URL=http://127.0.0.1:8001`
- `CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`
- `DEEPSEEK_API_KEY=` optional
- `DEEPSEEK_API_URL=https://api.deepseek.com`
- `DEEPSEEK_MODEL=deepseek-chat`

Runner defaults are documented in `runner-python/.env.example`:

- `RUNNER_USE_SUBPROCESS=1`
- `RUNNER_SUBPROCESS_TIMEOUT_SEC=6`
- `RUNNER_CORS_ORIGINS=*`

Frontend defaults are documented in `frontend/.env.example`:

- `API_BASE=` optional, usually unset in local dev
- `ENABLE_VOICE_COACH=false`
- `GEMINI_API_KEY=` optional and only relevant if voice coach is enabled
- `GEMINI_MODEL=gemini-2.5-flash`

## Evaluation Statuses

| Status | Meaning |
| --- | --- |
| `syntax_error` | Python could not parse the source |
| `runtime_error` | Code raised an exception, timed out, or failed during execution |
| `incomplete` | Signature, function, or implementation is incomplete |
| `wrong` | No visible tests are passing yet |
| `partial` | Some tests pass, but not all |
| `correct` | All visible and hidden tests pass |
| `internal_error` | Platform or runner issue, not a judgment of user code |

## DeepSeek Hints

DeepSeek is optional and server-side only. Set `DEEPSEEK_API_KEY` in `backend-go/.env` to enable AI-phrased interviewer notes or hints. Without a key, Kitkode falls back to deterministic runner feedback and seeded problem hints.

DeepSeek must not judge correctness. It may only phrase feedback from runner context.


## Testing

Frontend:

```powershell
cd frontend
npm run lint
npm exec -- parcel build index.html --dist-dir dist-check --no-cache --no-optimize
npm run test:e2e
```

Go backend:

```powershell
cd backend-go
go test ./...
```

Python runner, when Python is installed:

```powershell
cd runner-python
.\.venv\Scripts\activate
$env:PYTHONPATH="."
python -m pytest tests/ -q
```

Note: on this Windows setup, the normal optimized Parcel `npm run build` has previously failed with a Parcel temp-file unlink error. The no-optimize Parcel build check above verifies source bundling without that known Windows temp-file issue.

## Manual Healthcheck

Use [HEALTHCHECK.md](./HEALTHCHECK.md) for the full manual checklist. The key checks are:

- Open the app.
- Browse problems.
- Select a PreCode problem.
- Run correct, wrong, and syntax-error solutions.
- Get a hint after a run.
- Refresh and confirm session restore.
- Confirm hidden test counts display in evaluation results.

## Adding Or Updating Problems

1. Add or update `shared/problems/{category-id}/{problem-slug}.json`.
2. Save problem JSON as valid UTF-8.
3. Mirror `shared/problems/` into `backend-go/internal/problems/data/` and `runner-python/problems/`.
4. Rebuild the Go backend so embedded problem data updates.
5. Run the relevant frontend, backend, and runner checks.

Windows mirror example:

```powershell
robocopy shared\problems backend-go\internal\problems\data /E /IS /IT
robocopy shared\problems runner-python\problems /E /IS /IT
```

Encoding scan:

```powershell
python scripts\scan_problem_json_encoding.py
```

## Rename Notes

The project was previously called Pictor Hack. Some internal identifiers are intentionally preserved to avoid unnecessary churn:

- Go module path: `pictorhack/backend`
- SQLite default path: `./data/pictorhack.db`
- Browser localStorage key: `pictorhack.practice.v1`
