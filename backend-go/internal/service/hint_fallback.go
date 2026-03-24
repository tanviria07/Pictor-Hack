package service

import (
	"strings"

	"josemorinho/backend/internal/dto"
	"josemorinho/backend/internal/problems"
)

// MaxHintLevel caps progressive hints (1..MaxHintLevel).
const MaxHintLevel = 4

// buildFallbackHintResponse uses seeded hint plan + deterministic lines when DeepSeek is off or fails.
func buildFallbackHintResponse(
	level int,
	eval dto.StructuredEvaluation,
	problemID string,
) dto.HintResponse {
	seeded := problems.SeededHint(problemID, level)
	if seeded == "" {
		seeded = "Align with the examples first, then re-read the constraints for edge cases."
	}
	feedback := feedbackLineFromEval(eval)
	next := nextFocusFromEval(eval)
	combined := feedback
	if strings.TrimSpace(seeded) != "" {
		combined = strings.TrimSpace(feedback + "\n\n" + seeded)
	}
	return dto.HintResponse{
		Feedback:            feedback,
		Hint:                seeded,
		NextFocus:           next,
		HintLevel:           level,
		InterviewerFeedback: combined,
	}
}

func feedbackLineFromEval(eval dto.StructuredEvaluation) string {
	switch eval.Status {
	case dto.StatusCorrect:
		return "All checks passed — no hint needed."
	case dto.StatusSyntaxError:
		return "Fix syntax first; the runner cannot execute until the file parses."
	case dto.StatusRuntimeError:
		msg := "Execution failed before or during tests."
		if eval.ErrorType != nil && *eval.ErrorType != "" {
			msg = "Error: " + *eval.ErrorType + "."
		}
		return msg
	case dto.StatusIncomplete:
		return "The entrypoint exists but the implementation is not yet a complete attempt for this task."
	case dto.StatusWrong:
		return "The visible samples do not yet match the expected behavior."
	case dto.StatusPartial:
		return "Some tests pass; narrow down what still differs from the spec."
	default:
		return "Review the evaluation targets below."
	}
}

func nextFocusFromEval(eval dto.StructuredEvaluation) string {
	if len(eval.FeedbackTargets) > 0 {
		return eval.FeedbackTargets[0]
	}
	if eval.FailingCaseSummary != nil && strings.TrimSpace(*eval.FailingCaseSummary) != "" {
		return *eval.FailingCaseSummary
	}
	return "Reconcile your return values with the problem examples line by line."
}
