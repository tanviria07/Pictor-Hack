// Package handler contains HTTP handlers for the REST API.
// Handlers validate input, call services, and map errors to HTTP â€” they never judge code correctness.
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/httpx"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
)

// Handler wires HTTP handlers to services.
type Handler struct {
	Runs     *service.RunService
	RunJobs  *service.RunJobService
	Hints    *service.HintService
	Sessions store.SessionRepository
}

// Health returns process liveness.
func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ListCategories returns the NeetCode-style curriculum with live counts.
func (h *Handler) ListCategories(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, problems.ListCategorySummaries())
}

// ListProblems returns problem summaries (metadata only).
// Query: ?category=arrays-hashing&difficulty=easy
func (h *Handler) ListProblems(w http.ResponseWriter, r *http.Request) {
	cat := r.URL.Query().Get("category")
	diff := r.URL.Query().Get("difficulty")
	httpx.JSON(w, http.StatusOK, problems.ListSummaries(cat, diff))
}

// GetProblem returns a single problem without hidden test inputs.
func (h *Handler) GetProblem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	p, err := problems.GetPublic(id)
	if errors.Is(err, problems.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
		return
	}
	if err != nil {
		log.Println("get problem:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load problem")
		return
	}
	httpx.JSON(w, http.StatusOK, p)
}

// Run forwards code to the Python runner and returns its evaluation (optionally rephrased feedback).
func (h *Handler) Run(w http.ResponseWriter, r *http.Request) {
	var req dto.RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	out, err := h.Runs.Execute(r.Context(), req)
	if errors.Is(err, service.ErrUnsupportedLanguage) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrUnsupportedLanguage, err.Error())
		return
	}
	if err != nil {
		log.Println("run:", err)
		httpx.MapError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// SubmitRunJob enqueues async evaluation (Redis + worker). Returns 503 if async runs are disabled.
func (h *Handler) SubmitRunJob(w http.ResponseWriter, r *http.Request) {
	if h.RunJobs == nil {
		httpx.Error(w, http.StatusServiceUnavailable, httpx.ErrInternal, "async run queue is not configured")
		return
	}
	var req dto.RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	out, err := h.RunJobs.Submit(r.Context(), req)
	if errors.Is(err, service.ErrUnsupportedLanguage) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrUnsupportedLanguage, err.Error())
		return
	}
	if errors.Is(err, problems.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
		return
	}
	if err != nil {
		log.Println("submit run job:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to enqueue run")
		return
	}
	httpx.JSON(w, http.StatusAccepted, out)
}

// GetRunJob polls async job status and returns the finalized result when ready.
func (h *Handler) GetRunJob(w http.ResponseWriter, r *http.Request) {
	if h.RunJobs == nil {
		httpx.Error(w, http.StatusServiceUnavailable, httpx.ErrInternal, "async run queue is not configured")
		return
	}
	jobID := chi.URLParam(r, "job_id")
	if jobID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "job_id required")
		return
	}
	out, err := h.RunJobs.GetJob(r.Context(), jobID)
	if errors.Is(err, service.ErrJobNotFound) {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown job_id")
		return
	}
	if err != nil {
		log.Println("get run job:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load job")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// Hint returns a progressive hint grounded in runner evaluation (never recomputed here).
func (h *Handler) Hint(w http.ResponseWriter, r *http.Request) {
	var req dto.HintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	out, err := h.Hints.Hint(r.Context(), req)
	if errors.Is(err, problems.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
		return
	}
	if err != nil {
		log.Println("hint:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "hint failed")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// SaveSession persists editor buffer and hint history locally.
func (h *Handler) SaveSession(w http.ResponseWriter, r *http.Request) {
	var req dto.SessionSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	if req.ProblemID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "problem_id required")
		return
	}
	if err := h.Sessions.SaveSession(r.Context(), req); err != nil {
		log.Println("session save:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "save failed")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// GetSession loads stored session for a problem.
func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
	pid := chi.URLParam(r, "problem_id")
	sess, err := h.Sessions.GetSession(r.Context(), pid)
	if err != nil {
		log.Println("session get:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "database error")
		return
	}
	if sess == nil {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "no session")
		return
	}
	httpx.JSON(w, http.StatusOK, sess)
}
