package main

import (
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"pictorhack/backend/internal/db"
	"pictorhack/backend/internal/handler"
)

func main() {
	// Initialize SQLite database
	if err := db.Init("kitcode.db"); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.StripSlashes)

	// Global request logger for debugging
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("Request: %s %s", r.Method, r.URL.Path)
			next.ServeHTTP(w, r)
		})
	})

	// Minimal CORS middleware for development
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	})

	// Health check
	r.Get("/health", handler.Health)

	// Auth routes
	r.Post("/api/auth/register", handler.Register)
	r.Post("/api/auth/signup", handler.Signup)
	r.Post("/api/auth/verify", handler.Verify)
	r.Get("/api/auth/verify", handler.Verify)
	r.Post("/api/auth/login", handler.Login)
	r.Get("/api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"user":null}`))
	})

	// Catch-all for debugging 404s
	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("!!! 404 Not Found: %s %s", r.Method, r.URL.Path)
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	})

	addr := ":8080"
	log.Printf("Kitkode minimal backend listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
