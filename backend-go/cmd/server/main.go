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

	// Ensure database directory exists
	dbDir := filepath.Dir(cfg.DatabasePath)
	if _, err := os.Stat(dbDir); os.IsNotExist(err) {
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			log.Fatalf("Failed to create database directory %q: %v", dbDir, err)
		}
	}

	// Initialize problem library
	if err := problems.Init(); err != nil {
		log.Fatalf("Failed to initialize problems: %v", err)
	}

	// Initialize SQLite store
	st, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to open store at %q: %v", cfg.DatabasePath, err)
	}
	defer st.Close()

	// Initialize services
	rc := runner.New(cfg.RunnerURL)
	ds := deepseek.New(cfg)
	tsvc := service.NewTraceService(ds)
	runs := service.NewRunService(rc, ds, tsvc)

	h := &handler.Handler{
		Runs:         runs,
		Hints:        service.NewHintService(ds, st),
		Traces:       tsvc,
		Sessions:     st,
		Users:        st,
		TokenSecret:  cfg.EmailTokenSecret,
		Dashboard:    service.NewDashboardService(st),
		MaxCodeBytes: cfg.MaxCodeBytes,
		SecureCookies: cfg.SecureCookies,
		Coach:         ds,
	}

	r := httpapi.NewRouter(h, cfg.CORSOrigins, cfg.RateLimitPerMinute)

	log.Printf("Kitkode backend listening on %s", cfg.HTTPAddr)
	log.Printf("Runner URL: %s", cfg.RunnerURL)
	log.Printf("Database: %s", cfg.DatabasePath)

	if err := http.ListenAndServe(cfg.HTTPAddr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
