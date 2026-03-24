package main

import (
	"log"
	"net/http"
	"os"

	"josemorinho/backend/internal/config"
	"josemorinho/backend/internal/deepseek"
	"josemorinho/backend/internal/handler"
	"josemorinho/backend/internal/httpapi"
	"josemorinho/backend/internal/problems"
	"josemorinho/backend/internal/runner"
	"josemorinho/backend/internal/service"
	"josemorinho/backend/internal/store"
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
	log.Println("listening on", cfg.HTTPAddr)
	log.Fatal(http.ListenAndServe(cfg.HTTPAddr, srv))
}
