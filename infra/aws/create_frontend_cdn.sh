#!/usr/bin/env bash
# One-shot: create the S3 bucket for the SPA and a CloudFront
# distribution in front of it.
#
# What this script does:
#   1. Creates the bucket in ${AWS_REGION}.
#   2. Applies a bucket policy that allows only the CloudFront
#      distribution (via OAC) to read objects. The bucket is NOT a
#      "public website" — access is gated by CloudFront. This is the
#      2024+ best practice and avoids the classic S3-website pitfalls
#      (HTTP only, no SigV4, etc.).
#   3. Creates an Origin Access Control so CloudFront can sign requests.
#   4. Creates the CloudFront distribution with a custom error response
#      that rewrites 403/404 -> index.html, so the SPA's client-side
#      routing works on hard refresh.
#
# After this runs, run deploy_frontend.sh to actually upload files.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=env.sh
source "${SCRIPT_DIR}/env.sh"

# 1) Bucket.
if aws s3api head-bucket --bucket "${FRONTEND_BUCKET}" 2>/dev/null; then
  echo "[s3] bucket ${FRONTEND_BUCKET} already exists"
else
  echo "[s3] creating bucket ${FRONTEND_BUCKET} in ${AWS_REGION}"
  if [[ "${AWS_REGION}" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "${FRONTEND_BUCKET}" --region "${AWS_REGION}" >/dev/null
  else
    aws s3api create-bucket --bucket "${FRONTEND_BUCKET}" --region "${AWS_REGION}" \
      --create-bucket-configuration LocationConstraint="${AWS_REGION}" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "${FRONTEND_BUCKET}" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true >/dev/null
fi

# 2) Origin Access Control.
OAC_NAME="${PROJECT}-oac"
OAC_ID=$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'] | [0].Id" --output text)
if [[ -z "${OAC_ID}" || "${OAC_ID}" == "None" ]]; then
  echo "[cf] creating origin access control ${OAC_NAME}"
  OAC_ID=$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "Name=${OAC_NAME},SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)
else
  echo "[cf] reusing origin access control ${OAC_NAME}"
fi

# 3) CloudFront distribution.
CALLER_REF="${PROJECT}-$(date +%s)"
DIST_CONFIG=$(cat <<JSON
{
  "CallerReference": "${CALLER_REF}",
  "Comment": "${PROJECT} frontend",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-${FRONTEND_BUCKET}",
      "DomainName": "${FRONTEND_BUCKET}.s3.${AWS_REGION}.amazonaws.com",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "OriginAccessControlId": "${OAC_ID}"
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-${FRONTEND_BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"], "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      { "ErrorCode": 403, "ResponseCode": "200", "ResponsePagePath": "/index.html", "ErrorCachingMinTTL": 0 },
      { "ErrorCode": 404, "ResponseCode": "200", "ResponsePagePath": "/index.html", "ErrorCachingMinTTL": 0 }
    ]
  },
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": { "CloudFrontDefaultCertificate": true }
}
JSON
)

# Find an existing distribution for this bucket before creating another.
EXISTING_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Origins.Items[?contains(DomainName, '${FRONTEND_BUCKET}')]] | [0].Id" \
  --output text 2>/dev/null || true)

if [[ -n "${EXISTING_DIST_ID}" && "${EXISTING_DIST_ID}" != "None" ]]; then
  DIST_ID="${EXISTING_DIST_ID}"
  echo "[cf] reusing distribution ${DIST_ID}"
else
  echo "[cf] creating distribution"
  DIST_ID=$(aws cloudfront create-distribution \
    --distribution-config "${DIST_CONFIG}" \
    --query 'Distribution.Id' --output text)
fi

DIST_DOMAIN=$(aws cloudfront get-distribution --id "${DIST_ID}" --query 'Distribution.DomainName' --output text)

# 4) Bucket policy: only this distribution can read.
POLICY=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontReadOnly",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${FRONTEND_BUCKET}/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${DIST_ID}" } }
  }]
}
JSON
)
aws s3api put-bucket-policy --bucket "${FRONTEND_BUCKET}" --policy "${POLICY}"

echo
echo "CLOUDFRONT_DISTRIBUTION_ID=${DIST_ID}"
echo "CLOUDFRONT_DOMAIN=${DIST_DOMAIN}"
echo
echo "Add these to your shell or to env.sh so deploy_frontend.sh can invalidate cache:"
echo "  export CLOUDFRONT_DISTRIBUTION_ID=${DIST_ID}"
echo "  export CLOUDFRONT_DOMAIN=${DIST_DOMAIN}"
echo
echo "The distribution can take 5-15 minutes to finish deploying the first time."
