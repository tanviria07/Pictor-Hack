package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"pictorhack/backend/internal/auth"
	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/handler"
	"pictorhack/backend/internal/httpapi"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/runner"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
)

type captureEmailSender struct {
	messages []handler.EmailMessage
}

func (s *captureEmailSender) Send(_ context.Context, msg handler.EmailMessage) error {
	s.messages = append(s.messages, msg)
	return nil
}

func TestMain(m *testing.M) {
	if err := problems.Init(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}

func newTestHandler(t *testing.T, runnerHandler http.HandlerFunc) (*handler.Handler, func()) {
	t.Helper()
	if runnerHandler == nil {
		runnerHandler = func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		}
	}
	ts := httptest.NewServer(runnerHandler)
	t.Cleanup(ts.Close)

	st, err := store.Open("file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("store: %v", err)
	}
	cfg := config.Config{}
	rc := runner.New(ts.URL)
	ds := deepseek.New(cfg)
	tsvc := service.NewTraceService(ds)
	runs := service.NewRunService(rc, ds, tsvc)

	h := &handler.Handler{
		Runs:         runs,
		Hints:        service.NewHintService(ds, st),
		Traces:       tsvc,
		Sessions:     st,
		Users:        st,
		EmailSender:  &captureEmailSender{},
		TokenSecret:  "test-email-token-secret",
		Dashboard:    service.NewDashboardService(st),
		MaxCodeBytes: 1 << 20,
	}
	return h, func() { _ = st.Close() }
}

func TestHealth(t *testing.T) {
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("runner should not be called")
	})
	defer cleanup()

	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestGetProblem_notFound(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems/does-not-exist", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["code"] != "not_found" {
		t.Fatalf("code: %v", body["code"])
	}
}

func TestGetProblem_ok(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems/two-sum", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestListProblems_includesCompanyTags(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
	var rows []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row["id"] != "two-sum" {
			continue
		}
		tags, ok := row["company_tags"].([]any)
		if !ok || len(tags) == 0 {
			t.Fatalf("expected company_tags on two-sum, got %#v", row["company_tags"])
		}
		return
	}
	t.Fatal("two-sum missing from problem summaries")
}

func TestListProblems_includesRecommendedRoles(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
	var rows []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row["id"] != "two-sum" {
			continue
		}
		roles, ok := row["recommended_for_roles"].([]any)
		if !ok || len(roles) == 0 {
			t.Fatalf("expected recommended_for_roles on two-sum, got %#v", row["recommended_for_roles"])
		}
		if roles[0] != "swe_intern" {
			t.Fatalf("expected swe_intern affinity on two-sum, got %#v", roles)
		}
		return
	}
	t.Fatal("two-sum missing from problem summaries")
}

func TestRun_invalidProblemIDFormat(t *testing.T) {
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("runner should not be called")
	})
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	payload := map[string]string{"problem_id": "Two-Sum", "language": "python", "code": "def twoSum():\n    pass"}
	b, _ := json.Marshal(payload)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestRun_unknownProblem(t *testing.T) {
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("runner should not be called")
	})
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	payload := map[string]string{"problem_id": "zzz-unknown-problem-99", "language": "python", "code": "def twoSum():\n    pass"}
	b, _ := json.Marshal(payload)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestRun_badJSON(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewBufferString("not-json"))
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestRun_runnerSuccess(t *testing.T) {
	runBody := `{
  "status": "correct",
  "evaluation": {
    "status": "correct",
    "syntax_ok": true,
    "function_found": true,
    "signature_ok": true,
    "passed_visible_tests": 2,
    "total_visible_tests": 2,
    "passed_hidden_tests": 1,
    "total_hidden_tests": 1,
    "error_type": null,
    "error_message": null,
    "failing_case_summary": null,
    "likely_stage": "done",
    "feedback_targets": []
  },
  "visible_test_results": [],
  "interviewer_feedback": "ok"
}`
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/evaluate" {
			t.Fatalf("path %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, runBody)
	})
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	payload := map[string]string{"problem_id": "two-sum", "language": "python", "code": "def twoSum(nums, target):\n    return []"}
	b, _ := json.Marshal(payload)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestRun_runnerUnavailable(t *testing.T) {
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	})
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	payload := map[string]string{"problem_id": "two-sum", "language": "python", "code": "x"}
	b, _ := json.Marshal(payload)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["code"] != "runner_unavailable" {
		t.Fatalf("code: %v", body)
	}
}

func TestPasswordAuthLocalMVPFlow(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	emailer := h.EmailSender.(*captureEmailSender)
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)

	postJSON := func(path string, body map[string]any, cookies []*http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		b, _ := json.Marshal(body)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		for _, c := range cookies {
			req.AddCookie(c)
		}
		srv.ServeHTTP(rec, req)
		return rec
	}

	missing := postJSON("/api/auth/signup", map[string]any{"email": "", "username": "", "password": ""}, nil)
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("missing fields status %d %s", missing.Code, missing.Body.String())
	}

	signup := postJSON("/api/auth/signup", map[string]any{"email": "local@example.com", "username": "local_user", "password": "password123"}, nil)
	if signup.Code != http.StatusAccepted {
		t.Fatalf("signup status %d %s", signup.Code, signup.Body.String())
	}
	if len(signup.Result().Cookies()) != 0 {
		t.Fatal("signup should not issue a session cookie before email verification")
	}
	if !strings.Contains(signup.Body.String(), "pending_verification") {
		t.Fatalf("signup should return pending_verification, got %s", signup.Body.String())
	}
	if len(emailer.messages) != 1 {
		t.Fatalf("expected one verification email, got %d", len(emailer.messages))
	}
	otp := firstSixDigitCode(emailer.messages[0].Text)
	if otp == "" {
		t.Fatalf("verification email missing otp: %q", emailer.messages[0].Text)
	}

	loginBeforeVerify := postJSON("/api/auth/login", map[string]any{"identifier": "local_user", "password": "password123"}, nil)
	if loginBeforeVerify.Code != http.StatusForbidden || !strings.Contains(loginBeforeVerify.Body.String(), "email verification required") {
		t.Fatalf("unverified login response %d %s", loginBeforeVerify.Code, loginBeforeVerify.Body.String())
	}

	resend := postJSON("/api/auth/resend-otp", map[string]any{"email": "local@example.com"}, nil)
	if resend.Code != http.StatusTooManyRequests {
		t.Fatalf("immediate resend should be rate limited, got %d %s", resend.Code, resend.Body.String())
	}

	verify := postJSON("/api/auth/verify-email", map[string]any{"email": "local@example.com", "otp": otp}, nil)
	if verify.Code != http.StatusOK {
		t.Fatalf("verify status %d %s", verify.Code, verify.Body.String())
	}
	if len(verify.Result().Cookies()) == 0 {
		t.Fatal("verify should issue a session cookie")
	}
	sessionCookie := verify.Result().Cookies()[0]

	duplicate := postJSON("/api/auth/signup", map[string]any{"email": "local@example.com", "username": "other_user", "password": "password123"}, nil)
	if duplicate.Code != http.StatusConflict {
		t.Fatalf("duplicate status %d %s", duplicate.Code, duplicate.Body.String())
	}

	wrongPassword := postJSON("/api/auth/login", map[string]any{"identifier": "local_user", "password": "wrongpass"}, nil)
	if wrongPassword.Code != http.StatusUnauthorized || !strings.Contains(wrongPassword.Body.String(), "wrong password") {
		t.Fatalf("wrong password response %d %s", wrongPassword.Code, wrongPassword.Body.String())
	}

	notFound := postJSON("/api/auth/login", map[string]any{"identifier": "missing_user", "password": "password123"}, nil)
	if notFound.Code != http.StatusUnauthorized || !strings.Contains(notFound.Body.String(), "user not found") {
		t.Fatalf("not found response %d %s", notFound.Code, notFound.Body.String())
	}

	me := httptest.NewRecorder()
	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(sessionCookie)
	srv.ServeHTTP(me, meReq)
	if me.Code != http.StatusOK || !strings.Contains(me.Body.String(), "local_user") {
		t.Fatalf("me response %d %s", me.Code, me.Body.String())
	}

	loginAfterVerify := postJSON("/api/auth/login", map[string]any{"identifier": "LOCAL_USER", "password": "password123"}, nil)
	if loginAfterVerify.Code != http.StatusOK {
		t.Fatalf("verified login response %d %s", loginAfterVerify.Code, loginAfterVerify.Body.String())
	}
	if len(loginAfterVerify.Result().Cookies()) == 0 {
		t.Fatal("login should issue a rotated session cookie")
	}
	rotatedCookie := loginAfterVerify.Result().Cookies()[0]

	oldCookie := httptest.NewRecorder()
	oldCookieReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	oldCookieReq.AddCookie(sessionCookie)
	srv.ServeHTTP(oldCookie, oldCookieReq)
	if oldCookie.Code != http.StatusUnauthorized {
		t.Fatalf("old session cookie should be invalid after rotation, got %d %s", oldCookie.Code, oldCookie.Body.String())
	}

	newCookie := httptest.NewRecorder()
	newCookieReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	newCookieReq.AddCookie(rotatedCookie)
	srv.ServeHTTP(newCookie, newCookieReq)
	if newCookie.Code != http.StatusOK || !strings.Contains(newCookie.Body.String(), "local_user") {
		t.Fatalf("rotated session cookie response %d %s", newCookie.Code, newCookie.Body.String())
	}

	logout := postJSON("/api/auth/logout", map[string]any{}, []*http.Cookie{rotatedCookie})
	if logout.Code != http.StatusOK {
		t.Fatalf("logout status %d %s", logout.Code, logout.Body.String())
	}

	protected := httptest.NewRecorder()
	protectedReq := httptest.NewRequest(http.MethodGet, "/api/me/dashboard", nil)
	protectedReq.AddCookie(rotatedCookie)
	srv.ServeHTTP(protected, protectedReq)
	if protected.Code != http.StatusUnauthorized {
		t.Fatalf("dashboard should require a valid session, got %d %s", protected.Code, protected.Body.String())
	}
}

func firstSixDigitCode(s string) string {
	for i := 0; i+6 <= len(s); i++ {
		candidate := s[i : i+6]
		ok := true
		for _, ch := range candidate {
			if ch < '0' || ch > '9' {
				ok = false
				break
			}
		}
		if ok {
			return candidate
		}
	}
	return ""
}

func TestEmailVerificationExpiredOTP(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)

	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Users.CreateUser(context.Background(), "expired@example.com", "expired_user", hash); err != nil {
		t.Fatal(err)
	}
	otpHash, err := auth.HashEmailToken(h.TokenSecret, auth.EmailVerificationPurpose, "expired@example.com", "123456")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.Users.CreateEmailVerification(context.Background(), "expired@example.com", auth.EmailVerificationPurpose, otpHash, time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"email": "expired@example.com", "otp": "123456"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/verify-email", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "expired") {
		t.Fatalf("expired otp response %d %s", rec.Code, rec.Body.String())
	}
}

func TestPasswordResetExpiredToken(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)

	hash, err := auth.HashPassword("password123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.Users.CreateUser(context.Background(), "reset@example.com", "reset_user", hash); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Users.MarkEmailVerified(context.Background(), "reset@example.com"); err != nil {
		t.Fatal(err)
	}
	tokenHash, err := auth.HashEmailToken(h.TokenSecret, auth.PasswordResetPurpose, "", "expired-reset-token")
	if err != nil {
		t.Fatal(err)
	}
	if err := h.Users.CreateEmailVerification(context.Background(), "reset@example.com", auth.PasswordResetPurpose, tokenHash, time.Now().UTC().Add(-time.Minute).Format(time.RFC3339)); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(map[string]any{"token": "expired-reset-token", "new_password": "newpassword123"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/reset-password", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "expired") {
		t.Fatalf("expired reset response %d %s", rec.Code, rec.Body.String())
	}
}

func TestSaveSession_validation(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/session/save", bytes.NewBufferString(`{"code":"","hint_history":[]}`))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestSaveAndGetSession(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)

	save := map[string]any{
		"problem_id":      "two-sum",
		"code":            "print(1)",
		"hint_history":    []string{},
		"practice_status": "in_progress",
	}
	sb, _ := json.Marshal(save)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/session/save", bytes.NewReader(sb))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("save status %d %s", rec.Code, rec.Body.String())
	}

	r2 := httptest.NewRecorder()
	srv.ServeHTTP(r2, httptest.NewRequest(http.MethodGet, "/api/session/two-sum", nil))
	if r2.Code != http.StatusOK {
		t.Fatalf("get status %d %s", r2.Code, r2.Body.String())
	}
}

func TestGetSession_notFound(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/session/unknown-problem-xyz", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestHint_notFoundProblem(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	body := map[string]any{
		"problem_id": "nope",
		"code":       "",
		"evaluation": map[string]any{"status": "wrong", "syntax_ok": true, "function_found": true, "signature_ok": true, "passed_visible_tests": 0, "total_visible_tests": 1, "passed_hidden_tests": 0, "total_hidden_tests": 0, "likely_stage": "test", "feedback_targets": []string{}},
	}
	b, _ := json.Marshal(body)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/hint", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

// Regression: GET /api/problems/:id must never expose hidden test payloads or solution summaries.
func TestGetProblem_publicResponseShape(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"}, 10000)
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems/precode-pb-01-return-seven", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	for _, leak := range []string{
		"hidden_tests",
		"visible_tests",
		"canonical_solution_summary",
		"hint_plan",
	} {
		if _, ok := m[leak]; ok {
			t.Fatalf("public API must not include %q", leak)
		}
	}
	if _, ok := m["hidden_test_count"]; !ok {
		t.Fatal("expected hidden_test_count for UI")
	}
	if _, ok := m["visible_test_count"]; !ok {
		t.Fatal("expected visible_test_count for UI")
	}
}
