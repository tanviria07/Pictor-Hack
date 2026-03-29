package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	appmw "pictorhack/backend/internal/middleware"
	"pictorhack/backend/internal/handler"
)

// NewRouter mounts API routes and middleware.
func NewRouter(h *handler.Handler, corsOrigins []string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(appmw.CORS(corsOrigins))

	r.Get("/health", h.Health)

	r.Route("/api", func(r chi.Router) {
		r.Get("/categories", h.ListCategories)
		r.Get("/problems", h.ListProblems)
		r.Get("/problems/{id}", h.GetProblem)
		if h.RunJobs != nil {
			r.Post("/run/jobs", h.SubmitRunJob)
			r.Get("/run/jobs/{job_id}", h.GetRunJob)
		}
		r.Post("/run", h.Run)
		r.Post("/hint", h.Hint)
		r.Post("/session/save", h.SaveSession)
		r.Get("/session/{problem_id}", h.GetSession)
	})

	return r
}
