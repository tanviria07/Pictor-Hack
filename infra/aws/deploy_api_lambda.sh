#!/usr/bin/env bash
# Create-or-update the Go API Lambda from the zip built by
# build_api_lambda.sh. Idempotent. Automatically points RUNNER_URL at
# the runner Lambda's API Gateway route (if the HTTP API already
# exists) or at an internal placeholder you can override via
# `RUNNER_URL=... bash deploy_api_lambda.sh`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

[[ -f "${API_ZIP}" ]] || { echo "Missing ${API_ZIP}. Run build_api_lambda.sh first." >&2; exit 1; }

bash "${SCRIPT_DIR}/ensure_role.sh" >/dev/null

# Runtime env. The Go API reads everything from env; leave empty values
# blank so defaults in backend-go/internal/config/config.go kick in.
RUNNER_URL="${RUNNER_URL:-}"
if [[ -z "${RUNNER_URL}" ]]; then
  # If the HTTP API already exists, reuse its invoke URL (the runner
  # lives at /runner/*). Falls back to a placeholder otherwise; you can
  # re-run this script after create_http_api.sh prints the URL.
  RUNNER_URL=$(aws apigatewayv2 get-apis --region "${AWS_REGION}" \
    --query "Items[?Name=='${HTTP_API_NAME}'] | [0].ApiEndpoint" \
    --output text 2>/dev/null || true)
  if [[ -n "${RUNNER_URL}" && "${RUNNER_URL}" != "None" ]]; then
    RUNNER_URL="${RUNNER_URL}/runner"
  else
    RUNNER_URL="http://placeholder-set-after-create-http-api"
  fi
fi

env_json=$(python3 - <<PY
import json, os
vars = {
    "DATABASE_PATH": "/tmp/kitkode.db",
    "RUNNER_URL": os.environ["RUNNER_URL"],
    "CORS_ORIGINS": os.environ.get("CORS_ORIGINS", "*"),
    "PORT": "8080",
}
for k in ("GEMINI_API_KEY", "GEMINI_MODEL", "DEEPSEEK_API_KEY"):
    v = os.environ.get(k, "")
    if v:
        vars[k] = v
print(json.dumps({"Variables": vars}))
PY
)
export RUNNER_URL

if aws lambda get-function --function-name "${API_LAMBDA_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "[api] updating existing Lambda ${API_LAMBDA_NAME}"
  aws lambda update-function-code \
    --region "${AWS_REGION}" \
    --function-name "${API_LAMBDA_NAME}" \
    --zip-file "fileb://${API_ZIP}" \
    --publish >/dev/null
  aws lambda wait function-updated \
    --region "${AWS_REGION}" \
    --function-name "${API_LAMBDA_NAME}"
  aws lambda update-function-configuration \
    --region "${AWS_REGION}" \
    --function-name "${API_LAMBDA_NAME}" \
    --handler "bootstrap" \
    --runtime provided.al2023 \
    --timeout 30 \
    --memory-size 512 \
    --environment "${env_json}" >/dev/null
else
  echo "[api] creating Lambda ${API_LAMBDA_NAME}"
  aws lambda create-function \
    --region "${AWS_REGION}" \
    --function-name "${API_LAMBDA_NAME}" \
    --runtime provided.al2023 \
    --architectures x86_64 \
    --role "${LAMBDA_ROLE_ARN}" \
    --handler bootstrap \
    --timeout 30 \
    --memory-size 512 \
    --environment "${env_json}" \
    --zip-file "fileb://${API_ZIP}" >/dev/null
  aws lambda wait function-active \
    --region "${AWS_REGION}" \
    --function-name "${API_LAMBDA_NAME}"
fi

API_ARN=$(aws lambda get-function --region "${AWS_REGION}" --function-name "${API_LAMBDA_NAME}" --query 'Configuration.FunctionArn' --output text)
echo "API_LAMBDA_ARN=${API_ARN}"
echo "RUNNER_URL (baked into api env) = ${RUNNER_URL}"
