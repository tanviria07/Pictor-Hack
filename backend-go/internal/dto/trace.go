package dto

type InterviewTrace struct {
	AttemptStatus        string `json:"attempt_status"`
	LikelyBugPattern     string `json:"likely_bug_pattern"`
	FailedEdgeCaseCategory string `json:"failed_edge_case_category"`
	ComplexityNote       string `json:"complexity_note"`
	InterviewRisk        string `json:"interview_risk"`
	NextRecommendedAction string `json:"next_recommended_action"`
	FollowUpQuestion    string  `json:"follow_up_question"`
}

type TraceRequest struct {
	ProblemID  string               `json:"problem_id"`
	Code       string               `json:"code"`
	Evaluation StructuredEvaluation `json:"evaluation"`
	Role       string               `json:"role,omitempty"`
}

type TraceResponse struct {
	Trace InterviewTrace `json:"trace"`
}
