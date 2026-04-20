# Kitkode free deploy

This guide walks through the stack described in the `Kitkode free deploy`
plan: **Cloudflare Pages** for the static SPA, **Fly.io** for the Go API
and Python runner. The combo stays within both providers' free tiers,
keeps SQLite data on a persistent volume, and never exposes the Python
runner or Gemini API key to the public internet.

```
browser ──HTTPS──▶ Cloudflare Pages (kitkode.pages.dev)
                     │
                     └─ fetch(API_BASE) ──▶ kitkode-api.fly.dev (Go + SQLite)
                                                │  /api/voice/* proxies Gemini
                                                ▼
                                         kitkode-runner.internal:8001
                                         (FastAPI, no public port)
```

---

## Prerequisites

- A GitHub fork of this repo pushed to `origin`.
- [flyctl](https://fly.io/docs/flyctl/) installed and `fly auth login` done.
- A Cloudflare account with Pages access and a Gemini API key from
  https://aistudio.google.com/app/apikey (optional: a DeepSeek key for the
  hint coach).
- Node 18+ locally only if you plan to test the build once.

---

## 1. Deploy the Go API on Fly

```bash
cd backend-go

# Reuses the checked-in fly.toml (name: kitkode-api, region: iad).
fly launch --copy-config --no-deploy \
  --name kitkode-api \
  --dockerfile ./Dockerfile

# SQLite data volume (1 GB is well within the 3 GB free allowance).
fly volumes create kitkode_data --size 1 --region iad

# Server-side secrets. CORS is intentionally strict — update once you
# know your Cloudflare Pages URL.
fly secrets set \
  GEMINI_API_KEY=YOUR_GEMINI_KEY \
  CORS_ORIGINS=https://kitkode.pages.dev

# Optional: DeepSeek for interviewer-style feedback and hints.
fly secrets set DEEPSEEK_API_KEY=YOUR_DEEPSEEK_KEY

fly deploy
```

The checked-in `backend-go/fly.toml` already:

- mounts `kitkode_data` at `/data`
- sets `DATABASE_PATH=/data/kitkode.db` so progress survives redeploys
- points `RUNNER_URL` at the private runner (`kitkode-runner.internal`)
- keeps a minimum of 1 machine running (no cold starts)

Health check the API:

```bash
curl https://kitkode-api.fly.dev/health
# {"status":"ok"}
```

## 2. Deploy the Python runner on Fly (private only)

```bash
cd ../runner-python

fly launch --copy-config --no-deploy \
  --name kitkode-runner \
  --dockerfile ./Dockerfile

fly deploy
```

The runner's `fly.toml` has **no** `[http_service]` block — it listens on
`8001` on the Fly internal network only. The Go API reaches it via Fly
private DNS at `http://kitkode-runner.internal:8001`. No public port is
ever opened.

The container already defaults to the subprocess sandbox
(`RUNNER_USE_SUBPROCESS=1`, `RUNNER_USE_DOCKER=0`), which is how the
runner isolates user Python code when host Docker is unavailable (as is
the case on Fly micro-VMs).

## 3. Deploy the frontend on Cloudflare Pages

1. In the Cloudflare dashboard, go to **Workers & Pages → Create →
   Pages → Connect to Git** and pick your repo.
2. Set the build configuration:
   - Framework preset: **None**
   - Build command: `cd frontend && npm ci && npm run build`
   - Build output directory: `frontend/dist`
   - Root directory: leave blank (repo root)
3. Under **Environment variables (Production)** add:
   - `API_BASE` = `https://kitkode-api.fly.dev`
   - (Optional) `VOICE_COACH_ENABLED` = `1` (the default)
   - (Optional) `ASYNC_RUN` = `1` if you later add Redis to the API.

   Parcel inlines `process.env.API_BASE` at build time, so the browser
   bundle contains the Fly hostname — no runtime config needed.
4. Deploy. You'll get `kitkode.pages.dev` (or a custom subdomain).
5. Back in the Go API, set CORS to match:

   ```bash
   cd backend-go
   fly secrets set CORS_ORIGINS=https://kitkode.pages.dev
   ```

   (`fly secrets set` triggers a rolling restart automatically.)

## 4. Smoke test

```bash
# API is up and SQLite is writable.
curl -s https://kitkode-api.fly.dev/health
curl -s "https://kitkode-api.fly.dev/api/problems" | head -c 200

# Run a trivial Python solution (the Go API forwards to the private runner).
curl -s -X POST https://kitkode-api.fly.dev/api/run \
  -H 'Content-Type: application/json' \
  -d '{"problem_id":"arrays-hashing/two-sum","language":"python","code":"def solution(nums,target):\n    seen={}\n    for i,n in enumerate(nums):\n        if target-n in seen: return [seen[target-n], i]\n        seen[n]=i\n"}'

# Confirm the Gemini proxy responds. No API key leaves the browser.
curl -s -X POST https://kitkode-api.fly.dev/api/voice/turn \
  -H 'Content-Type: application/json' \
  -d '{"context":"","transcript":"hello"}'
```

Open `https://kitkode.pages.dev`, solve a problem, then open Jose and
ask a question. Finally, test persistence:

```bash
fly -a kitkode-api machines restart -y
```

Reload the page — the SQLite-backed session should still be there.

## Notes on costs and limits

- Fly free allowance (as of 2026): 3 `shared-cpu-1x` 256 MB machines and
  3 GB of persistent volume. This deploy uses 2 machines and 1 GB, so
  you still have room to experiment.
- Cloudflare Pages has unlimited bandwidth and 500 builds/month on the
  free plan.
- Gemini `gemini-2.5-flash` is generous on the free tier; bill alerts
  are still a good idea.
- If you ever want stronger isolation for untrusted code, swap the
  runner onto Google Cloud Run (which brings gVisor) — the existing
  `Dockerfile` runs there unmodified.
