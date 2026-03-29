package httpx

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"
)

// Common API error codes (machine-readable).
const (
	ErrBadRequest           = "bad_request"
	ErrNotFound             = "not_found"
	ErrRunnerUnavailable    = "runner_unavailable"
	ErrInternal             = "internal_error"
	ErrUnsupportedLanguage  = "unsupported_language"
	ErrQueueUnavailable     = "queue_unavailable"
	ErrDatabaseError        = "database_error"
	ErrHintUnavailable = "hint_unavailable"
	ErrRateLimited     = "rate_limited"
)

// Error writes a structured JSON error: { "code", "message", "details"? }.
func Error(w http.ResponseWriter, status int, code, message string) {
	ErrorWithDetails(w, status, code, message, nil)
}

// ErrorWithDetails adds optional string details (e.g. hint for clients).
func ErrorWithDetails(w http.ResponseWriter, status int, code, message string, details map[string]string) {
	body := map[string]any{"code": code, "message": message}
	if len(details) > 0 {
		body["details"] = details
	}
	JSON(w, status, body)
}

// MapError maps known errors to HTTP responses; extend as needed.
func MapError(w http.ResponseWriter, err error) {
	var re *RunnerError
	if errors.As(err, &re) {
		details := map[string]string{"upstream": "runner"}
		if re.Msg != "" {
			details["reason"] = truncateDetail(re.Msg, 240)
		}
		ErrorWithDetails(w, http.StatusBadGateway, ErrRunnerUnavailable, "The Python runner could not complete this request.", details)
		return
	}

	if isTimeoutOrUnreachable(err) {
		ErrorWithDetails(w, http.StatusBadGateway, ErrRunnerUnavailable,
			"The code runner did not respond in time or refused the connection.",
			map[string]string{"reason": err.Error()})
		return
	}

	Error(w, http.StatusInternalServerError, ErrInternal, "An unexpected error occurred.")
}

func truncateDetail(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func isTimeoutOrUnreachable(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var ne net.Error
	if errors.As(err, &ne) && (ne.Timeout() || strings.Contains(strings.ToLower(ne.Error()), "connection refused")) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "no such host") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "context deadline exceeded")
}
