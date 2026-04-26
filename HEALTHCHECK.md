# Kitkode Healthcheck

## Project Purpose

Kitkode is a local coding-interview practice platform for Python. Learners browse problems, write code, run visible and hidden tests, receive deterministic evaluation, and optionally get AI-phrased hints.

Correctness always comes from the Python runner. AI systems may explain, coach, or phrase hints, but they never decide whether code is correct.

## Core Architecture

- `frontend/`: React JavaScript app served by Parcel.
- `backend-go/`: Go API for problem catalog, sessions, orchestration, hints, and runner calls.
- `runner-python/`: FastAPI service that evaluates submitted Python code.
- `backend-go/data/`: SQLite database location for local session/progress storage.
- `shared/problems/`: Source problem JSON files mirrored into backend and runner problem directories.

## Services

### React Frontend

The frontend is the user workspace: problem browser, problem display, Python editor, run controls, evaluation panel, hint UI, inline hints, and local progress state. In local dev, Parcel proxies `/api` to the Go backend.

### Go Backend

The backend maps HTTP requests, loads problem metadata, saves/restores sessions, calls the Python runner for evaluation, and orchestrates hints. Handler code should stay thin; service code owns orchestration/business logic; store code owns SQLite access.

### FastAPI Python Runner

The runner is the authoritative evaluator. It parses code, applies safety checks, executes visible and hidden tests, and returns structured evaluation results such as `correct`, `partial`, `wrong`, `syntax_error`, `runtime_error`, `incomplete`, or `internal_error`.

### SQLite Storage

SQLite stores local practice sessions: code, hint history, and practice status. The default path is `backend-go/data/pictorhack.db`, preserving existing local sessions despite the Kitkode rename.

### Optional DeepSeek Hints

DeepSeek is optional and server-side only. When configured, it may phrase interviewer-style notes or hints using runner context. If no key is configured, deterministic fallback feedback and problem `hint_plan` data are used.

## Local Startup Commands

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

## Required Environment Variables

Most local defaults work out of the box. Use these when overriding defaults.

### Backend

- `PORT`: Go API port. Default: `8080`.
- `DATABASE_PATH`: SQLite database path. Default: `./data/pictorhack.db`.
- `RUNNER_URL`: Python runner URL. Default: `http://127.0.0.1:8001`.
- `CORS_ORIGINS`: Allowed browser origins. Default covers `localhost:3000` and `127.0.0.1:3000`.
- `MAX_CODE_BYTES`: Submitted code size limit.
- `RATE_LIMIT_PER_MINUTE`: API rate limit.
- `PROBLEMS_DATA_DIR`: Optional disk problem source for dev instead of embedded data.

### Python Runner

- `RUNNER_USE_SUBPROCESS`: Run submissions in a subprocess. Default example: `1`.
- `RUNNER_SUBPROCESS_TIMEOUT_SEC`: Submission timeout. Default example: `6`.
- `RUNNER_CORS_ORIGINS`: Runner CORS origins. Default example: `*`.

### Frontend

- `API_BASE`: Optional full backend origin. Usually unset in dev because Parcel proxies `/api`.
- `ENABLE_VOICE_COACH`: Optional voice coach feature flag. Default: `false`.
- `GEMINI_API_KEY`: Optional, only needed if voice coach is explicitly enabled.
- `GEMINI_MODEL`: Optional Gemini model override. Default: `gemini-2.5-flash`.

### Optional DeepSeek

- `DEEPSEEK_API_KEY`: Optional. Enables AI-phrased hints/notes.
- `DEEPSEEK_API_URL`: Default: `https://api.deepseek.com`.
- `DEEPSEEK_MODEL`: Default: `deepseek-chat`.

## Manual Test Checklist

- Open `http://localhost:3000`.
- Browse problems in the sidebar.
- Select a PreCode problem.
- Run a correct solution and confirm all visible/hidden tests pass.
- Run a wrong solution and confirm the result is not marked correct.
- Run code with a syntax error and confirm a syntax error banner appears.
- Click `Get Hint` after a run and confirm a hint appears.
- Refresh the page and confirm session code/progress restore.
- Check hidden test count in the evaluation panel.

## Known Disabled Features

- Voice coach is disabled by default with `ENABLE_VOICE_COACH=false`.
- Voice coach code is isolated under `frontend/src/features/voiceCoach/`.
- Do not enable voice coach unless actively testing stabilization work.

## Cleanup Notes

- The Python runner is the source of correctness.
- AI never judges correctness.
- DeepSeek and voice/Gemini features may coach or phrase feedback only from runner context.
- Preserve run/evaluation, visible/hidden tests, hints, inline hints, session restore, and problem navigation when refactoring.
