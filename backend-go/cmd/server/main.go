package main

import (
	"log"
	"net/http"
	"os"

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
	if err := os.MkdirAll("./data", 0o755); err != nil {
		log.Fatal(err)
	}

	st, err := store.Open(cfg.DatabasePath)
	if err != nil {
		log.Fatal(err)
	}
	defer st.Close()

	rc := runner.New(cfg.RunnerURL)
	ds := deepseek.New(cfg)

	h := &handler.Handler{
		Runs:     service.NewRunService(rc, ds),
		Hints:    service.NewHintService(ds, st),
		Sessions: st,
	}

	srv := httpapi.NewRouter(h, cfg.CORSOrigins)
	log.Println("Pictor Hack API listening on", cfg.HTTPAddr)
	log.Fatal(http.ListenAndServe(cfg.HTTPAddr, srv))
}
