# backend-go â€” API server

REST orchestration for **Kitkode**. This process **does not** execute user Python and **does not** determine submission correctness. The Python runner service owns execution and structured evaluation.

## Responsibilities

| Layer | Role |
|--------|------|
| **handler** | Decode JSON, HTTP status mapping, no business rules about test outcomes |
| **service** | Orchestrate runner + optional DeepSeek phrasing; **never** mutate evaluation fields from the runner |
| **runner** | HTTP client to `runner-python` â€” pass-through of `RunResponse` |
| **deepseek** | Chat completions: run feedback (plain text) + **hint** path (`response_format: json_object`) parsed into `feedback` / `hint` / `next_focus` |
| **store** | SQLite persistence for session code, hint history, optional `practice_status` |
| **problems** | Embedded JSON metadata (public views hide hidden test inputs) |
| **config** | Environment-based configuration |

## Correctness boundaries

1. **Python runner** is the only source of truth for `status`, `evaluation`, and `visible_test_results`.
2. **Go** may only replace or fill `interviewer_feedback` text after a successful runner response, using DeepSeek or deterministic copy â€” it must **not** change `evaluation` or top-level `status`.
3. **DeepSeek** is backend-only â€” set `DEEPSEEK_API_KEY` in `.env` (never commit secrets). It must **never** be used to infer pass/fail; `internal/coach/hint_json.go` and `prompts.go` state that evaluation JSON is authoritative.
4. **POST /api/hint** sends problem title/summary (from `problems.BuildHintPromptContext`), runner evaluation JSON, hint history, allowed level (1â€“4 from session length), and a code prefix. If the API fails or JSON parsing fails, **fallback** uses seeded `hint_plan` + deterministic lines (`internal/service/hint_fallback.go`).

## Layout

```
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
internal/problems/          # embedded JSON + hint_context (LLM problem summary)
internal/coach/             # prompts + JSON hint user payload
```

## Environment

See `.env.example`. Important variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen address suffix (default `:8080`) |
| `DATABASE_PATH` | SQLite file path |
| `RUNNER_URL` | Base URL of `runner-python` (no trailing slash) |
| `CORS_ORIGINS` | Comma-separated allowed browser Origins |
| `DEEPSEEK_API_KEY` | Optional; if unset, run feedback stays deterministic and hints use seeded plan only |
| `DEEPSEEK_API_URL` | Default `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | Default `deepseek-chat` |

## Run locally

```bash
go run ./cmd/server
```

Requires `runner-python` running (e.g. `uvicorn app.main:app --port 8001`) so `/api/run` can reach `/evaluate`.

## Error responses

JSON shape: `{"code":"<machine_code>","message":"<human text>"}` â€” see `internal/httpx/errors.go` for codes.
