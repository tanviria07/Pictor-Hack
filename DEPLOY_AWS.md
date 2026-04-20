# Deploy Kitkode on AWS (serverless, free-tier friendly)

A complete end-to-end AWS deploy using only **Lambda + API Gateway + S3 +
CloudFront**. No ECS, no EC2, no containers to push.

> **Heads-up on this repo's shape.** The task prompt mentions a FastAPI
> backend, but Kitkode's *main* API is actually the **Go** service in
> `backend-go/`. There *is* a FastAPI service too — `runner-python/` —
> which evaluates user code. This guide deploys *both*: the Go API as one
> Lambda, and the FastAPI runner as a second Lambda (using **Mangum**),
> behind a shared API Gateway HTTP API. If you only care about the
> FastAPI half, skip the Go steps; everything is additive.

## 1. Final architecture

```
 Browser ──HTTPS──▶ CloudFront ──/ (cached)──▶ S3 (frontend/dist/)
                              └──/api/*───────▶ API Gateway (HTTP API)
                                                 │
                                                 ├─▶ Lambda: kitkode-api     (Go, provided.al2023)
                                                 │     └── calls RUNNER_URL
                                                 └─▶ Lambda: kitkode-runner  (Python + FastAPI + Mangum)
```

The Go API calls the Python runner over HTTP via the same API Gateway
(`/runner/*` route). That keeps both Lambdas configuration-free: no VPC,
no private integrations, no internal networking.

## 2. Repo layout added by this change

```
backend-go/
  cmd/lambda/main.go          # Lambda entry point (Go)
frontend/                     # (unchanged — Parcel SPA)
runner-python/
  app/lambda_handler.py       # Lambda entry point (Mangum wraps app.main:app)
  requirements-lambda.txt     # Slim runtime deps for the Lambda zip
infra/
  aws/
    README.md
    env.sh                    # Edit names, region, secrets
    trust-policy.json         # Lambda IAM trust policy
    ensure_role.sh
    build_api_lambda.sh
    build_runner_lambda.sh
    deploy_api_lambda.sh
    deploy_runner_lambda.sh
    create_http_api.sh
    create_frontend_cdn.sh
    deploy_frontend.sh
```

## 3. Prerequisites

- AWS account with billing enabled (Free Tier covers this deploy at
  small traffic levels).
- `aws` CLI v2 logged in: `aws configure` and `aws sts get-caller-identity`
  should succeed.
- Local tools: `python3.11`, `go 1.22+`, `node 18+`, `zip`, `bash`.
- One IAM user or role with (at minimum): `iam:*`, `lambda:*`,
  `apigateway:*`, `s3:*`, `cloudfront:*`. The included scripts create a
  narrow role for the Lambdas themselves; those broad permissions are
  only what **you** need to *run* the deploy scripts.

## 4. Configure once: `infra/aws/env.sh`

Open `infra/aws/env.sh` and set the variables at the top. The only ones
you must change are usually `AWS_REGION` (if you don't like `us-east-1`)
and `FRONTEND_BUCKET` (S3 bucket names are globally unique). Optionally
fill in `GEMINI_API_KEY` / `DEEPSEEK_API_KEY` if you use the Jose voice
coach or the DeepSeek-phrased hints; otherwise leave blank.

```bash
source infra/aws/env.sh
```

From here every script inherits those variables.

## 5. Deploy the FastAPI runner Lambda (Python)

The Mangum adapter lives at `runner-python/app/lambda_handler.py`:

```python
# runner-python/app/lambda_handler.py
from mangum import Mangum
from app.main import app
handler = Mangum(app, lifespan="off", api_gateway_base_path="/")
```

And the trimmed runtime deps at `runner-python/requirements-lambda.txt`:

```
fastapi==0.115.6
pydantic==2.10.4
mangum==0.19.0
```

Build + deploy:

```bash
bash infra/aws/build_runner_lambda.sh
bash infra/aws/deploy_runner_lambda.sh
```

If you prefer to run the raw CLI:

```bash
# 1) Build the zip
RUNNER=runner-python
PKG=$RUNNER/dist/_pkg
rm -rf $PKG && mkdir -p $PKG
python3 -m pip install \
  --platform manylinux2014_x86_64 \
  --target $PKG \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  -r $RUNNER/requirements-lambda.txt
cp -r $RUNNER/app $PKG/app
cp -r $RUNNER/problems $PKG/problems
( cd $PKG && zip -qr9 ../kitkode-runner.zip . )

# 2) Create the IAM role (one-time)
aws iam create-role \
  --role-name kitkode-lambda-role \
  --assume-role-policy-document file://infra/aws/trust-policy.json
aws iam attach-role-policy \
  --role-name kitkode-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# 3) Create the Lambda
aws lambda create-function \
  --function-name kitkode-runner \
  --runtime python3.11 \
  --architectures x86_64 \
  --role arn:aws:iam::<ACCOUNT_ID>:role/kitkode-lambda-role \
  --handler app.lambda_handler.handler \
  --timeout 30 \
  --memory-size 512 \
  --environment 'Variables={PYTHONPATH=/var/task,RUNNER_USE_SUBPROCESS=1,RUNNER_USE_DOCKER=0,RUNNER_CORS_ORIGINS=*}' \
  --zip-file fileb://runner-python/dist/kitkode-runner.zip
```

## 6. Deploy the Go API Lambda

The Lambda entry point is `backend-go/cmd/lambda/main.go`. It reuses the
exact same chi router as the long-running server (`cmd/server`), hooked
up via [`aws-lambda-go-api-proxy`](https://github.com/awslabs/aws-lambda-go-api-proxy):

```go
router := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)
adapter := httpadapter.NewV2(router)
lambda.Start(adapter.ProxyWithContext)
```

Build + deploy:

```bash
bash infra/aws/build_api_lambda.sh
bash infra/aws/deploy_api_lambda.sh
```

Raw CLI equivalent:

```bash
# 1) Build the zip (provided.al2023 custom runtime expects `bootstrap`)
cd backend-go
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
  go build -trimpath -ldflags="-s -w" -o dist/_pkg/bootstrap ./cmd/lambda
chmod +x dist/_pkg/bootstrap
( cd dist/_pkg && zip -q9 ../kitkode-api.zip bootstrap )
cd ..

# 2) Create the Lambda
aws lambda create-function \
  --function-name kitkode-api \
  --runtime provided.al2023 \
  --architectures x86_64 \
  --role arn:aws:iam::<ACCOUNT_ID>:role/kitkode-lambda-role \
  --handler bootstrap \
  --timeout 30 \
  --memory-size 512 \
  --environment 'Variables={DATABASE_PATH=/tmp/kitkode.db,RUNNER_URL=placeholder,CORS_ORIGINS=*,PORT=8080}' \
  --zip-file fileb://backend-go/dist/kitkode-api.zip
```

`RUNNER_URL` is a placeholder at this point — we fill it in after API
Gateway exists.

### SQLite caveat

Lambda's root filesystem is read-only; only `/tmp` is writable, and
`/tmp` is wiped on cold start. `DATABASE_PATH=/tmp/kitkode.db` is fine
for a demo (practice progress still lives in browser `localStorage`).
For real persistence, mount EFS at `/mnt/kitkode` and set
`DATABASE_PATH=/mnt/kitkode/kitkode.db`, or port
`backend-go/internal/store` to DynamoDB.

## 7. Wire both Lambdas behind API Gateway (HTTP API)

```bash
bash infra/aws/create_http_api.sh
```

The script creates an HTTP API with two routes:

| Route | Integration |
|-------|-------------|
| `ANY /runner/{proxy+}` | `kitkode-runner` Lambda |
| `$default` (everything else) | `kitkode-api` Lambda |

It then adds `lambda:InvokeFunction` permissions for API Gateway on both
Lambdas and creates the auto-deploy `$default` stage.

Raw CLI (abbreviated — the script handles idempotency):

```bash
API_ID=$(aws apigatewayv2 create-api \
  --name kitkode-http-api \
  --protocol-type HTTP \
  --cors-configuration AllowOrigins='*',AllowMethods=GET,POST,OPTIONS,AllowHeaders=Content-Type \
  --query ApiId --output text)

# Integration per Lambda
API_INT=$(aws apigatewayv2 create-integration \
  --api-id $API_ID --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:$AWS_REGION:$ACCT:function:kitkode-api \
  --payload-format-version 2.0 --query IntegrationId --output text)

RUN_INT=$(aws apigatewayv2 create-integration \
  --api-id $API_ID --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:$AWS_REGION:$ACCT:function:kitkode-runner \
  --payload-format-version 2.0 --query IntegrationId --output text)

# Routes
aws apigatewayv2 create-route --api-id $API_ID \
  --route-key 'ANY /runner/{proxy+}' --target integrations/$RUN_INT
aws apigatewayv2 create-route --api-id $API_ID \
  --route-key '$default' --target integrations/$API_INT

# Auto-deploying stage
aws apigatewayv2 create-stage --api-id $API_ID --stage-name '$default' --auto-deploy

# Invoke permissions
aws lambda add-permission --function-name kitkode-api \
  --statement-id apigw --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn arn:aws:execute-api:$AWS_REGION:$ACCT:$API_ID/*/*

aws lambda add-permission --function-name kitkode-runner \
  --statement-id apigw --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn arn:aws:execute-api:$AWS_REGION:$ACCT:$API_ID/*/*
```

At the end the script prints:

```
API_BASE=https://abc123def.execute-api.us-east-1.amazonaws.com
RUNNER_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/runner
```

Now **re-run the API deploy** so `RUNNER_URL` is baked into the Go
Lambda's env:

```bash
RUNNER_URL=https://abc123def.execute-api.us-east-1.amazonaws.com/runner \
  bash infra/aws/deploy_api_lambda.sh
```

Smoke test the API directly:

```bash
curl "$API_BASE/health"                      # {"status":"ok"} from Go Lambda
curl "$API_BASE/runner/health"               # {"status":"ok"} from FastAPI Lambda
curl "$API_BASE/api/problems" | head -c 200  # problem list from Go Lambda
```

## 8. S3 + CloudFront for the frontend

```bash
bash infra/aws/create_frontend_cdn.sh
```

The script:

1. Creates the S3 bucket with **Block Public Access** fully on.
2. Creates a CloudFront **Origin Access Control** (OAC) — the modern
   replacement for OAI — so only CloudFront can read the bucket.
3. Creates the CloudFront distribution with:
   - Default root object `index.html`.
   - **Custom error responses** rewriting `403`/`404` → `/index.html`
     with a `200`, so the SPA keeps working on hard-refresh of
     client-side routes.
   - AWS-managed `CachingOptimized` cache policy.
   - `PriceClass_100` (US/EU edges only, cheapest tier).
4. Attaches a bucket policy that allows **only** that distribution to
   `s3:GetObject`.

It prints two values. Save them — the frontend deploy uses them:

```
CLOUDFRONT_DISTRIBUTION_ID=E1AB2C3D4E5F6G
CLOUDFRONT_DOMAIN=d123abc4567xyz.cloudfront.net
```

Either export them in your shell or paste them into `infra/aws/env.sh`.

### Raw CLI (very abbreviated)

```bash
BUCKET=kitkode-frontend-<ACCOUNT_ID>

# 1) Bucket
aws s3api create-bucket --bucket $BUCKET --region $AWS_REGION \
  $( [[ "$AWS_REGION" != "us-east-1" ]] && echo --create-bucket-configuration LocationConstraint=$AWS_REGION )

aws s3api put-public-access-block --bucket $BUCKET \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# 2) OAC + distribution (see create_frontend_cdn.sh for the full JSON)
# 3) Bucket policy granting cloudfront.amazonaws.com read access only
#    for that specific distribution ARN.
```

## 9. Build & upload the frontend

The frontend reads `API_BASE` at **build time** (Parcel inlines
`process.env.API_BASE`). Point it at the HTTP API invoke URL:

```bash
export API_BASE="https://abc123def.execute-api.us-east-1.amazonaws.com"
export CLOUDFRONT_DISTRIBUTION_ID=E1AB2C3D4E5F6G
export CLOUDFRONT_DOMAIN=d123abc4567xyz.cloudfront.net

bash infra/aws/deploy_frontend.sh
```

What the script does:

1. `npm ci && npm run build` inside `frontend/` (Parcel writes to `frontend/dist/`).
2. `aws s3 sync` everything except `index.html` with
   `Cache-Control: public, max-age=31536000, immutable` (safe because
   Parcel file names are content-hashed).
3. `aws s3 cp index.html` with `Cache-Control: no-cache` so users get
   the new bundle immediately on redeploy.
4. `aws cloudfront create-invalidation --paths "/*"` so the edge cache
   evicts the old HTML right away.

Raw CLI:

```bash
cd frontend
npm ci
API_BASE=$API_BASE npm run build
aws s3 sync dist/ s3://$BUCKET/ --delete --exclude index.html \
  --cache-control "public, max-age=31536000, immutable"
aws s3 cp dist/index.html s3://$BUCKET/index.html \
  --cache-control "public, max-age=0, must-revalidate" \
  --content-type "text/html; charset=utf-8"
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_DISTRIBUTION_ID --paths "/*"
```

Open `https://${CLOUDFRONT_DOMAIN}` in a browser — you should see the
app, which talks to the API Gateway invoke URL you baked in at build
time.

## 10. Redeploys

- **Frontend change:** `bash infra/aws/deploy_frontend.sh`
- **Go API change:** `bash infra/aws/build_api_lambda.sh && bash infra/aws/deploy_api_lambda.sh`
- **Runner change:** `bash infra/aws/build_runner_lambda.sh && bash infra/aws/deploy_runner_lambda.sh`
- **Route change:** re-run `bash infra/aws/create_http_api.sh` (idempotent).

## 11. Tearing it down

```bash
aws lambda delete-function --function-name kitkode-api
aws lambda delete-function --function-name kitkode-runner
aws apigatewayv2 delete-api --api-id <API_ID>

# CloudFront distributions must be disabled before they can be deleted.
aws cloudfront get-distribution-config --id <DIST_ID> > dist.json
# edit dist.json: "Enabled": false, then:
aws cloudfront update-distribution --id <DIST_ID> \
  --if-match <ETAG> --distribution-config file://dist.json.updated
# wait ~15 min for status = Deployed, then:
aws cloudfront delete-distribution --id <DIST_ID> --if-match <NEW_ETAG>

aws s3 rm s3://$BUCKET --recursive
aws s3api delete-bucket --bucket $BUCKET
aws iam detach-role-policy --role-name kitkode-lambda-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam delete-role --role-name kitkode-lambda-role
```

## 12. Cost sketch (Free Tier)

| Service | Free monthly | This deploy uses |
|---|---|---|
| Lambda | 1M requests + 400k GB-s | ≪ 1k requests for a portfolio demo |
| API Gateway HTTP API | 1M requests / 12 months | same |
| CloudFront | 1 TB egress + 10M requests / 12 months | same |
| S3 | 5 GB + 20k GETs + 2k PUTs | same (bundle is <500 KB) |
| CloudWatch Logs | 5 GB ingest | trivial |

At portfolio-scale traffic the whole stack is $0/month. Scale beyond
the free tier and you'll pay cents per million requests. The biggest
surprise line-item is usually CloudFront egress if you host large
assets — Kitkode's bundle is ~200 KB gzipped so you're nowhere near.
