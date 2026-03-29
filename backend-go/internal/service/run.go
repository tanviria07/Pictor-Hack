package service

import (
	"context"
	"encoding/json"
	"strings"

	"pictorhack/backend/internal/coach"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/runner"
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
// evaluation, status, or test counts â€” only the optional natural-language feedback string.
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
	s.ApplyCoachFeedback(ctx, req, out)
	return out, nil
}

// ApplyCoachFeedback optionally rephrases interviewer_feedback via DeepSeek (wording only).
func (s *RunService) ApplyCoachFeedback(ctx context.Context, req dto.RunRequest, out *dto.RunResponse) {
	if out == nil || !s.deepseek.Enabled() {
		return
	}
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

func truncateCode(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", "")
	if len(s) <= n {
		return s
	}
	return s[:n] + "â€¦"
}
