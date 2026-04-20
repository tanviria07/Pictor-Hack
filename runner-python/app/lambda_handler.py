"""AWS Lambda entry point for the Kitkode Python runner (FastAPI app).

This module is the single file AWS Lambda imports. It wraps the existing
FastAPI application with Mangum so the same `app/main.py` works both as a
local uvicorn server and as a Lambda behind API Gateway (HTTP API).

How it plumbs together:

    API Gateway (HTTP API, $default route)
        -> Lambda (runtime: python3.11)
           -> module: app.lambda_handler
           -> handler function: handler
              -> Mangum(app)
                 -> app.main:app  (the FastAPI instance)

Deploy notes (kept in sync with infra/aws/deploy_runner_lambda.sh):
- Lambda handler string is `app.lambda_handler.handler`.
- Architecture must match the wheels you package (x86_64 is safest).
- `RUNNER_USE_SUBPROCESS=1` keeps the sandbox path the same as the
  container: user code runs in a child Python process of the Lambda,
  still inside Lambda's own firecracker microVM.
- Lambda has a read-only filesystem except for /tmp. The subprocess
  sandbox writes to /tmp automatically via Python's default tempdir.
"""

from __future__ import annotations

from mangum import Mangum

from app.main import app

# `api_gateway_base_path` is "/" because we use API Gateway's $default
# stage (no /prod or /stage prefix). `lifespan="off"` avoids Mangum
# trying to run FastAPI startup/shutdown events on every cold start,
# which FastAPI itself doesn't need here.
handler = Mangum(app, lifespan="off", api_gateway_base_path="/")
