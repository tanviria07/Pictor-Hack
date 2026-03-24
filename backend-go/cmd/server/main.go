package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"josemorinho/backend/internal/api"
	"josemorinho/backend/internal/coach"
	"josemorinho/backend/internal/deepseek"
	"josemorinho/backend/internal/problems"
	"josemorinho/backend/internal/runner"
	"josemorinho/backend/internal/store"
)

func main() {
	if err := problems.Init(); err != nil {
		log.Fatal(err)
	}
	dbPath := os.Getenv("DATABASE_PATH")
	if dbPath == "" {
		dbPath = "./data/josemorinho.db"
	}
	if err := os.MkdirAll("./data", 0o755); err != nil {
		log.Fatal(err)
	}
	st, err := store.Open(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer st.Close()

	runnerURL := os.Getenv("RUNNER_URL")
	if runnerURL == "" {
		runnerURL = "http://127.0.0.1:8001"
	}
	rc := runner.New(runnerURL)
	dsk := deepseek.NewFromEnv()

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors())

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api", func(r chi.Router) {
		r.Get("/problems", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, problems.ListSummaries())
		})
		r.Get("/problems/{id}", func(w http.ResponseWriter, r *http.Request) {
			id := chi.URLParam(r, "id")
			p, err := problems.GetPublic(id)
			if err != nil {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			writeJSON(w, http.StatusOK, p)
		})
		r.Post("/run", func(w http.ResponseWriter, r *http.Request) {
			var req api.RunRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
				return
			}
			if req.Language == "" {
				req.Language = "python"
			}
			if req.Language != "python" {
				http.Error(w, `{"error":"only python supported"}`, http.StatusBadRequest)
				return
			}
			out, err := rc.Evaluate(req)
			if err != nil {
				log.Println("runner:", err)
				http.Error(w, `{"error":"runner unavailable"}`, http.StatusBadGateway)
				return
			}
			if dsk.Enabled() {
				raw, _ := json.MarshalIndent(out.Evaluation, "", "  ")
				title := req.ProblemID
				if rp, e := problems.GetPublic(req.ProblemID); e == nil {
					title = rp.Title
				}
				snip := truncate(req.Code, 240)
				user := coach.UserPromptRun(title, req.ProblemID, string(raw), snip)
				if fb, err := dsk.CoachFeedback(coach.SystemInterviewer, user); err == nil && fb != "" {
					out.InterviewerFeedback = fb
				}
			}
			writeJSON(w, http.StatusOK, out)
		})
		r.Post("/hint", func(w http.ResponseWriter, r *http.Request) {
			var req api.HintRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
				return
			}
			rp, err := problems.GetPublic(req.ProblemID)
			if err != nil {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			sess, _ := st.GetSession(req.ProblemID)
			level := 1
			if req.HintLevelRequested != nil && *req.HintLevelRequested >= 1 && *req.HintLevelRequested <= 4 {
				level = *req.HintLevelRequested
			} else {
				n := 0
				if sess != nil {
					n = len(sess.HintHistory)
				}
				level = n + 1
				if level > 4 {
					level = 4
				}
			}
			hintPlan, _ := problems.HintPlanJSON(req.ProblemID)
			rawEval, _ := json.MarshalIndent(req.Evaluation, "", "  ")
			prior := ""
			if sess != nil {
				prior = strings.Join(sess.HintHistory, "\n---\n")
			}
			user := coach.UserPromptHint(rp.Title, req.ProblemID, level, string(rawEval), prior, hintPlan)

			hintText := problems.SeededHint(req.ProblemID, level)
			if hintText == "" {
				hintText = "Take another pass at the examples, then tighten your invariant."
			}
			feedback := hintText
			if dsk.Enabled() {
				if h, err := dsk.CoachFeedback(coach.SystemHint, user); err == nil && h != "" {
					hintText = strings.TrimSpace(h)
					feedback = hintText
				}
			}
			writeJSON(w, http.StatusOK, api.HintResponse{
				Hint:                hintText,
				HintLevel:           level,
				InterviewerFeedback: feedback,
			})
		})
		r.Post("/session/save", func(w http.ResponseWriter, r *http.Request) {
			var req api.SessionSaveRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, `{"error":"bad json"}`, http.StatusBadRequest)
				return
			}
			if req.ProblemID == "" {
				http.Error(w, `{"error":"problem_id required"}`, http.StatusBadRequest)
				return
			}
			if err := st.SaveSession(req); err != nil {
				http.Error(w, `{"error":"save failed"}`, http.StatusInternalServerError)
				return
			}
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		})
		r.Get("/session/{problem_id}", func(w http.ResponseWriter, r *http.Request) {
			pid := chi.URLParam(r, "problem_id")
			sess, err := st.GetSession(pid)
			if err != nil {
				http.Error(w, `{"error":"db"}`, http.StatusInternalServerError)
				return
			}
			if sess == nil {
				http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
				return
			}
			writeJSON(w, http.StatusOK, sess)
		})
	})

	addr := ":8080"
	if v := os.Getenv("PORT"); v != "" {
		addr = ":" + v
	}
	log.Println("listening on", addr)
	log.Fatal(http.ListenAndServe(addr, r))
}

func cors() func(http.Handler) http.Handler {
	origins := os.Getenv("CORS_ORIGINS")
	if origins == "" {
		origins = "http://localhost:3000"
	}
	allow := map[string]bool{}
	for _, o := range strings.Split(origins, ",") {
		allow[strings.TrimSpace(o)] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			o := r.Header.Get("Origin")
			if allow[o] {
				w.Header().Set("Access-Control-Allow-Origin", o)
			}
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func truncate(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", "")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
