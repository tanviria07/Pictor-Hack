package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"

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
	defer st.Close()

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
		ctx := context.Background()
		if err := rdb.Ping(ctx).Err(); err != nil {
			log.Fatal("redis ping:", err)
		}
		defer rdb.Close()
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

	srv := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)
	log.Println("Pictor Hack API listening on", cfg.HTTPAddr)
	log.Fatal(http.ListenAndServe(cfg.HTTPAddr, srv))
}
