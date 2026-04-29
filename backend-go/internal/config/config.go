// Package config loads server settings from the environment.
// Defaults favor local development; never embed secrets in code.
package config

import (
	"os"
	"strconv"
	"strings"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	HTTPAddr                string // e.g. ":8080"
	DatabasePath            string
	RunnerURL               string
	CORSOrigins             []string
	DeepSeekKey             string
	DeepSeekURL             string
	DeepSeekModel           string
	EnableGoogleAuth        bool
	EnableEmailVerification bool
	EnableMagicLink         bool

	MaxCodeBytes       int
	RateLimitPerMinute int
}

// Load reads environment variables with sensible defaults.
func Load() Config {
	loadLocalEnv()

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

	maxCode := 256 * 1024
	if s := strings.TrimSpace(os.Getenv("MAX_CODE_BYTES")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			maxCode = n
		}
	}

	rpm := 120
	if s := strings.TrimSpace(os.Getenv("RATE_LIMIT_PER_MINUTE")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			rpm = n
		}
	}

	dsKey := os.Getenv("DEEPSEEK_API_KEY")
	if dsKey == "" {
		// Legacy local installs sometimes put this in frontend/.env. Keep the
		// browser bundle keyless while allowing the backend to use that value.
		dsKey = os.Getenv("VITE_DEEPSEEK_API_KEY")
	}

	return Config{
		HTTPAddr:                addr,
		DatabasePath:            db,
		RunnerURL:               runner,
		CORSOrigins:             origins,
		DeepSeekKey:             dsKey,
		DeepSeekURL:             dsURL,
		DeepSeekModel:           dsModel,
		EnableGoogleAuth:        envBool("ENABLE_GOOGLE_AUTH", false),
		EnableEmailVerification: envBool("ENABLE_EMAIL_VERIFICATION", false),
		EnableMagicLink:         envBool("ENABLE_MAGIC_LINK", false),

		MaxCodeBytes:       maxCode,
		RateLimitPerMinute: rpm,
	}
}

func loadLocalEnv() {
	for _, path := range []string{".env", "../.env", "../frontend/.env"} {
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(b), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, value, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			value = strings.Trim(strings.TrimSpace(value), `"'`)
			if key == "" {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}
	}
}

func envBool(name string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(name)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}
