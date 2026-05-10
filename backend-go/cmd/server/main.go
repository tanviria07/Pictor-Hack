package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"time"

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
	startExpiredSessionCleanup(context.Background(), st)

	rc := runner.New(cfg.RunnerURL)
	ds := deepseek.New(cfg)
	ts := service.NewTraceService(ds)
	runs := service.NewRunService(rc, ds, ts)

	inlineSvc := service.NewInlineService(ds)

	h := &handler.Handler{
		Runs:          runs,
		Hints:         service.NewHintService(ds, st),
		Inline:        inlineSvc,
		Traces:        ts,
		Coach:         ds,
		Sessions:      st,
		Users:         st,
		EmailSender:   handler.NewEmailSenderFromEnv(cfg.EmailProvider, cfg.EmailFrom, cfg.EmailAPIKey),
		TokenSecret:   cfg.EmailTokenSecret,
		Dashboard:     service.NewDashboardService(st),
		MaxCodeBytes:  cfg.MaxCodeBytes,
		SecureCookies: cfg.SecureCookies,
	}

	srv := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)
	log.Println("KitCode API listening on", cfg.HTTPAddr)
	log.Fatal(http.ListenAndServe(cfg.HTTPAddr, srv))
}

type expiredSessionCleaner interface {
	DeleteExpiredAuthSessions(ctx context.Context) (int64, error)
}

func startExpiredSessionCleanup(ctx context.Context, cleaner expiredSessionCleaner) {
	const interval = time.Hour
	logger := slog.Default().With("component", "auth_session_cleanup")

	run := func() {
		deleted, err := cleaner.DeleteExpiredAuthSessions(ctx)
		if err != nil {
			logger.Error("failed to delete expired auth sessions", "error", err)
			return
		}
		logger.Info("deleted expired auth sessions", "deleted", deleted)
	}

	go func() {
		run()
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				logger.Info("stopping auth session cleanup")
				return
			case <-ticker.C:
				run()
			}
		}
	}()
}
