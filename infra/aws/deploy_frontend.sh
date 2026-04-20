#!/usr/bin/env bash
# Build the Parcel SPA and push it to the S3 bucket created by
# create_frontend_cdn.sh, then invalidate CloudFront so viewers get the
# fresh bundle immediately.
#
# Usage:
#   API_BASE=https://abcd1234.execute-api.us-east-1.amazonaws.com \
#     bash infra/aws/deploy_frontend.sh
#
# API_BASE is the HTTP API invoke URL printed by create_http_api.sh.
# Parcel inlines process.env.API_BASE at build time, so this must be
# set before `npm run build` or the bundle will try same-origin /api
# (which CloudFront doesn't proxy to).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

: "${API_BASE:?set API_BASE=https://<api-id>.execute-api.<region>.amazonaws.com first}"

FRONTEND_DIR="${REPO_ROOT}/frontend"

echo "[front] API_BASE=${API_BASE}"
echo "[front] building frontend"
( cd "${FRONTEND_DIR}" && npm ci --no-audit --no-fund )
( cd "${FRONTEND_DIR}" && API_BASE="${API_BASE}" npm run build )

# Hashed asset files (e.g. frontend.abc123.js) get a long max-age;
# index.html gets no-cache so a new build is picked up immediately.
echo "[front] syncing assets (long cache)"
aws s3 sync "${FRONTEND_DIR}/dist/" "s3://${FRONTEND_BUCKET}/" \
  --region "${AWS_REGION}" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

echo "[front] uploading index.html (no cache)"
aws s3 cp "${FRONTEND_DIR}/dist/index.html" "s3://${FRONTEND_BUCKET}/index.html" \
  --region "${AWS_REGION}" \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html; charset=utf-8"

if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID}" ]]; then
  echo "[front] invalidating CloudFront cache"
  aws cloudfront create-invalidation \
    --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
    --paths "/*" >/dev/null
else
  echo "[front] CLOUDFRONT_DISTRIBUTION_ID not set — skipping invalidation"
fi

echo
if [[ -n "${CLOUDFRONT_DOMAIN}" ]]; then
  echo "Open: https://${CLOUDFRONT_DOMAIN}"
fi
