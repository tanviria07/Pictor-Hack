# infra/aws/env.sh — EDIT THIS FIRST
#
# Single source of truth for names, regions, and ARNs used by the
# build_* / deploy_* helper scripts.  `source` this file before running
# any of them:
#
#     source infra/aws/env.sh
#
# Everything here is a shell variable, so you can also override ad hoc:
#
#     AWS_REGION=eu-west-1 bash infra/aws/deploy_api_lambda.sh

# shellcheck shell=bash

# ---------------------------------------------------------------------------
# Identity & region
# ---------------------------------------------------------------------------

# Your 12-digit AWS account id (leave blank to auto-detect via STS).
export AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
if [[ -z "${AWS_ACCOUNT_ID}" ]]; then
  if command -v aws >/dev/null 2>&1; then
    AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
    export AWS_ACCOUNT_ID
  fi
fi

# Pick any region you like; us-east-1 is cheapest for CloudFront + Free Tier.
export AWS_REGION="${AWS_REGION:-us-east-1}"

# ---------------------------------------------------------------------------
# Names (safe defaults — change freely if you want a different prefix)
# ---------------------------------------------------------------------------

export PROJECT="${PROJECT:-kitkode}"

# Lambdas
export API_LAMBDA_NAME="${API_LAMBDA_NAME:-${PROJECT}-api}"
export RUNNER_LAMBDA_NAME="${RUNNER_LAMBDA_NAME:-${PROJECT}-runner}"

# IAM
export LAMBDA_ROLE_NAME="${LAMBDA_ROLE_NAME:-${PROJECT}-lambda-role}"
export LAMBDA_ROLE_ARN="${LAMBDA_ROLE_ARN:-arn:aws:iam::${AWS_ACCOUNT_ID}:role/${LAMBDA_ROLE_NAME}}"

# API Gateway
export HTTP_API_NAME="${HTTP_API_NAME:-${PROJECT}-http-api}"

# S3 bucket for the SPA. Bucket names are globally unique, so this is a
# suffix pattern you will almost certainly need to change.
export FRONTEND_BUCKET="${FRONTEND_BUCKET:-${PROJECT}-frontend-${AWS_ACCOUNT_ID}}"

# CloudFront — set automatically by create_frontend_cdn.sh
export CLOUDFRONT_DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
export CLOUDFRONT_DOMAIN="${CLOUDFRONT_DOMAIN:-}"

# ---------------------------------------------------------------------------
# Build outputs
# ---------------------------------------------------------------------------

export REPO_ROOT
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export API_BUILD_DIR="${REPO_ROOT}/backend-go/dist"
export API_ZIP="${API_BUILD_DIR}/${API_LAMBDA_NAME}.zip"

export RUNNER_BUILD_DIR="${REPO_ROOT}/runner-python/dist"
export RUNNER_ZIP="${RUNNER_BUILD_DIR}/${RUNNER_LAMBDA_NAME}.zip"

# ---------------------------------------------------------------------------
# Runtime env vars injected into each Lambda on deploy
# ---------------------------------------------------------------------------

# Plug secrets in before running the deploy scripts. Leave anything you
# don't use blank — the scripts skip empty vars.
export GEMINI_API_KEY="${GEMINI_API_KEY:-}"
export DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
