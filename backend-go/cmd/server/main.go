package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

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
	ts := service.NewTraceService(ds)
	runs := service.NewRunService(rc, ds, ts)

	inlineSvc := service.NewInlineService(ds)

	h := &handler.Handler{
		Runs:         runs,
		Hints:        service.NewHintService(ds, st),
		Inline:       inlineSvc,
		Traces:       ts,
		Sessions:     st,
		Users:        st,
		Dashboard:    service.NewDashboardService(st),
		MaxCodeBytes: cfg.MaxCodeBytes,
	}

	srv := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)
	log.Println("Kitkode API listening on", cfg.HTTPAddr)
	log.Fatal(http.ListenAndServe(cfg.HTTPAddr, srv))
}
