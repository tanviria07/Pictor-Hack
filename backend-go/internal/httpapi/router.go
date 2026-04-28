package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"pictorhack/backend/internal/handler"
	appmw "pictorhack/backend/internal/middleware"
)

// NewRouter mounts API routes and middleware.
// rateLimitPerMinute caps requests per client IP (OPTIONS excluded). Use a high value in tests.
func NewRouter(h *handler.Handler, corsOrigins []string, rateLimitPerMinute int) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(appmw.SecurityHeaders)
	r.Use(appmw.CORS(corsOrigins))
	r.Use(appmw.IPRateLimit(rateLimitPerMinute))

	r.Get("/health", h.Health)

	r.Route("/api", func(r chi.Router) {
		r.Get("/categories", h.ListCategories)
		r.Get("/problems", h.ListProblems)
		r.Get("/problems/{id}", h.GetProblem)
		r.Post("/run", h.Run)
		r.Post("/validate", h.Validate)
		r.Post("/generate-stepwise", h.GenerateStepwise)
		r.Post("/hint", h.Hint)
		r.Post("/inline-hint", h.InlineHint)
		r.Post("/trace", h.Trace)
		r.Post("/session/save", h.SaveSession)
		r.Get("/session/{problem_id}", h.GetSession)
	})

	return r
}
