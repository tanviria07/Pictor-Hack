package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"pictorhack/backend/internal/auth"
	"pictorhack/backend/internal/handler"
	"pictorhack/backend/internal/interview"
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
	r.Use(optionalAuth(h))

	r.Get("/health", h.Health)
	r.Get("/ws/interview", interview.WebSocketHandler)

	r.Route("/api", func(r chi.Router) {
		r.With(appmw.IPRateLimit(12)).Post("/auth/signup", h.Signup)
		r.With(appmw.IPRateLimit(12)).Post("/auth/login", h.Login)
		r.Post("/auth/verify-email", h.VerifyEmail)
		r.Post("/auth/resend-otp", h.ResendOTP)
		r.Post("/auth/forgot-password", h.ForgotPassword)
		r.Post("/auth/reset-password", h.ResetPassword)
		r.Post("/auth/logout", h.Logout)
		r.With(requireAuth).Get("/auth/me", h.Me)
		r.Get("/categories", h.ListCategories)
		r.Get("/problems", h.ListProblems)
		r.Get("/problems/{id}", h.GetProblem)
		r.Post("/run", h.Run)
		r.Post("/validate", h.Validate)
		r.Post("/generate-stepwise", h.GenerateStepwise)
		r.Post("/hint", h.Hint)
		r.Post("/inline-hint", h.InlineHint)
		r.With(appmw.IPRateLimit(30)).Post("/coach", h.CoachTurn)
		r.Post("/trace", h.Trace)
		r.Post("/session/save", h.SaveSession)
		r.Get("/session/{problem_id}", h.GetSession)
		r.Group(func(r chi.Router) {
			r.Use(requireAuth)
			r.Get("/me/dashboard", h.DashboardView)
			r.Get("/me/progress", h.GetMyProgress)
			r.Post("/me/session/save", h.SaveMySession)
			r.Get("/me/session/{problem_id}", h.GetMySession)
			r.Get("/me/export", h.ExportMyProgress)
			r.Post("/me/reset-progress", h.ResetMyProgress)
			r.Delete("/me/account", h.DeleteMyAccount)
		})
	})

	return r
}

func optionalAuth(h *handler.Handler) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if h.Users == nil {
				next.ServeHTTP(w, r)
				return
			}
			token := ""
			if c, err := r.Cookie("kitkode_session"); err == nil {
				token = c.Value
			}
			if token == "" {
				if authz := r.Header.Get("Authorization"); len(authz) > 7 && authz[:7] == "Bearer " {
					token = authz[7:]
				}
			}
			if token != "" {
				if hash, err := auth.HashSessionToken(token); err == nil {
					if uid, err := h.Users.GetUserIDBySessionHash(r.Context(), hash); err == nil {
						r = r.WithContext(auth.ContextWithUserID(r.Context(), uid))
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.UserIDFromContext(r.Context()); !ok {
			http.Error(w, `{"error":"login required"}`, http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
