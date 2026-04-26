# Kitkode

Local MVP for **Python interview practice**: you write every line of solution code. The stack evaluates deterministically in the Python runner, and the Go backend optionally calls **DeepSeek** only to phrase **interviewer-style notes and progressive hints** — never to decide correctness.

## Architecture

| Piece | Role |
|--------|------|
| `frontend/` | React + plain CSS (Parcel dev/build; see below) |
| `backend-go/` | Problems API, SQLite sessions, orchestration, DeepSeek (server-side only) |
| `runner-python/` | Syntax/safety checks, tests, structured evaluation |
| `shared/` | Contracts (`shared/contracts/api.ts`) + problem JSON (`shared/problems/{category}/{id}.json`) |
| `scripts/` | Utilities (e.g. PreCode 100 generator, problem JSON encoding scan) |

## Curricula

Two tracks are defined in `backend-go/internal/problems/categories.go` and shown in the UI sidebar:

- **PreCode 100** — Ten beginner-friendly sections (Python basics through debugging). JSON is generated from `scripts/generate_precode100.py` into `shared/problems/precode-*/`; mirror those folders into the backend and runner after regenerating.
- **NeetCode 150** — Classic DSA categories (`arrays-hashing`, `sliding-window`, `dp-1d`, etc.) with a full problem set under `shared/problems/`.

## Status semantics (evaluator)

| Status | Meaning |
|--------|---------|
| `syntax_error` | Source does not parse |
| `runtime_error` | Exception during load or tests (or timeout / sandbox error) |
| `incomplete` | Missing/wrong signature, stub body (`pass` / empty), or not enough implementation to judge |
| `partial` | Some visible or hidden tests pass, not all |
| `wrong` | Visible tests show no correct outputs yet |
| `correct` | All visible and hidden tests pass |
| `internal_error` | Platform/problem load or runner transport issue — **not** a judgment of user code (e.g. bad problem file encoding, subprocess I/O). The UI treats this separately from your solution. |

### Encoding & problem files

- All problem `.json` files **must be valid UTF-8**. Windows-1252 punctuation (e.g. byte `0x97` for an em dash) can break the runner or produce misleading errors.
- The runner loads problems through `runner-python/app/problem_io.py` (strict UTF-8 + JSON). The subprocess wrapper forces UTF-8 stdio (`PYTHONUTF8`, binary stdout in `run_job.py`) so Windows consoles do not corrupt evaluation output.
- **Scan the repo:** `python scripts/scan_problem_json_encoding.py` — reports non–UTF-8 or invalid JSON. Use `python scripts/scan_problem_json_encoding.py --fix` to rewrite files that decode as CP1252 but not UTF-8 (after verifying output).

## Prerequisites

- **Node.js** 18+
- **Go** 1.22+
- **Python** 3.11+

## Setup

### 1. Python runner

```bash
cd runner-python
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
set PYTHONPATH=.
python -m pytest tests/ -q
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Optional: copy `runner-python/.env.example` to `.env` and adjust.

### 2. Go API

Problem definitions live under `shared/problems/{category}/`. Mirror the whole tree into `backend-go/internal/problems/data/` and `runner-python/problems/` whenever you add or edit problems (same relative paths). Example (Windows):

```powershell
robocopy shared\problems backend-go\internal\problems\data /E /IS /IT
robocopy shared\problems runner-python\problems /E /IS /IT
```

```bash
cd backend-go
copy .env.example .env   # optional: set DEEPSEEK_API_KEY for LLM phrasing
go build -o bin/server ./cmd/server
bin\server
```

Defaults: `PORT=8080`, `RUNNER_URL=http://127.0.0.1:8001`, SQLite at `./data/pictorhack.db` *(legacy file name kept to preserve existing local sessions; rename only if you do not mind resetting progress)*.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or `http://127.0.0.1:3000`). With the **Go API** on `:8080`, Parcel’s dev server proxies **`/api`** to the backend (see `frontend/.proxyrc.json`), so you usually **do not** need `API_BASE`. Edit `.proxyrc.json` if the API is not at `http://127.0.0.1:8080`. Use `API_BASE` only when the browser must call the API on a **different origin** (split deployments).

**Frontend details**

- **Bundler:** [Parcel](https://parceljs.org/) compiles JSX and serves the dev server (`npm run dev`). Production output is static files under `frontend/dist/` from `npm run build`.
- **Env (optional):** Copy `frontend/.env.example` → `frontend/.env`. `API_BASE` points the browser at a full API URL when not using same-origin `/api`.
- **E2E:** From `frontend/`, `npm run test:e2e` runs Playwright against the workspace (starts dev server if needed).

## One-shot local startup

Three terminals, in order:

```bash
# 1) runner
cd runner-python && .venv\Scripts\activate && uvicorn app.main:app --host 127.0.0.1 --port 8001

# 2) API
cd backend-go && bin\server

# 3) frontend
cd frontend && npm run dev
```

Then open **http://localhost:3000**.

## DeepSeek

- Set `DEEPSEEK_API_KEY` in `backend-go/.env` (never expose to the browser).
- The model **must not** be used to judge tests; it only rewrites feedback/hints under strict system prompts.
- Without a key, run feedback uses deterministic strings from the runner; hints use the seeded `hint_plan` in each problem JSON.

## Voice coach (Jose)

Optional in-browser voice agent that coaches you while you solve problems.

- Add `GEMINI_API_KEY=...` (or the legacy `VITE_GEMINI_API_KEY`) to `frontend/.env`.
- Default model is `gemini-2.5-flash`; override with `GEMINI_MODEL`.
- The browser records a short audio clip with `MediaRecorder` and sends it
  directly to Gemini 2.5 Flash, which transcribes the question and writes
  a spoken-style reply in one call. No dependency on Chrome's Web Speech
  API. If `MediaRecorder` is unavailable, it falls back to SpeechRecognition.
- Open the panel with the circular **VC** button (bottom right) or press
  **Ctrl+Shift+V**. Recording auto-stops after ~1.5s of silence (20s hard cap).
- Jose never gives full code solutions — responses are 1–3 short sentences,
  TTS-friendly, and never markdown. See `frontend/src/lib/coach-prompts.ts`.

## Safety note

The Python runner uses AST checks, restricted builtins, and subprocess timeouts. It is intended for local development, not hostile multi-tenant execution.

## API (Go)

- `GET /api/categories` - NeetCode-style curriculum list with `problem_count` per category
- `GET /api/problems` - list summaries; optional query: `?category=arrays-hashing&difficulty=easy`
- `GET /api/problems/:id` - public problem (no hidden test payloads; **never** exposes `canonical_solution_summary`)
- `POST /api/run` - `{ "problem_id", "language": "python", "code" }`
- `POST /api/hint` - `{ "problem_id", "code", "evaluation" }` (evaluation from last run)
- `POST /api/session/save` - `{ "problem_id", "code", "hint_history", "practice_status"?: "not_started"|"in_progress"|"solved" }`
- `GET /api/session/:problem_id`

## Categories & UI

Category IDs and order live in `backend-go/internal/problems/categories.go`. Each problem JSON **must** include a `category` field matching one of those IDs.

The UI shows an expandable sidebar (grouped by track), search, difficulty filter, and per-problem progress (`not_started` / `in_progress` / `solved`) stored in **localStorage** and mirrored in SQLite when sessions save.

## Adding a new problem

1. Add `shared/problems/{category-id}/{problem-slug}.json` with the same schema as existing seeds (`id`, `title`, `difficulty`, `category`, `description`, `examples`, `constraints`, `function_name` or class mode fields, `parameters`, `expected_return_type`, `visible_tests`, `hidden_tests`, `hint_plan` with levels 1-4, `canonical_solution_summary` for internal/LLM context only and **not** returned by the API). Save as **UTF-8**.
2. Mirror the file into `backend-go/internal/problems/data/` and `runner-python/problems/` (same subfolders).
3. Rebuild the Go binary so embedded data updates.
4. For unusual inputs (e.g. linked lists / trees from JSON), add coercion in `runner-python/app/problem_hooks.py` and wire it in `evaluator.py` if needed.

## Regenerating PreCode 100

```bash
python scripts/generate_precode100.py
```

Then mirror `shared/problems/` into `backend-go/internal/problems/data/` and `runner-python/problems/` as above.

## Problem set

The repo includes **PreCode 100** (beginner track) and the full **NeetCode 150**-style DSA set under `shared/problems/`, mirrored into the backend embed tree and the runner problem directories.

## Notes on the rename

The project was previously called **Pictor Hack**. For stability a few internal identifiers still carry the old name and are intentionally left untouched:

- Go module path `pictorhack/backend` (renaming would touch every import).
- SQLite default path `./data/pictorhack.db` (preserves existing local sessions).
- Browser `localStorage` key `pictorhack.practice.v1` (preserves saved progress).

These are internal and never surface in the UI.
