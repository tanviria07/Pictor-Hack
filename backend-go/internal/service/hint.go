package service

import (
	"context"
	"strings"

	"pictorhack/backend/internal/coach"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/store"
)

// HintService builds progressive hints grounded in runner-provided evaluation JSON.
type HintService struct {
	deepseek *deepseek.Client
	sessions store.SessionRepository
}

// NewHintService wires dependencies.
func NewHintService(d *deepseek.Client, s store.SessionRepository) *HintService {
	return &HintService{deepseek: d, sessions: s}
}

// Hint returns a hint for the current problem. Evaluation must come from the last /api/run
// (Python runner); this service never recomputes correctness.
func (s *HintService) Hint(ctx context.Context, req dto.HintRequest) (*dto.HintResponse, error) {
	sess, _ := s.sessions.GetSession(ctx, req.ProblemID)
	level := hintLevel(req, sess)

	pctx, err := problems.BuildHintPromptContext(req.ProblemID)
	if err != nil {
		return nil, err
	}
	hist := []string{}
	if sess != nil {
		hist = sess.HintHistory
	}
	codePrefix := truncateCodeHint(req.Code, 320)
	userMsg, err := coach.BuildHintUserMessage(pctx, level, req.Evaluation, hist, codePrefix)
	if err != nil {
		return nil, err
	}

	if s.deepseek.Enabled() {
		raw, err := s.deepseek.HintJSONCompletion(ctx, coach.SystemHintJSON, userMsg)
		if err == nil && raw != "" {
			parsed, perr := deepseek.ParseHintJSON(raw)
			if perr == nil {
				return mergeHintLLM(parsed, level), nil
			}
		}
	}

	out := buildFallbackHintResponse(level, req.Evaluation, req.ProblemID)
	return &out, nil
}

func mergeHintLLM(parsed deepseek.HintJSON, level int) *dto.HintResponse {
	fb := strings.TrimSpace(parsed.Feedback)
	h := strings.TrimSpace(parsed.Hint)
	nf := strings.TrimSpace(parsed.NextFocus)
	combined := fb
	if h != "" {
		if combined != "" {
			combined += "\n\n"
		}
		combined += h
	}
	if nf != "" {
		if combined != "" {
			combined += "\n\n"
		}
		combined += "Next: " + nf
	}
	return &dto.HintResponse{
		Feedback:            fb,
		Hint:                h,
		NextFocus:           nf,
		HintLevel:           level,
		InterviewerFeedback: strings.TrimSpace(combined),
	}
}

func hintLevel(req dto.HintRequest, sess *dto.SessionState) int {
	if req.HintLevelRequested != nil && *req.HintLevelRequested >= 1 && *req.HintLevelRequested <= MaxHintLevel {
		return *req.HintLevelRequested
	}
	n := 0
	if sess != nil {
		n = len(sess.HintHistory)
	}
	level := n + 1
	if level > MaxHintLevel {
		level = MaxHintLevel
	}
	return level
}

func truncateCodeHint(s string, n int) string {
	s = strings.ReplaceAll(s, "\r", "")
	if len(s) <= n {
		return s
	}
	return s[:n] + "â€¦"
}
