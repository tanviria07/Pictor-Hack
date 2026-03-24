package service

import (
	"context"
	"encoding/json"
	"strings"

	"josemorinho/backend/internal/coach"
	"josemorinho/backend/internal/deepseek"
	"josemorinho/backend/internal/dto"
	"josemorinho/backend/internal/problems"
	"josemorinho/backend/internal/runner"
)

// RunService orchestrates POST /api/run: Python runner is authoritative for execution
// and evaluation; DeepSeek may only rephrase interviewer_feedback text.
type RunService struct {
	runner   *runner.Client
	deepseek *deepseek.Client
}

// NewRunService wires dependencies.
func NewRunService(r *runner.Client, d *deepseek.Client) *RunService {
	return &RunService{runner: r, deepseek: d}
}

// Execute forwards to the runner and returns its response. DeepSeek never changes
// evaluation, status, or test counts — only the optional natural-language feedback string.
func (s *RunService) Execute(ctx context.Context, req dto.RunRequest) (*dto.RunResponse, error) {
	if req.Language != "" && req.Language != "python" {
		return nil, ErrUnsupportedLanguage
	}
	if req.Language == "" {
		req.Language = "python"
	}
	out, err := s.runner.Evaluate(ctx, req)
	if err != nil {
		return nil, err
	}
	if s.deepseek.Enabled() {
		raw, _ := json.MarshalIndent(out.Evaluation, "", "  ")
		title := req.ProblemID
		if rp, e := problems.GetPublic(req.ProblemID); e == nil {
			title = rp.Title
		}
		snip := truncateCode(req.Code, 240)
		user := coach.UserPromptRun(title, req.ProblemID, string(raw), snip)
		if fb, err := s.deepseek.CoachFeedback(coach.SystemInterviewer, user); err == nil && fb != "" {
			out.InterviewerFeedback = fb
		}
	}
	return out, nil
}

func truncateCode(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", "")
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
