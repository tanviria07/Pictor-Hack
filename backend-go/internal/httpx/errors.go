package httpx

import (
	"errors"
	"net/http"
)

// Common API error codes (machine-readable).
const (
	ErrBadRequest          = "bad_request"
	ErrNotFound            = "not_found"
	ErrRunnerUnavailable   = "runner_unavailable"
	ErrInternal            = "internal_error"
	ErrUnsupportedLanguage = "unsupported_language"
)

// Error writes a JSON error body and status.
func Error(w http.ResponseWriter, status int, code, message string) {
	JSON(w, status, map[string]string{"code": code, "message": message})
}

// MapError maps known errors to HTTP responses; extend as needed.
func MapError(w http.ResponseWriter, err error) {
	var re *RunnerError
	if errors.As(err, &re) {
		Error(w, http.StatusBadGateway, ErrRunnerUnavailable, re.Msg)
		return
	}
	Error(w, http.StatusInternalServerError, ErrInternal, "unexpected error")
}
