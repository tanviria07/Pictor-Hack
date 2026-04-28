package service

import (
	"context"
	"encoding/json"

	"pictorhack/backend/internal/coach"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
)

type TraceService struct {
	deepseek *deepseek.Client
}

func NewTraceService(d *deepseek.Client) *TraceService {
	return &TraceService{deepseek: d}
}

func (s *TraceService) GenerateTrace(ctx context.Context, req dto.TraceRequest) (*dto.TraceResponse, error) {
	if s.deepseek.Enabled() {
		if tr, err := s.generateLLMTrace(ctx, req); err == nil && tr != nil {
			return tr, nil
		}
	}
	return s.buildFallbackTrace(req), nil
}

type traceJSON struct {
	AttemptStatus        string `json:"attempt_status"`
	LikelyBugPattern     string `json:"likely_bug_pattern"`
	FailedEdgeCaseCategory string `json:"failed_edge_case_category"`
	ComplexityNote       string `json:"complexity_note"`
	InterviewRisk        string `json:"interview_risk"`
	NextRecommendedAction string `json:"next_recommended_action"`
	FollowUpQuestion    string  `json:"follow_up_question"`
}

func (s *TraceService) generateLLMTrace(ctx context.Context, req dto.TraceRequest) (*dto.TraceResponse, error) {
	pctx, err := problems.BuildHintPromptContext(req.ProblemID)
	if err != nil {
		return nil, err
	}
	evalJSON, err := json.MarshalIndent(req.Evaluation, "", "  ")
	if err != nil {
		return nil, err
	}
	userMsg := string(evalJSON) + "\n\nCode:\n" + truncateCode(req.Code, 400) +
		"\n\nProblem: " + pctx.Title + " (" + pctx.Difficulty + ")"

	sysPrompt := coach.RoleSystemPrompt(coach.SystemTraceJSON, req.Role)
	raw, err := s.deepseek.TraceJSONCompletion(ctx, sysPrompt, userMsg)
	if err != nil || raw == "" {
		return nil, err
	}
	parsed, err := deepseek.ParseTraceJSON(raw)
	if err != nil {
		return nil, err
	}
	return &dto.TraceResponse{
		Trace: dto.InterviewTrace{
			AttemptStatus:        parsed.AttemptStatus,
			LikelyBugPattern:     parsed.LikelyBugPattern,
			FailedEdgeCaseCategory: parsed.FailedEdgeCaseCategory,
			ComplexityNote:       parsed.ComplexityNote,
			InterviewRisk:        parsed.InterviewRisk,
			NextRecommendedAction: parsed.NextRecommendedAction,
			FollowUpQuestion:    parsed.FollowUpQuestion,
		},
	}, nil
}

func (s *TraceService) buildFallbackTrace(req dto.TraceRequest) *dto.TraceResponse {
	ev := req.Evaluation
	t := dto.InterviewTrace{}

	switch ev.Status {
	case dto.StatusCorrect:
		t.AttemptStatus = "All tests passed"
		t.LikelyBugPattern = "None — solution is correct"
		t.FailedEdgeCaseCategory = ""
		t.ComplexityNote = "Optimal or near-optimal"
		t.InterviewRisk = "Low"
		t.NextRecommendedAction = "Discuss time/space complexity and possible optimizations"
		t.FollowUpQuestion = "Can you walk me through the time complexity of your solution?"
	case dto.StatusSyntaxError:
		t.AttemptStatus = "Did not compile/parse"
		t.LikelyBugPattern = "Syntax error — missing colon, mismatched brackets, or indentation"
		t.FailedEdgeCaseCategory = "N/A (code did not parse)"
		t.InterviewRisk = "High — syntax errors in an interview signal lack of Python fluency"
		t.NextRecommendedAction = "Fix syntax errors first, then re-run"
		t.FollowUpQuestion = "Before fixing the syntax, can you spot what's wrong on this line?"
	case dto.StatusRuntimeError:
		t.AttemptStatus = "Crashed during execution"
		t.LikelyBugPattern = "Runtime exception (e.g., index out of bounds, NoneType access, division by zero)"
		t.FailedEdgeCaseCategory = "Edge case likely — empty input, null values, or boundary conditions"
		t.InterviewRisk = "Medium-High — runtime errors waste time; practice defensive coding"
		t.NextRecommendedAction = "Trace through the failing test case manually"
		t.FollowUpQuestion = "What input would cause your code to throw this error?"
	case dto.StatusIncomplete:
		t.AttemptStatus = "Solution incomplete"
		t.LikelyBugPattern = "Placeholders or missing logic — function body not fully implemented"
		t.FailedEdgeCaseCategory = ""
		t.ComplexityNote = "Cannot assess — implementation incomplete"
		t.InterviewRisk = "Medium — shows you can start but not finish; practice completing solutions"
		t.NextRecommendedAction = "Replace all pass/placeholder statements with real logic"
		t.FollowUpQuestion = "What's the core algorithm you plan to implement?"
	case dto.StatusPartial:
		t.AttemptStatus = "Partially correct"
		t.LikelyBugPattern = "Algorithm mostly works but fails specific test categories"
		t.FailedEdgeCaseCategory = deriveEdgeCaseCategory(ev)
		t.ComplexityNote = "Likely correct approach"
		t.InterviewRisk = "Medium — on the right track but missing details"
		t.NextRecommendedAction = "Review the failing test cases and identify the pattern"
		t.FollowUpQuestion = "What kind of input is tripping up your solution?"
	case dto.StatusWrong:
		t.AttemptStatus = "Not passing tests"
		t.LikelyBugPattern = "Algorithmic error — logic does not match expected behavior"
		t.FailedEdgeCaseCategory = deriveEdgeCaseCategory(ev)
		t.InterviewRisk = "Medium-High — fundamental misunderstanding or implementation gap"
		t.NextRecommendedAction = "Re-read the problem constraints and trace through examples manually"
		t.FollowUpQuestion = "Can you explain what your code does when the input is at the boundary?"
	default:
		t.AttemptStatus = "Internal runner error"
		t.LikelyBugPattern = "Platform issue — retry"
		t.InterviewRisk = "N/A"
		t.NextRecommendedAction = "Re-run the code"
		t.FollowUpQuestion = ""
	}

	if ev.FailingCaseSummary != nil && *ev.FailingCaseSummary != "" {
		if t.FailedEdgeCaseCategory == "" {
			t.FailedEdgeCaseCategory = *ev.FailingCaseSummary
		}
	}

	if ev.ComplexityNote != "" {
		t.ComplexityNote = ev.ComplexityNote
	}

	if t.ComplexityNote == "" && ev.Status == dto.StatusCorrect {
		t.ComplexityNote = "See code for Big-O analysis"
	}

	// Role-specific follow-up when DeepSeek is unavailable
	if req.Role != "" && t.FollowUpQuestion != "" {
		t.FollowUpQuestion = roleAdjustQuestion(t.FollowUpQuestion, req.Role)
	}

	return &dto.TraceResponse{Trace: t}
}

func deriveEdgeCaseCategory(ev dto.StructuredEvaluation) string {
	if ev.TotalVisibleTests == 0 && ev.TotalHiddenTests == 0 {
		return ""
	}
	pct := float64(ev.PassedVisibleTests+ev.PassedHiddenTests) / float64(ev.TotalVisibleTests+ev.TotalHiddenTests)
	switch {
	case pct == 0:
		return "All tests failing — fundamental logic error"
	case pct < 0.3:
		return "Core algorithm incorrect — most inputs fail"
	case pct < 0.7:
		return "Partial correctness — specific input categories fail"
	case pct < 1.0:
		return "Edge cases — empty input, boundary values, or duplicates"
	}
	if ev.FailingCaseSummary != nil && *ev.FailingCaseSummary != "" {
		return *ev.FailingCaseSummary
	}
	return ""
}

func roleAdjustQuestion(q, role string) string {
	switch role {
	case "cloud_solutions_architect":
		return q + " (Consider cloud-scale implications.)"
	case "backend_engineer":
		return q + " (How would you handle this in production?)"
	case "ai_infrastructure":
		return q + " (What observability would you add here?)"
	default:
		return q
	}
}
