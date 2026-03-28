# Pictor Hack

Local MVP for **Python interview practice**: you write every line of solution code. The stack evaluates deterministically in the Python runner, then the Go backend optionally calls **DeepSeek** only to phrase **interviewer-style notes and progressive hints** â€” never to decide correctness.

## Architecture

| Piece | Role |
|--------|------|
| `frontend/` | Next.js + TypeScript + Tailwind + Monaco |
| `backend-go/` | Problems API, SQLite sessions, orchestration, DeepSeek (server-side only) |
| `runner-python/` | Syntax/safety checks, tests, structured evaluation |
| `shared/` | Contracts + NeetCode-style problem JSON (`shared/problems/{category}/{id}.json`) |

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

Defaults: `PORT=8080`, `RUNNER_URL=http://127.0.0.1:8001`, SQLite at `./data/pictorhack.db`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or `http://127.0.0.1:3000`). With the **Go API** on `:8080`, the app calls **`/api` on the same origin** and Next.js proxies to the backend (see `frontend/next.config.mjs`), so you usually **do not** need `NEXT_PUBLIC_API_BASE`. Set `BACKEND_URL` if the API listens somewhere other than `http://127.0.0.1:8080`. Use `NEXT_PUBLIC_API_BASE` only when the browser must talk to a **different host** (split deployments).

## DeepSeek

- Set `DEEPSEEK_API_KEY` in `backend-go/.env` (never expose to the browser).
- The model **must not** be used to judge tests; it only rewrites feedback/hints under strict system prompts.
- Without a key, run feedback uses deterministic strings from the runner; hints use the seeded `hint_plan` in each problem JSON.

## Safety note

The Python runner uses AST checks, restricted builtins, and subprocess timeouts. **Production** would need OS-level sandboxing (containers, seccomp, cgroup limits, no network) â€” see comments in `runner-python/app/safety.py` and `runner-python/app/main.py`.

## API (Go)

- `GET /api/categories` â€” NeetCode-style curriculum list with `problem_count` per category
- `GET /api/problems` â€” list summaries; optional query: `?category=arrays-hashing&difficulty=easy`
- `GET /api/problems/:id` â€” public problem (no hidden test payloads; **never** exposes `canonical_solution_summary`)
- `POST /api/run` â€” `{ "problem_id", "language": "python", "code" }`
- `POST /api/hint` â€” `{ "problem_id", "code", "evaluation" }` (evaluation from last run)
- `POST /api/session/save` â€” `{ "problem_id", "code", "hint_history", "practice_status"?: "not_started"|"in_progress"|"solved" }`
- `GET /api/session/:problem_id`

## Problem curriculum (NeetCode-style)

Categories are fixed in `backend-go/internal/problems/categories.go` (IDs like `arrays-hashing`, `sliding-window`, `dp-1d`, â€¦). Each problem JSON **must** include a `category` field matching one of those IDs.

The UI shows an expandable sidebar, search, difficulty filter, and per-problem progress (`not_started` / `in_progress` / `solved`) stored in **localStorage** and mirrored in SQLite when sessions save.

## Adding a new problem

1. Add `shared/problems/{category-id}/{problem-slug}.json` with the same schema as existing seeds (`id`, `title`, `difficulty`, `category`, `description`, `examples`, `constraints`, `function_name`, `parameters`, `expected_return_type`, `visible_tests`, `hidden_tests`, `hint_plan` with levels 1â€“4, `canonical_solution_summary` for internal/LLM context only â€” **not** returned by the API).
2. Mirror the file into `backend-go/internal/problems/data/` and `runner-python/problems/` (same subfolders).
3. Rebuild the Go binary so embedded data updates.
4. For unusual inputs (e.g. linked lists / trees from JSON), add coercion in `runner-python/app/problem_hooks.py` and wire it in `evaluator.py` if needed.

## Seeded problems (11)

Representative set across categories â€” see `shared/problems/`: Two Sum, Valid Anagram, Product of Array Except Self, Top K Frequent Elements, Best Time to Buy and Sell Stock, Longest Substring Without Repeating Characters, Valid Parentheses, Binary Search, Reverse Linked List, Same Tree, Climbing Stairs.
