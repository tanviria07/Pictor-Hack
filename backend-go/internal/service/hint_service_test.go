package service

import (
	"context"
	"strings"
	"testing"

	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/store"
)

func TestHint_fallbackAddsLoopHeuristic(t *testing.T) {
	st, err := store.Open("file::memory:?cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	h := NewHintService(deepseek.New(config.Config{}), st)
	eval := dto.StructuredEvaluation{
		Status:             dto.StatusWrong,
		SyntaxOK:           true,
		FunctionFound:      true,
		SignatureOK:        true,
		PassedVisibleTests: 0,
		TotalVisibleTests:  1,
		PassedHiddenTests:  0,
		TotalHiddenTests:   0,
		LikelyStage:        "tests",
		FeedbackTargets:    []string{"Check outputs"},
	}
	out, err := h.Hint(context.Background(), dto.HintRequest{
		ProblemID:  "two-sum",
		Code:       "def twoSum(nums, target):\n    while i < len(nums):\n        pass",
		Evaluation: eval,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(strings.ToLower(out.Hint), "loop") {
		t.Fatalf("expected loop-related heuristic in hint, got: %q", out.Hint)
	}
}
