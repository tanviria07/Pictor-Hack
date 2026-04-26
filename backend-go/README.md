# backend-go

REST API orchestration for `Kitkode`. This process does not execute user Python and does not determine submission correctness. The Python runner service owns execution and structured evaluation.

## Responsibilities

| Layer | Role |
|--------|------|
| `handler` | Decode JSON, map HTTP status codes, avoid business rules about test outcomes |
| `service` | Orchestrate runner calls and optional DeepSeek phrasing; never mutate evaluation fields from the runner |
| `runner` | HTTP client to `runner-python`; pass through `RunResponse` |
| `deepseek` | Chat completions for run feedback and hints |
| `store` | SQLite persistence for session code, hint history, and optional `practice_status` |
| `problems` | Embedded JSON metadata; public views hide hidden test inputs |
| `config` | Environment-based configuration |

## Correctness boundaries

1. The Python runner is the only source of truth for `status`, `evaluation`, and `visible_test_results`.
2. Go may only replace or fill `interviewer_feedback` text after a successful runner response, using DeepSeek or deterministic copy. It must not change `evaluation` or top-level `status`.
3. DeepSeek is backend-only. Set `DEEPSEEK_API_KEY` in `.env` and never expose it to the browser.
4. `POST /api/hint` sends problem title/summary, runner evaluation JSON, hint history, allowed level, and a code prefix. If the API or JSON parsing fails, the fallback uses seeded `hint_plan` data and deterministic text.

## Layout

```text
cmd/server/main.go          # wiring
internal/config/            # env loader
internal/dto/               # JSON DTOs (API + runner contract)
internal/handler/           # HTTP handlers
internal/httpapi/           # chi router
internal/middleware/        # CORS
internal/httpx/             # JSON helpers + API errors
internal/service/           # run + hint orchestration
internal/runner/            # runner-python client
internal/deepseek/          # client + hint JSON parse
internal/store/             # SQLite sessions
internal/problems/          # embedded JSON + hint context
internal/coach/             # prompts + JSON hint payloads
```

## Environment

See `.env.example`. Important variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen address suffix, default `:8080` |
| `DATABASE_PATH` | SQLite file path |
| `RUNNER_URL` | Base URL of `runner-python` without a trailing slash |
| `CORS_ORIGINS` | Comma-separated allowed browser origins |
| `DEEPSEEK_API_KEY` | Optional; if unset, run feedback stays deterministic and hints use seeded plan only |
| `DEEPSEEK_API_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Default `deepseek-chat` |

## Run locally

```bash
go run ./cmd/server
```

Requires `runner-python` running, for example:

```bash
uvicorn app.main:app --port 8001
```

## Error responses

JSON shape: `{"code":"<machine_code>","message":"<human text>"}`. See `internal/httpx/errors.go` for the current error codes.
