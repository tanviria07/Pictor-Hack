// Package handler contains HTTP handlers for the REST API.
// Handlers validate input, call services, and map errors to HTTP â€” they never judge code correctness.
package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/httpx"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
	"pictorhack/backend/internal/validation"
)

// Handler wires HTTP handlers to services.
type Handler struct {
	Runs         *service.RunService
	RunJobs      *service.RunJobService
	Hints        *service.HintService
	Inline       *service.InlineService
	Voice        *service.VoiceService
	Sessions     store.SessionRepository
	MaxCodeBytes int // max submitted code size; if zero, a default is used in validateRunInput
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

func (h *Handler) maxCodeBytes() int {
	if h.MaxCodeBytes > 0 {
		return h.MaxCodeBytes
	}
	return 256 * 1024
}

func (h *Handler) validateRunInput(w http.ResponseWriter, req *dto.RunRequest) bool {
	validation.NormalizeRunRequest(req)
	if err := validation.ValidateRunRequest(req, h.maxCodeBytes()); err != nil {
		msg := err.Error()
		if !strings.HasSuffix(msg, ".") {
			msg += "."
		}
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, msg)
		return false
	}
	return true
}

// Run forwards code to the Python runner and returns its evaluation (optionally rephrased feedback).
func (h *Handler) Run(w http.ResponseWriter, r *http.Request) {
	var req dto.RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	if !h.validateRunInput(w, &req) {
		return
	}
	if _, err := problems.GetPublic(req.ProblemID); err != nil {
		if errors.Is(err, problems.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
			return
		}
		log.Println("run problem lookup:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load problem")
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

// Validate runs stepwise (sentence-by-sentence) validation through the runner.
// The Python runner is authoritative for correctness; this handler only forwards.
func (h *Handler) Validate(w http.ResponseWriter, r *http.Request) {
	var req dto.StepwiseValidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	req.ProblemID = strings.TrimSpace(req.ProblemID)
	if req.ProblemID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "problem_id required")
		return
	}
	if len(req.Code) > h.maxCodeBytes() {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "code too large")
		return
	}
	if _, err := problems.GetPublic(req.ProblemID); err != nil {
		if errors.Is(err, problems.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
			return
		}
		log.Println("validate problem lookup:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load problem")
		return
	}
	out, err := h.Runs.Validate(r.Context(), req)
	if err != nil {
		log.Println("validate:", err)
		httpx.MapError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// GenerateStepwise asks the Python runner to synthesize scaffold data for a
// problem via DeepSeek. This is an admin-flavoured endpoint; the runner is
// authoritative for both the API call and the filesystem write.
func (h *Handler) GenerateStepwise(w http.ResponseWriter, r *http.Request) {
	var req dto.StepwiseGenerateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	req.ProblemID = strings.TrimSpace(req.ProblemID)
	if req.ProblemID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "problem_id required")
		return
	}
	if _, err := problems.GetPublic(req.ProblemID); err != nil {
		if errors.Is(err, problems.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
			return
		}
		log.Println("generate-stepwise problem lookup:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load problem")
		return
	}
	out, err := h.Runs.GenerateStepwise(r.Context(), req)
	if err != nil {
		log.Println("generate-stepwise:", err)
		httpx.MapError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// SubmitRunJob enqueues async evaluation (Redis + worker). Returns 503 if async runs are disabled.
func (h *Handler) SubmitRunJob(w http.ResponseWriter, r *http.Request) {
	if h.RunJobs == nil {
		httpx.Error(w, http.StatusServiceUnavailable, httpx.ErrQueueUnavailable, "Async code runs are not configured (set REDIS_URL on the API).")
		return
	}
	var req dto.RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	if !h.validateRunInput(w, &req) {
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
		httpx.Error(w, http.StatusServiceUnavailable, httpx.ErrQueueUnavailable, "Async code runs are not configured (set REDIS_URL on the API).")
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
		httpx.ErrorWithDetails(w, http.StatusInternalServerError, httpx.ErrHintUnavailable, "Could not build a hint right now.", map[string]string{"reason": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// InlineHint returns real-time line‑by‑line feedback for partial code.
func (h *Handler) InlineHint(w http.ResponseWriter, r *http.Request) {
	var req dto.InlineHintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	if req.ProblemID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "problem_id required")
		return
	}
	if req.CursorLine < 1 {
		req.CursorLine = 1
	}
	out, err := h.Inline.InlineHint(r.Context(), req)
	if errors.Is(err, problems.ErrNotFound) {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "unknown problem_id")
		return
	}
	if err != nil {
		log.Println("inline hint:", err)
		httpx.ErrorWithDetails(w, http.StatusInternalServerError, httpx.ErrHintUnavailable, "Could not generate inline hint.", map[string]string{"reason": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// VoiceTurn proxies a Jose voice coach turn through the server-side Gemini
// client. Accepts either a short audio clip or a plain transcript.
func (h *Handler) VoiceTurn(w http.ResponseWriter, r *http.Request) {
	if h.Voice == nil || !h.Voice.Enabled() {
		httpx.Error(w, http.StatusServiceUnavailable, httpx.ErrHintUnavailable, "Voice coach is not configured on this server.")
		return
	}
	// Cap the request body defensively; base64 audio is the dominant size.
	r.Body = http.MaxBytesReader(w, r.Body, int64(service.MaxAudioBytes*2+service.MaxContextBytes+1024))

	var req service.TurnRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	out, err := h.Voice.HandleTurn(r.Context(), req)
	switch {
	case errors.Is(err, service.ErrEmptyInput):
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "request must include audio or transcript")
		return
	case errors.Is(err, service.ErrInputTooLarge):
		httpx.Error(w, http.StatusRequestEntityTooLarge, httpx.ErrBadRequest, "voice payload too large")
		return
	case errors.Is(err, service.ErrBadAudio):
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid audio payload")
		return
	case err != nil:
		log.Println("voice turn:", err)
		httpx.ErrorWithDetails(w, http.StatusBadGateway, httpx.ErrHintUnavailable, "Jose could not respond right now.", map[string]string{"reason": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

// VoiceSuggest proxies the follow-up question generator. Always returns 200
// with a (possibly empty) list so the browser falls back gracefully.
func (h *Handler) VoiceSuggest(w http.ResponseWriter, r *http.Request) {
	if h.Voice == nil || !h.Voice.Enabled() {
		httpx.JSON(w, http.StatusOK, service.Suggestions{Questions: []string{}})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, int64(service.MaxContextBytes+1024))

	var req service.SuggestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	out := h.Voice.Suggest(r.Context(), req)
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
		httpx.ErrorWithDetails(w, http.StatusInternalServerError, httpx.ErrDatabaseError, "Could not save your session.", map[string]string{"reason": err.Error()})
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
		httpx.ErrorWithDetails(w, http.StatusInternalServerError, httpx.ErrDatabaseError, "Could not load your session.", map[string]string{"reason": err.Error()})
		return
	}
	if sess == nil {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "no session")
		return
	}
	httpx.JSON(w, http.StatusOK, sess)
}
