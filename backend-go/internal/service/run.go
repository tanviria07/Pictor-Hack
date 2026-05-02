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
	traces   *TraceService
}

// NewRunService wires dependencies.
func NewRunService(r *runner.Client, d *deepseek.Client, t *TraceService) *RunService {
	return &RunService{runner: r, deepseek: d, traces: t}
}

// Validate forwards stepwise validation to the runner.
func (s *RunService) Validate(ctx context.Context, req dto.StepwiseValidateRequest) (*dto.StepwiseValidateResponse, error) {
	return s.runner.Validate(ctx, req)
}

// GenerateStepwise forwards a stepwise scaffold generation request to the
// Python runner, which owns both the DeepSeek call and the filesystem write.
func (s *RunService) GenerateStepwise(ctx context.Context, req dto.StepwiseGenerateRequest) (*dto.StepwiseGenerateResponse, error) {
	return s.runner.GenerateStepwise(ctx, req)
}

// Execute forwards to the runner and returns its response. DeepSeek never changes
// evaluation, status, or test counts — only the optional natural-language feedback string.
func (s *RunService) Execute(ctx context.Context, req dto.RunRequest) (*dto.RunResponse, error) {
	if _, err := problems.GetPublic(req.ProblemID); err != nil {
		return nil, err
	}

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
	out.Trace = s.GenerateTrace(ctx, req, out.Evaluation)
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
	sysPrompt := coach.RoleSystemPrompt(coach.SystemInterviewer, req.Role)
	if fb, err := s.deepseek.CoachFeedback(sysPrompt, user); err == nil && fb != "" {
		out.InterviewerFeedback = fb
	}
}

func (s *RunService) GenerateTrace(ctx context.Context, req dto.RunRequest, eval dto.StructuredEvaluation) *dto.InterviewTrace {
	if s.traces == nil {
		return nil
	}
	tr, err := s.traces.GenerateTrace(ctx, dto.TraceRequest{
		ProblemID:  req.ProblemID,
		Code:       req.Code,
		Evaluation: eval,
		Role:       req.Role,
	})
	if err != nil || tr == nil {
		return nil
	}
	return &tr.Trace
}

func truncateCode(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", "")
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "..."
}
