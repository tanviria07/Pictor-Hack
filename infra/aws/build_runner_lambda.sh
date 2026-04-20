#!/usr/bin/env bash
# Build a Lambda deployment zip for the FastAPI runner.
#
# Output: runner-python/dist/${RUNNER_LAMBDA_NAME}.zip
#
# Strategy:
#   1. Create a fresh build dir.
#   2. `pip install` runtime deps into it (targeting Linux x86_64
#      manylinux2014 wheels so they run on Lambda's Amazon Linux 2023).
#   3. Copy the app source and the `problems/` folder next to it.
#   4. Zip the contents (not the folder — Lambda wants files at root).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

RUNNER_SRC="${REPO_ROOT}/runner-python"
BUILD_DIR="${RUNNER_BUILD_DIR}/_pkg"

echo "[runner] wiping ${BUILD_DIR}"
rm -rf "${BUILD_DIR}" "${RUNNER_ZIP}"
mkdir -p "${BUILD_DIR}" "${RUNNER_BUILD_DIR}"

echo "[runner] installing runtime deps into build dir"
python3 -m pip install \
  --no-cache-dir \
  --upgrade \
  --platform manylinux2014_x86_64 \
  --target "${BUILD_DIR}" \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  -r "${RUNNER_SRC}/requirements-lambda.txt"

echo "[runner] copying app/ and problems/"
cp -r "${RUNNER_SRC}/app" "${BUILD_DIR}/app"
cp -r "${RUNNER_SRC}/problems" "${BUILD_DIR}/problems"

echo "[runner] stripping test / cache files"
find "${BUILD_DIR}" -type d \( -name __pycache__ -o -name tests -o -name "*.dist-info" \) -prune -exec rm -rf {} +
find "${BUILD_DIR}" -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete

echo "[runner] zipping -> ${RUNNER_ZIP}"
( cd "${BUILD_DIR}" && zip -qr9 "${RUNNER_ZIP}" . )

size_mb=$(( $(stat -c%s "${RUNNER_ZIP}") / 1024 / 1024 ))
echo "[runner] done: ${RUNNER_ZIP} (${size_mb} MB)"
if (( size_mb > 48 )); then
  echo "[runner] WARNING: zip is close to the 50 MB direct-upload cap."
  echo "[runner] If you ever exceed 50 MB, upload to S3 and use --code S3Bucket=..."
fi
