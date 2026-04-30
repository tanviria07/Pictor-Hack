// Package handler contains HTTP handlers for the REST API.
// Handlers validate input, call services, and map errors to HTTP â€” they never judge code correctness.
package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"pictorhack/backend/internal/auth"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/httpx"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
	"pictorhack/backend/internal/validation"
)

// Handler wires HTTP handlers to services.
type Handler struct {
	Runs   *service.RunService
	Hints  *service.HintService
	Inline *service.InlineService
	Traces *service.TraceService
	Coach  interface {
		Enabled() bool
		CoachTurn(ctx context.Context, systemPrompt, userContent string) (string, error)
	}
	Sessions      store.SessionRepository
	Users         store.UserRepository
	EmailSender   EmailSender
	TokenSecret   string
	Dashboard     *service.DashboardService
	MaxCodeBytes  int // max submitted code size; if zero, a default is used in validateRunInput
	signupLimiter *windowLimiter
}

const authCookieName = "kitkode_session"

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
	if userID, ok := auth.UserIDFromContext(r.Context()); ok && h.Users != nil {
		if p, perr := problemSummary(req.ProblemID); perr == nil {
			if err := h.Users.RecordAttempt(r.Context(), userID, p, req, *out); err != nil {
				log.Println("record attempt:", err)
			}
		}
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
	if userID, ok := auth.UserIDFromContext(r.Context()); ok && h.Users != nil {
		if err := h.Users.IncrementHintCount(r.Context(), userID, req.ProblemID); err != nil {
			log.Println("hint progress:", err)
		}
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

func (h *Handler) CoachTurn(w http.ResponseWriter, r *http.Request) {
	var req dto.CoachRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	req.SystemPrompt = strings.TrimSpace(req.SystemPrompt)
	req.Context = strings.TrimSpace(req.Context)
	req.Transcript = strings.TrimSpace(req.Transcript)
	if req.SystemPrompt == "" || req.Context == "" || req.Transcript == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "coach prompt, context, and message are required")
		return
	}
	if len(req.SystemPrompt) > 6000 || len(req.Context) > 12000 || len(req.Transcript) > 2000 {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "coach request is too large")
		return
	}
	if h.Coach == nil || !h.Coach.Enabled() {
		httpx.JSON(w, http.StatusOK, dto.CoachResponse{Reply: localCoachReply(req)})
		return
	}
	userContent := req.Context + "\n\nUser said: " + req.Transcript
	reply, err := h.Coach.CoachTurn(r.Context(), req.SystemPrompt, userContent)
	if err != nil {
		log.Println("coach:", err)
		httpx.JSON(w, http.StatusOK, dto.CoachResponse{Reply: localCoachReply(req)})
		return
	}
	httpx.JSON(w, http.StatusOK, dto.CoachResponse{Reply: reply})
}

func localCoachReply(req dto.CoachRequest) string {
	msg := strings.ToLower(req.Transcript)
	switch {
	case strings.Contains(msg, "complex"):
		return "Anchor your answer in the latest runner result, then describe the time and space cost of the approach you actually wrote."
	case strings.Contains(msg, "bug") || strings.Contains(msg, "wrong"):
		return "Use the runner status first: compare your function name, return value, and the smallest visible failing case before changing the whole approach."
	case strings.Contains(msg, "edge"):
		return "Try one tiny edge case by hand, then check whether your code handles the empty, single-item, or boundary input for this problem."
	case strings.Contains(msg, "hint") || strings.Contains(msg, "stuck"):
		return "What approach comes to mind? Start with the simplest direct solution, then use the runner feedback to narrow the next change."
	default:
		return "Talk me through your current approach, then make one small change and run the Python evaluator again."
	}
}

func (h *Handler) Signup(w http.ResponseWriter, r *http.Request) {
	h.signupWithVerification(w, r)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	h.authWithPassword(w, r, false)
}

func (h *Handler) signupWithVerification(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	if !h.signupAllowed(clientIP(r)) {
		w.Header().Set("Retry-After", "3600")
		httpx.Error(w, http.StatusTooManyRequests, httpx.ErrRateLimited, "too many signup attempts from this network")
		return
	}
	var req dto.AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if email == "" || username == "" || req.Password == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "email, username, and password are required")
		return
	}
	if !validEmail(email) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "enter a valid email address")
		return
	}
	if !validUsername(username) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "username must be 3 to 32 characters and use letters, numbers, underscores, or hyphens")
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 256 {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not hash password")
		return
	}
	if _, err := h.Users.CreateUser(r.Context(), email, username, hash); err != nil {
		httpx.Error(w, http.StatusConflict, httpx.ErrBadRequest, "an account with that email or username already exists")
		return
	}
	expiresAt, err := h.createAndSendOTP(r.Context(), email)
	if err != nil {
		log.Println("send verification otp:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not send verification email")
		return
	}
	// Signup creates the account but does not issue a session until the OTP is verified.
	httpx.JSON(w, http.StatusAccepted, dto.PendingVerificationResponse{Status: "pending_verification", Email: email, ExpiresAt: expiresAt})
}

func (h *Handler) authWithPassword(w http.ResponseWriter, r *http.Request, create bool) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	var req dto.AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	username := strings.ToLower(strings.TrimSpace(req.Username))
	identifier := strings.ToLower(strings.TrimSpace(req.Identifier))
	if create && (email == "" || username == "" || req.Password == "") {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "email, username, and password are required")
		return
	}
	if !create && (identifier == "" || req.Password == "") {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "email or username and password are required")
		return
	}
	if create && !validEmail(email) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "enter a valid email address")
		return
	}
	if create && !validUsername(username) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "username must be 3 to 32 characters and use letters, numbers, underscores, or hyphens")
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 256 {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "password must be at least 8 characters")
		return
	}
	var user *dto.AuthUser
	if create {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not hash password")
			return
		}
		u, err := h.Users.CreateUser(r.Context(), email, username, hash)
		if err != nil {
			httpx.Error(w, http.StatusConflict, httpx.ErrBadRequest, "an account with that email or username already exists")
			return
		}
		user = u
	} else {
		u, hash, err := h.Users.GetUserByLogin(r.Context(), identifier)
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "user not found")
			return
		}
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "could not log in")
			return
		}
		if !auth.VerifyPassword(hash, req.Password) {
			httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "wrong password")
			return
		}
		if !u.EmailVerified {
			httpx.Error(w, http.StatusForbidden, httpx.ErrBadRequest, "email verification required")
			return
		}
		user = u
	}
	if err := h.issueSession(w, r, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not create session")
		return
	}
	httpx.JSON(w, http.StatusOK, dto.AuthResponse{User: *user})
}

func (h *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	var req dto.VerifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	otp := strings.TrimSpace(req.OTP)
	if !validEmail(email) || len(otp) != 6 {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "email and 6-digit otp are required")
		return
	}
	ev, err := h.Users.LatestEmailVerification(r.Context(), email, auth.EmailVerificationPurpose)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "verification code not found")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not verify email")
		return
	}
	if ev.Attempts >= 5 {
		httpx.Error(w, http.StatusTooManyRequests, httpx.ErrRateLimited, "too many verification attempts")
		return
	}
	if expired(ev.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "verification code expired")
		return
	}
	got, err := auth.HashEmailToken(h.emailTokenSecret(), auth.EmailVerificationPurpose, email, otp)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not verify email")
		return
	}
	if !auth.ConstantTimeTokenEqual(got, ev.TokenHash) {
		_ = h.Users.IncrementEmailVerificationAttempts(r.Context(), ev.ID)
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid verification code")
		return
	}
	user, err := h.Users.MarkEmailVerified(r.Context(), email)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not verify email")
		return
	}
	_ = h.Users.DeleteEmailVerifications(r.Context(), email, auth.EmailVerificationPurpose)
	if err := h.issueSession(w, r, user.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not create session")
		return
	}
	httpx.JSON(w, http.StatusOK, dto.AuthResponse{User: *user})
}

func (h *Handler) ResendOTP(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	var req dto.ResendOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !validEmail(email) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "enter a valid email address")
		return
	}
	u, _, err := h.Users.GetUserByEmail(r.Context(), email)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	} else if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not resend verification code")
		return
	}
	if u.EmailVerified {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if ev, err := h.Users.LatestEmailVerification(r.Context(), email, auth.EmailVerificationPurpose); err == nil && within(ev.CreatedAt, time.Minute) {
		w.Header().Set("Retry-After", "60")
		httpx.Error(w, http.StatusTooManyRequests, httpx.ErrRateLimited, "wait before requesting another verification code")
		return
	}
	expiresAt, err := h.createAndSendOTP(r.Context(), email)
	if err != nil {
		log.Println("resend verification otp:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not resend verification code")
		return
	}
	httpx.JSON(w, http.StatusOK, dto.PendingVerificationResponse{Status: "pending_verification", Email: email, ExpiresAt: expiresAt})
}

func (h *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	var req dto.ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !validEmail(email) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "enter a valid email address")
		return
	}
	u, _, err := h.Users.GetUserByEmail(r.Context(), email)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not start password reset")
		return
	}
	if !u.EmailVerified {
		httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}
	token, err := auth.NewPasswordResetToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not start password reset")
		return
	}
	hash, err := auth.HashEmailToken(h.emailTokenSecret(), auth.PasswordResetPurpose, "", token)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not start password reset")
		return
	}
	_ = h.Users.DeleteEmailVerifications(r.Context(), email, auth.PasswordResetPurpose)
	expires := time.Now().UTC().Add(30 * time.Minute)
	if err := h.Users.CreateEmailVerification(r.Context(), email, auth.PasswordResetPurpose, hash, expires.Format(time.RFC3339)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not start password reset")
		return
	}
	if err := h.emailSender().Send(r.Context(), passwordResetEmail(email, token)); err != nil {
		log.Println("password reset email:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not send password reset email")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	if h.Users == nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "auth unavailable")
		return
	}
	var req dto.ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" || len(req.NewPassword) < 8 || len(req.NewPassword) > 256 {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "token and a password of at least 8 characters are required")
		return
	}
	// Password reset tokens are looked up by HMAC hash and expire after 30 minutes.
	ev, err := h.findPasswordReset(r.Context(), token)
	if errors.Is(err, sql.ErrNoRows) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid or expired reset token")
		return
	}
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not reset password")
		return
	}
	if expired(ev.ExpiresAt) {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid or expired reset token")
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not reset password")
		return
	}
	if err := h.Users.UpdatePasswordByEmail(r.Context(), ev.Email, hash); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not reset password")
		return
	}
	_ = h.Users.DeleteEmailVerifications(r.Context(), ev.Email, auth.PasswordResetPurpose)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) createAndSendOTP(ctx context.Context, email string) (string, error) {
	otp, err := auth.NewOTP()
	if err != nil {
		return "", err
	}
	hash, err := auth.HashEmailToken(h.emailTokenSecret(), auth.EmailVerificationPurpose, email, otp)
	if err != nil {
		return "", err
	}
	_ = h.Users.DeleteEmailVerifications(ctx, email, auth.EmailVerificationPurpose)
	expires := time.Now().UTC().Add(10 * time.Minute)
	if err := h.Users.CreateEmailVerification(ctx, email, auth.EmailVerificationPurpose, hash, expires.Format(time.RFC3339)); err != nil {
		return "", err
	}
	if err := h.emailSender().Send(ctx, verificationEmail(email, otp)); err != nil {
		return "", err
	}
	return expires.Format(time.RFC3339), nil
}

func (h *Handler) findPasswordReset(ctx context.Context, token string) (*store.EmailVerification, error) {
	hash, err := auth.HashEmailToken(h.emailTokenSecret(), auth.PasswordResetPurpose, "", token)
	if err != nil {
		return nil, err
	}
	return h.Users.GetEmailVerificationByHash(ctx, auth.PasswordResetPurpose, hash)
}

func (h *Handler) emailSender() EmailSender {
	if h.EmailSender != nil {
		return h.EmailSender
	}
	return NewEmailSenderFromEnv("dummy", "noreply@kitkode.local", "")
}

func (h *Handler) emailTokenSecret() string {
	if strings.TrimSpace(h.TokenSecret) != "" {
		return h.TokenSecret
	}
	return "kitkode-local-email-token-secret"
}

func expired(ts string) bool {
	t, err := time.Parse(time.RFC3339, ts)
	return err != nil || !time.Now().UTC().Before(t)
}

func within(ts string, d time.Duration) bool {
	t, err := time.Parse(time.RFC3339, ts)
	return err == nil && time.Since(t) < d
}

func clientIP(r *http.Request) string {
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		if first, _, ok := strings.Cut(xff, ","); ok {
			return strings.TrimSpace(first)
		}
		return xff
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

func (h *Handler) signupAllowed(ip string) bool {
	if h.signupLimiter == nil {
		h.signupLimiter = newWindowLimiter(5, time.Hour)
	}
	return h.signupLimiter.allow(ip)
}

type windowLimiter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
}

func newWindowLimiter(limit int, window time.Duration) *windowLimiter {
	return &windowLimiter{limit: limit, window: window, hits: map[string][]time.Time{}}
}

func (l *windowLimiter) allow(key string) bool {
	now := time.Now()
	cutoff := now.Add(-l.window)
	l.mu.Lock()
	defer l.mu.Unlock()
	items := l.hits[key]
	kept := items[:0]
	for _, t := range items {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.hits[key] = kept
		return false
	}
	l.hits[key] = append(kept, now)
	return true
}

func (h *Handler) issueSession(w http.ResponseWriter, r *http.Request, userID int64) error {
	token, hash, err := auth.NewSessionToken()
	if err != nil {
		return err
	}
	expires := time.Now().UTC().Add(14 * 24 * time.Hour)
	if err := h.Users.CreateAuthSession(r.Context(), userID, hash, expires.Format(time.RFC3339)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     authCookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})
	return nil
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if h.Users != nil {
		if token := sessionToken(r); token != "" {
			if hash, err := auth.HashSessionToken(token); err == nil {
				_ = h.Users.DeleteAuthSession(r.Context(), hash)
			}
		}
	}
	clearAuthCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	u, err := h.Users.GetUserByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	httpx.JSON(w, http.StatusOK, dto.AuthResponse{User: *u})
}

func (h *Handler) DashboardView(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	out, err := h.Dashboard.Build(r.Context(), userID)
	if err != nil {
		log.Println("dashboard:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not load dashboard")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

func (h *Handler) GetMyProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	progress, err := h.Users.ProgressMap(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not load progress")
		return
	}
	httpx.JSON(w, http.StatusOK, progress)
}

func (h *Handler) SaveMySession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	var req dto.SessionSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "invalid json body")
		return
	}
	if req.ProblemID == "" {
		httpx.Error(w, http.StatusBadRequest, httpx.ErrBadRequest, "problem_id required")
		return
	}
	if err := h.Users.SaveUserSession(r.Context(), userID, req); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrDatabaseError, "could not save progress")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) GetMySession(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	pid := chi.URLParam(r, "problem_id")
	sess, err := h.Users.GetUserSession(r.Context(), userID, pid)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrDatabaseError, "could not load progress")
		return
	}
	if sess == nil {
		httpx.Error(w, http.StatusNotFound, httpx.ErrNotFound, "no session")
		return
	}
	httpx.JSON(w, http.StatusOK, sess)
}

func (h *Handler) ExportMyProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	out, err := h.Users.ExportUserProgress(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not export progress")
		return
	}
	httpx.JSON(w, http.StatusOK, out)
}

func (h *Handler) ResetMyProgress(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	if err := h.Users.ResetUserProgress(r.Context(), userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not reset progress")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handler) DeleteMyAccount(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.ErrBadRequest, "login required")
		return
	}
	if err := h.Users.DeleteUser(r.Context(), userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "could not delete account")
		return
	}
	clearAuthCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func validEmail(email string) bool {
	return len(email) <= 254 && strings.Contains(email, "@") && strings.Contains(email, ".") && !strings.ContainsAny(email, " \t\r\n")
}

func validUsername(username string) bool {
	if len(username) < 3 || len(username) > 32 {
		return false
	}
	for _, ch := range username {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-' {
			continue
		}
		return false
	}
	return true
}

func sessionToken(r *http.Request) string {
	if c, err := r.Cookie(authCookieName); err == nil {
		return c.Value
	}
	authz := r.Header.Get("Authorization")
	if strings.HasPrefix(authz, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(authz, "Bearer "))
	}
	return ""
}

func clearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: authCookieName, Value: "", Path: "/", Expires: time.Unix(0, 0), MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
}

func problemSummary(id string) (dto.ProblemSummary, error) {
	for _, p := range problems.ListSummaries("", "") {
		if p.ID == id {
			return p, nil
		}
	}
	return dto.ProblemSummary{}, sql.ErrNoRows
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

// Trace generates a structured interview trace after a code run.
func (h *Handler) Trace(w http.ResponseWriter, r *http.Request) {
	var req dto.TraceRequest
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
		log.Println("trace problem lookup:", err)
		httpx.Error(w, http.StatusInternalServerError, httpx.ErrInternal, "failed to load problem")
		return
	}
	out, err := h.Traces.GenerateTrace(r.Context(), req)
	if err != nil {
		log.Println("trace:", err)
		httpx.ErrorWithDetails(w, http.StatusInternalServerError, httpx.ErrInternal, "Could not generate interview trace.", map[string]string{"reason": err.Error()})
		return
	}
	httpx.JSON(w, http.StatusOK, out)
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
