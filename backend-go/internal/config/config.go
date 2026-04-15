// Package config loads server settings from the environment.
// Defaults favor local development; never embed secrets in code.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
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

	RedisURL              string
	RunQueueKey           string
	RunJobKeyPrefix       string
	RunReqKeyPrefix       string
	RunRawKeyPrefix       string
	RunFinalKeyPrefix     string
	RunFinalizeLockPrefix string
	RunJobTTL             time.Duration

	MaxCodeBytes       int
	RateLimitPerMinute int
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

	redisURL := strings.TrimSpace(os.Getenv("REDIS_URL"))

	queue := os.Getenv("RUN_QUEUE_KEY")
	if queue == "" {
		queue = "run:queue"
	}
	jobPref := os.Getenv("RUN_JOB_KEY_PREFIX")
	if jobPref == "" {
		jobPref = "run:job:"
	}
	reqPref := os.Getenv("RUN_REQ_KEY_PREFIX")
	if reqPref == "" {
		reqPref = "run:req:"
	}
	rawPref := os.Getenv("RUN_RAW_RESULT_PREFIX")
	if rawPref == "" {
		rawPref = "run:raw:"
	}
	finalPref := os.Getenv("RUN_FINAL_RESULT_PREFIX")
	if finalPref == "" {
		finalPref = "run:final:"
	}
	lockPref := os.Getenv("RUN_FINALIZE_LOCK_PREFIX")
	if lockPref == "" {
		lockPref = "run:finalize-lock:"
	}

	ttlSec := 3600
	if s := strings.TrimSpace(os.Getenv("RUN_JOB_TTL_SEC")); s != "" {
		if n, err := strconv.Atoi(s); err == nil && n > 0 {
			ttlSec = n
		}
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

	return Config{
		HTTPAddr:      addr,
		DatabasePath:  db,
		RunnerURL:     runner,
		CORSOrigins:   origins,
		DeepSeekKey:   os.Getenv("DEEPSEEK_API_KEY"),
		DeepSeekURL:   dsURL,
		DeepSeekModel: dsModel,

		RedisURL:              redisURL,
		RunQueueKey:           queue,
		RunJobKeyPrefix:       jobPref,
		RunReqKeyPrefix:       reqPref,
		RunRawKeyPrefix:       rawPref,
		RunFinalKeyPrefix:     finalPref,
		RunFinalizeLockPrefix: lockPref,
		RunJobTTL:             time.Duration(ttlSec) * time.Second,

		MaxCodeBytes:       maxCode,
		RateLimitPerMinute: rpm,
	}
}
