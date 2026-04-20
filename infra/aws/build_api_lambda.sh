#!/usr/bin/env bash
# Build a Lambda deployment zip for the Go API.
#
# Output: backend-go/dist/${API_LAMBDA_NAME}.zip
#
# Uses the provided.al2023 custom runtime, which expects a binary named
# `bootstrap` at the zip root. We cross-compile a static binary with
# CGO disabled so no shared libs leak in.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

API_SRC="${REPO_ROOT}/backend-go"
BUILD_DIR="${API_BUILD_DIR}/_pkg"

echo "[api] wiping ${BUILD_DIR}"
rm -rf "${BUILD_DIR}" "${API_ZIP}"
mkdir -p "${BUILD_DIR}" "${API_BUILD_DIR}"

echo "[api] compiling bootstrap (linux/amd64, CGO off)"
( cd "${API_SRC}" && \
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" \
    -o "${BUILD_DIR}/bootstrap" \
    ./cmd/lambda )
chmod +x "${BUILD_DIR}/bootstrap"

echo "[api] zipping -> ${API_ZIP}"
( cd "${BUILD_DIR}" && zip -q9 "${API_ZIP}" bootstrap )

size_mb=$(( $(stat -c%s "${API_ZIP}") / 1024 / 1024 ))
echo "[api] done: ${API_ZIP} (${size_mb} MB)"
