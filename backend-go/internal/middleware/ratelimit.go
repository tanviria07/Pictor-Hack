package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"pictorhack/backend/internal/httpx"
)

// IPRateLimit enforces a token-bucket limit per client IP. OPTIONS requests are not counted.
func IPRateLimit(requestsPerMinute int) func(http.Handler) http.Handler {
	if requestsPerMinute < 1 {
		requestsPerMinute = 120
	}
	// Sustained average: requests per minute -> tokens per second
	rps := rate.Limit(float64(requestsPerMinute) / 60.0)
	burst := requestsPerMinute
	if burst > 60 {
		burst = 60
	}

	const cleanupEvery = 1000
	window := time.Minute
	type limiterEntry struct {
		lim      *rate.Limiter
		lastSeen time.Time
	}

	var mu sync.Mutex
	var requests uint64
	limiters := make(map[string]*limiterEntry)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}

			ip, _, err := net.SplitHostPort(r.RemoteAddr)
			if err != nil {
				ip = r.RemoteAddr
			}

			now := time.Now()
			mu.Lock()
			requests++
			entry, ok := limiters[ip]
			if !ok {
				entry = &limiterEntry{lim: rate.NewLimiter(rps, burst)}
				limiters[ip] = entry
			}
			entry.lastSeen = now
			// Periodically evict inactive IPs so the limiter map cannot grow forever.
			if requests%cleanupEvery == 0 {
				cutoff := now.Add(-window)
				for key, item := range limiters {
					if item.lastSeen.Before(cutoff) {
						delete(limiters, key)
					}
				}
			}
			lim := entry.lim
			mu.Unlock()

			if !lim.Allow() {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.Header().Set("Retry-After", "10")
				w.WriteHeader(http.StatusTooManyRequests)
				_ = json.NewEncoder(w).Encode(map[string]string{
					"code":    httpx.ErrRateLimited,
					"message": "Too many requests. Please slow down and try again shortly.",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
