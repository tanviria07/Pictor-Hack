# Jose-Morinho AI

Local MVP for **Python interview practice**: you write every line of solution code. The stack evaluates deterministically in the Python runner, then the Go backend optionally calls **DeepSeek** only to phrase **interviewer-style notes and progressive hints** — never to decide correctness.

## Architecture

| Piece | Role |
|--------|------|
| `frontend/` | Next.js + TypeScript + Tailwind + Monaco |
| `backend-go/` | Problems API, SQLite sessions, orchestration, DeepSeek (server-side only) |
| `runner-python/` | Syntax/safety checks, tests, structured evaluation |
| `shared/` | Contracts + canonical problem JSON |

## Status semantics (evaluator)

| Status | Meaning |
|--------|---------|
| `syntax_error` | Source does not parse |
| `runtime_error` | Exception during load or tests (or timeout / sandbox error) |
| `incomplete` | Missing/wrong signature, stub body (`pass` / empty), or not enough implementation to judge |
| `partial` | Some visible or hidden tests pass, not all |
| `wrong` | Visible tests show no correct outputs yet |
| `correct` | All visible and hidden tests pass |

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

Copy `shared/problems/*.json` into `backend-go/internal/problems/data/` if you change problems (repo keeps them in sync).

```bash
cd backend-go
copy .env.example .env   # optional: set DEEPSEEK_API_KEY for LLM phrasing
go build -o bin/server ./cmd/server
bin\server
```

Defaults: `PORT=8080`, `RUNNER_URL=http://127.0.0.1:8001`, SQLite at `./data/josemorinho.db`.

### 3. Frontend

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_API_BASE` if the API is not on `127.0.0.1:8080`.

## DeepSeek

- Set `DEEPSEEK_API_KEY` in `backend-go/.env` (never expose to the browser).
- The model **must not** be used to judge tests; it only rewrites feedback/hints under strict system prompts.
- Without a key, run feedback uses deterministic strings from the runner; hints use the seeded `hint_plan` in each problem JSON.

## Safety note

The Python runner uses AST checks, restricted builtins, and subprocess timeouts. **Production** would need OS-level sandboxing (containers, seccomp, cgroup limits, no network) — see comments in `runner-python/app/safety.py` and `runner-python/app/main.py`.

## API (Go)

- `GET /api/problems` — list
- `GET /api/problems/:id` — public problem (no hidden test inputs)
- `POST /api/run` — `{ "problem_id", "language": "python", "code" }`
- `POST /api/hint` — `{ "problem_id", "code", "evaluation" }` (evaluation from last run)
- `POST /api/session/save` — `{ "problem_id", "code", "hint_history" }`
- `GET /api/session/:problem_id`

## Seeded problems

Two Sum, Valid Anagram, Top K Frequent Elements, Best Time to Buy and Sell Stock — see `shared/problems/`.
