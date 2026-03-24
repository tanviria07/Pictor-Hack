package api

// Mirror shared/contracts/api.ts — keep field names aligned for JSON.

type ProblemStatus string

const (
	StatusSyntaxError   ProblemStatus = "syntax_error"
	StatusRuntimeError  ProblemStatus = "runtime_error"
	StatusIncomplete    ProblemStatus = "incomplete"
	StatusPartial       ProblemStatus = "partial"
	StatusWrong         ProblemStatus = "wrong"
	StatusCorrect       ProblemStatus = "correct"
)

type StructuredEvaluation struct {
	Status               ProblemStatus `json:"status"`
	SyntaxOK             bool          `json:"syntax_ok"`
	FunctionFound        bool          `json:"function_found"`
	SignatureOK          bool          `json:"signature_ok"`
	PassedVisibleTests   int           `json:"passed_visible_tests"`
	TotalVisibleTests    int           `json:"total_visible_tests"`
	PassedHiddenTests    int           `json:"passed_hidden_tests"`
	TotalHiddenTests     int           `json:"total_hidden_tests"`
	ErrorType            *string       `json:"error_type"`
	ErrorMessage         *string       `json:"error_message"`
	FailingCaseSummary   *string       `json:"failing_case_summary"`
	LikelyStage          string        `json:"likely_stage"`
	FeedbackTargets      []string      `json:"feedback_targets"`
}

type VisibleTestResult struct {
	Index int     `json:"index"`
	Passed bool   `json:"passed"`
	Label *string `json:"label,omitempty"`
}

type RunRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

type RunResponse struct {
	Status               ProblemStatus         `json:"status"`
	Evaluation           StructuredEvaluation  `json:"evaluation"`
	VisibleTestResults   []VisibleTestResult   `json:"visible_test_results"`
	InterviewerFeedback  string                `json:"interviewer_feedback"`
}

type HintRequest struct {
	ProblemID           string                `json:"problem_id"`
	Code                string                `json:"code"`
	Evaluation          StructuredEvaluation  `json:"evaluation"`
	HintLevelRequested  *int                  `json:"hint_level_requested,omitempty"`
}

type HintResponse struct {
	Hint                 string `json:"hint"`
	HintLevel            int    `json:"hint_level"`
	InterviewerFeedback  string `json:"interviewer_feedback"`
}

type SessionSaveRequest struct {
	ProblemID    string   `json:"problem_id"`
	Code         string   `json:"code"`
	HintHistory  []string `json:"hint_history"`
}

type SessionState struct {
	ProblemID  string   `json:"problem_id"`
	Code       string   `json:"code"`
	HintHistory []string `json:"hint_history"`
	UpdatedAt  string   `json:"updated_at"`
}

type Example struct {
	Input        string  `json:"input"`
	Output       string  `json:"output"`
	Explanation *string `json:"explanation,omitempty"`
}

type Parameter struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type ProblemSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Difficulty   string `json:"difficulty"`
	FunctionName string `json:"function_name"`
}

type ProblemDetail struct {
	ID                 string      `json:"id"`
	Title              string      `json:"title"`
	Difficulty         string      `json:"difficulty"`
	Description        string      `json:"description"`
	Examples           []Example   `json:"examples"`
	Constraints        []string    `json:"constraints"`
	FunctionName       string      `json:"function_name"`
	Parameters         []Parameter `json:"parameters"`
	ExpectedReturnType string      `json:"expected_return_type"`
	VisibleTestCount   int         `json:"visible_test_count"`
	HiddenTestCount    int         `json:"hidden_test_count"`
}

type RunnerEvaluateRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}
