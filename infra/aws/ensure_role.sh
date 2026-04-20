#!/usr/bin/env bash
# Create (or reuse) the shared Lambda execution role.
#
# Gives both Lambdas AWSLambdaBasicExecutionRole, which is just enough
# to write CloudWatch logs. No VPC, no extra AWS permissions — that
# keeps the blast radius small and the IAM surface beginner-friendly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

if aws iam get-role --role-name "${LAMBDA_ROLE_NAME}" >/dev/null 2>&1; then
  echo "[iam] role ${LAMBDA_ROLE_NAME} already exists — reusing"
else
  echo "[iam] creating role ${LAMBDA_ROLE_NAME}"
  aws iam create-role \
    --role-name "${LAMBDA_ROLE_NAME}" \
    --assume-role-policy-document "file://${SCRIPT_DIR}/trust-policy.json" \
    --tags Key=Project,Value="${PROJECT}" >/dev/null

  aws iam attach-role-policy \
    --role-name "${LAMBDA_ROLE_NAME}" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  # IAM is eventually consistent — give the trust policy a moment to
  # propagate before Lambda tries to assume it.
  echo "[iam] waiting 10s for role to propagate"
  sleep 10
fi

echo "LAMBDA_ROLE_ARN=${LAMBDA_ROLE_ARN}"
