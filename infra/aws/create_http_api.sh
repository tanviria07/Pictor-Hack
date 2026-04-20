#!/usr/bin/env bash
# Create (or reuse) the HTTP API that fronts both Lambdas.
#
# Route table:
#   ANY  /runner/{proxy+}   -> Lambda: ${RUNNER_LAMBDA_NAME}
#   ANY  $default           -> Lambda: ${API_LAMBDA_NAME}
#
# The runner sits behind /runner/* so the Go API can call it at
# "${INVOKE_URL}/runner/evaluate" etc. Everything else falls through to
# the Go API (health, /api/*).
#
# HTTP APIs auto-create a "$default" stage that is always live at
# https://<api-id>.execute-api.<region>.amazonaws.com with no
# stage-name prefix.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

API_LAMBDA_ARN=$(aws lambda get-function --region "${AWS_REGION}" --function-name "${API_LAMBDA_NAME}" --query 'Configuration.FunctionArn' --output text)
RUNNER_LAMBDA_ARN=$(aws lambda get-function --region "${AWS_REGION}" --function-name "${RUNNER_LAMBDA_NAME}" --query 'Configuration.FunctionArn' --output text)

# 1) Reuse or create the HTTP API.
API_ID=$(aws apigatewayv2 get-apis --region "${AWS_REGION}" \
  --query "Items[?Name=='${HTTP_API_NAME}'] | [0].ApiId" --output text)
if [[ -z "${API_ID}" || "${API_ID}" == "None" ]]; then
  echo "[apigw] creating HTTP API ${HTTP_API_NAME}"
  API_ID=$(aws apigatewayv2 create-api \
    --region "${AWS_REGION}" \
    --name "${HTTP_API_NAME}" \
    --protocol-type HTTP \
    --cors-configuration AllowOrigins='*',AllowMethods=GET,POST,OPTIONS,AllowHeaders=Content-Type \
    --query 'ApiId' --output text)
else
  echo "[apigw] reusing HTTP API ${HTTP_API_NAME} (${API_ID})"
fi

ensure_integration () {
  local label="$1" lambda_arn="$2"
  local found
  found=$(aws apigatewayv2 get-integrations --region "${AWS_REGION}" --api-id "${API_ID}" \
    --query "Items[?IntegrationUri=='${lambda_arn}'] | [0].IntegrationId" --output text)
  if [[ -z "${found}" || "${found}" == "None" ]]; then
    echo "[apigw] creating integration for ${label}"
    aws apigatewayv2 create-integration \
      --region "${AWS_REGION}" \
      --api-id "${API_ID}" \
      --integration-type AWS_PROXY \
      --integration-uri "${lambda_arn}" \
      --payload-format-version 2.0 \
      --query 'IntegrationId' --output text
  else
    echo "${found}"
  fi
}

API_INTEGRATION_ID=$(ensure_integration "api" "${API_LAMBDA_ARN}")
RUNNER_INTEGRATION_ID=$(ensure_integration "runner" "${RUNNER_LAMBDA_ARN}")

ensure_route () {
  local route_key="$1" integration_id="$2"
  local found
  found=$(aws apigatewayv2 get-routes --region "${AWS_REGION}" --api-id "${API_ID}" \
    --query "Items[?RouteKey=='${route_key}'] | [0].RouteId" --output text)
  if [[ -z "${found}" || "${found}" == "None" ]]; then
    echo "[apigw] creating route ${route_key}"
    aws apigatewayv2 create-route \
      --region "${AWS_REGION}" \
      --api-id "${API_ID}" \
      --route-key "${route_key}" \
      --target "integrations/${integration_id}" >/dev/null
  else
    echo "[apigw] route ${route_key} already exists"
  fi
}

ensure_route 'ANY /runner/{proxy+}' "${RUNNER_INTEGRATION_ID}"
ensure_route '$default'             "${API_INTEGRATION_ID}"

# Auto-deploy stage so route changes go live without another CLI call.
if ! aws apigatewayv2 get-stage --region "${AWS_REGION}" --api-id "${API_ID}" --stage-name '$default' >/dev/null 2>&1; then
  echo "[apigw] creating \$default stage with auto-deploy"
  aws apigatewayv2 create-stage \
    --region "${AWS_REGION}" \
    --api-id "${API_ID}" \
    --stage-name '$default' \
    --auto-deploy >/dev/null
fi

# Permission: API Gateway must be allowed to invoke each Lambda.
add_perm () {
  local fn_name="$1" stmt_id="$2"
  if ! aws lambda get-policy --region "${AWS_REGION}" --function-name "${fn_name}" --output text 2>/dev/null | grep -q "${stmt_id}"; then
    aws lambda add-permission \
      --region "${AWS_REGION}" \
      --function-name "${fn_name}" \
      --statement-id "${stmt_id}" \
      --action lambda:InvokeFunction \
      --principal apigateway.amazonaws.com \
      --source-arn "arn:aws:execute-api:${AWS_REGION}:${AWS_ACCOUNT_ID}:${API_ID}/*/*" >/dev/null
  fi
}

add_perm "${API_LAMBDA_NAME}"    "apigw-invoke-api"
add_perm "${RUNNER_LAMBDA_NAME}" "apigw-invoke-runner"

INVOKE_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com"
echo
echo "HTTP_API_ID=${API_ID}"
echo "API_BASE=${INVOKE_URL}"
echo "RUNNER_URL=${INVOKE_URL}/runner"
echo
echo "Next steps:"
echo "  1) Re-run deploy_api_lambda.sh so RUNNER_URL picks up this value."
echo "     RUNNER_URL='${INVOKE_URL}/runner' bash infra/aws/deploy_api_lambda.sh"
echo "  2) Build the frontend with API_BASE='${INVOKE_URL}'"
echo "     then run deploy_frontend.sh"
