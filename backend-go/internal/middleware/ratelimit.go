package middleware

import (
	"encoding/json"
	"net"
	"net/http"
	"sync"

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

	var mu sync.Mutex
	limiters := make(map[string]*rate.Limiter)

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

			mu.Lock()
			lim, ok := limiters[ip]
			if !ok {
				lim = rate.NewLimiter(rps, burst)
				limiters[ip] = lim
			}
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
