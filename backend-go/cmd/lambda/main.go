// Lambda entry point for the Kitkode Go API.
//
// This is the exact twin of cmd/server/main.go. Instead of binding a TCP
// listener with http.ListenAndServe, it hands the same chi router to
// API Gateway v2 via awslabs/aws-lambda-go-api-proxy. Everything else
// (config, SQLite store, runner client, services, handlers) is identical
// to the long-running server build, so there is no second source of
// truth for routes or behaviour.
//
// Lambda handler string:
//   bootstrap           (on provided.al2023 custom runtime)
//     -> main.main()
//        -> lambda.Start(httpadapterV2.New(router).ProxyWithContext)
//
// Two deploy gotchas worth spelling out loudly (see DEPLOY_AWS.md):
//
//   1. SQLite on Lambda is NOT persistent. Lambda has a read-only root
//      filesystem and an ephemeral /tmp that is lost on cold start.
//      For a demo, set DATABASE_PATH=/tmp/kitkode.db (default below);
//      for real persistence you must mount EFS at /mnt/kitkode or swap
//      the store for DynamoDB.
//
//   2. The Go API calls the Python runner. In the Lambda layout we ship
//      the runner as its own Lambda + API Gateway; set RUNNER_URL to
//      that invoke URL in the API Lambda's env. Outbound HTTP from
//      Lambda needs no VPC setup for a PUBLIC runner endpoint.

package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"github.com/aws/aws-lambda-go/lambda"
	httpadapter "github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"
	"github.com/redis/go-redis/v9"

	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/handler"
	"pictorhack/backend/internal/httpapi"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/runner"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
)

func main() {
	cfg := config.Load()

	if cfg.DatabasePath == "" {
		cfg.DatabasePath = "/tmp/kitkode.db"
	}

	if err := problems.Init(); err != nil {
		log.Fatal(err)
	}

	dbDir := filepath.Dir(cfg.DatabasePath)
	if dbDir == "" || dbDir == "." {
		dbDir = "."
	}
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		log.Fatal(err)
	}

	st, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatal(err)
	}

	rc := runner.New(cfg.RunnerURL)
	ds := deepseek.New(cfg)
	runs := service.NewRunService(rc, ds)

	var runJobs *service.RunJobService
	if cfg.RedisURL != "" {
		opt, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			log.Fatal("REDIS_URL parse:", err)
		}
		rdb := redis.NewClient(opt)
		if err := rdb.Ping(context.Background()).Err(); err != nil {
			log.Fatal("redis ping:", err)
		}
		runJobs = service.NewRunJobService(cfg, rdb, runs)
		log.Println("async run queue enabled (Redis)")
	}

	inlineSvc := service.NewInlineService(ds)

	h := &handler.Handler{
		Runs:         runs,
		RunJobs:      runJobs,
		Hints:        service.NewHintService(ds, st),
		Inline:       inlineSvc,
		Sessions:     st,
		MaxCodeBytes: cfg.MaxCodeBytes,
	}

	router := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)

	// API Gateway (HTTP API, payload format v2.0) -> net/http.
	// The adapter is stateless; safe to reuse for the lifetime of the
	// warm Lambda container.
	adapter := httpadapter.NewV2(router)
	lambda.Start(adapter.ProxyWithContext)
}
