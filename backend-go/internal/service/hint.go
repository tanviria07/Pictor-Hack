package service

import (
	"context"
	"encoding/json"
	"strings"

	"josemorinho/backend/internal/coach"
	"josemorinho/backend/internal/deepseek"
	"josemorinho/backend/internal/dto"
	"josemorinho/backend/internal/problems"
	"josemorinho/backend/internal/store"
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
// (Python runner); never reinterpreted here.
func (s *HintService) Hint(ctx context.Context, req dto.HintRequest) (*dto.HintResponse, error) {
	rp, err := problems.GetPublic(req.ProblemID)
	if err != nil {
		return nil, err
	}
	sess, _ := s.sessions.GetSession(ctx, req.ProblemID)
	level := hintLevel(req, sess)
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
	if s.deepseek.Enabled() {
		if h, err := s.deepseek.CoachFeedback(coach.SystemHint, user); err == nil && h != "" {
			hintText = strings.TrimSpace(h)
			feedback = hintText
		}
	}
	return &dto.HintResponse{
		Hint:                hintText,
		HintLevel:           level,
		InterviewerFeedback: feedback,
	}, nil
}

func hintLevel(req dto.HintRequest, sess *dto.SessionState) int {
	if req.HintLevelRequested != nil && *req.HintLevelRequested >= 1 && *req.HintLevelRequested <= 4 {
		return *req.HintLevelRequested
	}
	n := 0
	if sess != nil {
		n = len(sess.HintHistory)
	}
	level := n + 1
	if level > 4 {
		level = 4
	}
	return level
}
