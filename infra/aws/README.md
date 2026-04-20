# infra/aws — AWS Serverless deploy kit for Kitkode

This folder is a *beginner-friendly* deploy kit built on the AWS CLI only
(no CDK, no Terraform, no SAM, no Docker registry). Every step is a plain
`aws <service> <verb>` call you can copy-paste or run with the helper
scripts in this directory.

The stack we create here matches what the user asked for in the task:

```
 Browser
    │  (HTTPS, cached)
    ▼
 CloudFront distribution
    │
    ├──(default)──▶ S3 bucket  (frontend SPA, static website)
    │
    └──(/api/*)───▶ API Gateway (HTTP API, $default route)
                        │
                        ├──▶ Lambda: kitkode-api     (Go, provided.al2023)
                        │
                        └──▶ Lambda: kitkode-runner  (Python + FastAPI + Mangum)
```

Two Lambdas, one API Gateway, one S3 bucket, one CloudFront distribution.
Everything lives inside the AWS Free Tier for a portfolio-sized workload.

---

## Files

| File | What it does |
|------|--------------|
| `env.sh` | Central config: AWS region, names, ARNs. **Edit this first.** |
| `build_runner_lambda.sh` | Produces `runner-python/dist/kitkode-runner.zip`. |
| `build_api_lambda.sh` | Produces `backend-go/dist/kitkode-api.zip`. |
| `deploy_runner_lambda.sh` | Creates/updates the Python runner Lambda. |
| `deploy_api_lambda.sh` | Creates/updates the Go API Lambda. |
| `create_http_api.sh` | Creates the API Gateway HTTP API and wires both routes. |
| `deploy_frontend.sh` | Builds the frontend, uploads to S3, invalidates CloudFront. |
| `create_frontend_cdn.sh` | One-shot: makes the S3 bucket + CloudFront distribution. |
| `trust-policy.json` | IAM trust policy for the Lambda execution role. |

## Order of operations (first time)

```bash
# 0) Edit names / region / account id in env.sh, then:
source infra/aws/env.sh

# 1) Backend
bash infra/aws/build_runner_lambda.sh
bash infra/aws/build_api_lambda.sh
bash infra/aws/deploy_runner_lambda.sh
bash infra/aws/deploy_api_lambda.sh
bash infra/aws/create_http_api.sh      # prints API_BASE URL

# 2) Frontend
bash infra/aws/create_frontend_cdn.sh  # first time only; prints CF domain
bash infra/aws/deploy_frontend.sh      # every time frontend changes
```

The README next to this file in `DEPLOY_AWS.md` walks through the same
steps with full explanations and the manual-CLI equivalent of each
script, so you can run the commands by hand if you prefer.

## Re-deploy (after code changes)

```bash
source infra/aws/env.sh

# Backend code change (Python runner)
bash infra/aws/build_runner_lambda.sh && bash infra/aws/deploy_runner_lambda.sh

# Backend code change (Go API)
bash infra/aws/build_api_lambda.sh && bash infra/aws/deploy_api_lambda.sh

# Frontend code change
bash infra/aws/deploy_frontend.sh
```

## Known caveats (read this before you promise prod SLAs)

1. **SQLite is ephemeral on Lambda.** The API Lambda writes its SQLite
   DB under `/tmp`, which is wiped on every cold start. That is fine for
   a portfolio demo (practice progress still lives in `localStorage` in
   the browser). For real persistence: mount EFS at `/mnt/kitkode` and
   set `DATABASE_PATH=/mnt/kitkode/kitkode.db`, or port
   `backend-go/internal/store` to DynamoDB.

2. **Cold starts.** Both Lambdas will take ~300–800 ms on the first hit
   after idle. Add provisioned concurrency (= $) if you need snappier
   first-clicks.

3. **Untrusted code execution.** The Python runner uses subprocess +
   AST restrictions. That is safe *enough* inside Lambda's firecracker
   microVM for a demo, but do NOT open it to the public internet as a
   free code-sandbox-for-anyone service without adding further
   sandboxing. The same caveat applies to every other provider.

4. **Binary wheels.** `requirements-lambda.txt` is pinned to
   pure-Python / manylinux2014 wheels for `python3.11` on `x86_64`. If
   you ever add a C-extension dependency (NumPy, Pillow, etc.) build the
   zip inside a `public.ecr.aws/lambda/python:3.11-x86_64` container so
   the wheels match Lambda's glibc.
