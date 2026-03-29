package handler_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/handler"
	"pictorhack/backend/internal/httpapi"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/runner"
	"pictorhack/backend/internal/service"
	"pictorhack/backend/internal/store"
)

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
	runs := service.NewRunService(rc, ds)

	h := &handler.Handler{
		Runs:     runs,
		RunJobs:  nil,
		Hints:    service.NewHintService(ds, st),
		Sessions: st,
	}
	return h, func() { _ = st.Close() }
}

func TestHealth(t *testing.T) {
	h, cleanup := newTestHandler(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("runner should not be called")
	})
	defer cleanup()

	srv := httpapi.NewRouter(h, []string{"*"})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/health", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestGetProblem_notFound(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
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
	srv := httpapi.NewRouter(h, []string{"*"})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/problems/two-sum", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body.String())
	}
}

func TestRun_badJSON(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
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
	srv := httpapi.NewRouter(h, []string{"*"})
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
	srv := httpapi.NewRouter(h, []string{"*"})
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

func TestSaveSession_validation(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
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
	srv := httpapi.NewRouter(h, []string{"*"})

	save := map[string]any{
		"problem_id": "two-sum",
		"code":       "print(1)",
		"hint_history": []string{},
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
	srv := httpapi.NewRouter(h, []string{"*"})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/session/unknown-problem-xyz", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestHint_notFoundProblem(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
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

func TestSubmitRunJob_whenDisabled(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
	b, _ := json.Marshal(map[string]string{"problem_id": "two-sum", "language": "python", "code": "x"})
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/run/jobs", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	srv.ServeHTTP(rec, req)
	// Route not registered when RunJobs nil -> chi 404
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when async routes omitted, got %d %s", rec.Code, rec.Body.String())
	}
}

func TestGetRunJob_routeMissing(t *testing.T) {
	h, cleanup := newTestHandler(t, nil)
	defer cleanup()
	srv := httpapi.NewRouter(h, []string{"*"})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/run/jobs/job-1", nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}
