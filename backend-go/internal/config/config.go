// Package config loads server settings from the environment.
// Defaults favor local development; never embed secrets in code.
package config

import (
	"os"
	"strings"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	HTTPAddr      string // e.g. ":8080"
	DatabasePath  string
	RunnerURL     string
	CORSOrigins   []string
	DeepSeekKey   string
	DeepSeekURL   string
	DeepSeekModel string
}

// Load reads environment variables with sensible defaults.
func Load() Config {
	port := os.Getenv("PORT")
	addr := ":8080"
	if port != "" {
		addr = ":" + port
	}

	db := os.Getenv("DATABASE_PATH")
	if db == "" {
		db = "./data/pictorhack.db"
	}

	runner := os.Getenv("RUNNER_URL")
	if runner == "" {
		runner = "http://127.0.0.1:8001"
	}
	runner = strings.TrimRight(runner, "/")

	cors := os.Getenv("CORS_ORIGINS")
	if cors == "" {
		// Browsers treat localhost vs 127.0.0.1 as different Origins.
		cors = "http://localhost:3000,http://127.0.0.1:3000"
	}
	origins := strings.Split(cors, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}

	dsURL := os.Getenv("DEEPSEEK_API_URL")
	if dsURL == "" {
		dsURL = "https://api.deepseek.com"
	}
	dsURL = strings.TrimRight(dsURL, "/")

	dsModel := os.Getenv("DEEPSEEK_MODEL")
	if dsModel == "" {
		dsModel = "deepseek-chat"
	}

	return Config{
		HTTPAddr:      addr,
		DatabasePath:  db,
		RunnerURL:     runner,
		CORSOrigins:   origins,
		DeepSeekKey:   os.Getenv("DEEPSEEK_API_KEY"),
		DeepSeekURL:   dsURL,
		DeepSeekModel: dsModel,
	}
}
