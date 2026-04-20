#!/usr/bin/env bash
# Create-or-update the Python runner Lambda from the zip built by
# build_runner_lambda.sh. Idempotent.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

[[ -f "${RUNNER_ZIP}" ]] || { echo "Missing ${RUNNER_ZIP}. Run build_runner_lambda.sh first." >&2; exit 1; }

bash "${SCRIPT_DIR}/ensure_role.sh" >/dev/null

# The FastAPI runner writes to /tmp when it shells out to subprocess
# sandboxes; nothing else needs to be writable.
RUNNER_ENV_VARS='{"Variables":{"PYTHONPATH":"/var/task","RUNNER_USE_SUBPROCESS":"1","RUNNER_USE_DOCKER":"0","RUNNER_CORS_ORIGINS":"*"}}'

if aws lambda get-function --function-name "${RUNNER_LAMBDA_NAME}" --region "${AWS_REGION}" >/dev/null 2>&1; then
  echo "[runner] updating existing Lambda ${RUNNER_LAMBDA_NAME}"
  aws lambda update-function-code \
    --region "${AWS_REGION}" \
    --function-name "${RUNNER_LAMBDA_NAME}" \
    --zip-file "fileb://${RUNNER_ZIP}" \
    --publish >/dev/null
  aws lambda wait function-updated \
    --region "${AWS_REGION}" \
    --function-name "${RUNNER_LAMBDA_NAME}"
  aws lambda update-function-configuration \
    --region "${AWS_REGION}" \
    --function-name "${RUNNER_LAMBDA_NAME}" \
    --handler "app.lambda_handler.handler" \
    --runtime python3.11 \
    --timeout 30 \
    --memory-size 512 \
    --environment "${RUNNER_ENV_VARS}" >/dev/null
else
  echo "[runner] creating Lambda ${RUNNER_LAMBDA_NAME}"
  aws lambda create-function \
    --region "${AWS_REGION}" \
    --function-name "${RUNNER_LAMBDA_NAME}" \
    --runtime python3.11 \
    --architectures x86_64 \
    --role "${LAMBDA_ROLE_ARN}" \
    --handler "app.lambda_handler.handler" \
    --timeout 30 \
    --memory-size 512 \
    --environment "${RUNNER_ENV_VARS}" \
    --zip-file "fileb://${RUNNER_ZIP}" >/dev/null
  aws lambda wait function-active \
    --region "${AWS_REGION}" \
    --function-name "${RUNNER_LAMBDA_NAME}"
fi

RUNNER_ARN=$(aws lambda get-function --region "${AWS_REGION}" --function-name "${RUNNER_LAMBDA_NAME}" --query 'Configuration.FunctionArn' --output text)
echo "RUNNER_LAMBDA_ARN=${RUNNER_ARN}"
