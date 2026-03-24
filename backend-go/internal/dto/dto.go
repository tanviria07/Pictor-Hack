// Package dto defines JSON transport types for the REST API.
// Correctness fields (StructuredEvaluation, status, test counts) originate from
// the Python runner only; this package does not implement judging logic.
package dto

// ProblemStatus is mirrored from the runner's deterministic evaluation.
type ProblemStatus string

const (
	StatusSyntaxError  ProblemStatus = "syntax_error"
	StatusRuntimeError ProblemStatus = "runtime_error"
	StatusIncomplete ProblemStatus = "incomplete"
	StatusPartial    ProblemStatus = "partial"
	StatusWrong      ProblemStatus = "wrong"
	StatusCorrect    ProblemStatus = "correct"
)

// StructuredEvaluation is produced exclusively by the Python runner.
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

// VisibleTestResult is produced by the runner.
type VisibleTestResult struct {
	Index  int     `json:"index"`
	Passed bool    `json:"passed"`
	Label  *string `json:"label,omitempty"`
}

// RunRequest is the public API contract for POST /api/run.
type RunRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

// RunResponse is returned to the frontend. Evaluation is unmodified from the runner;
// InterviewerFeedback may be rephrased by DeepSeek (wording only).
type RunResponse struct {
	Status               ProblemStatus        `json:"status"`
	Evaluation           StructuredEvaluation `json:"evaluation"`
	VisibleTestResults   []VisibleTestResult  `json:"visible_test_results"`
	InterviewerFeedback  string               `json:"interviewer_feedback"`
}

// RunnerEvaluateRequest is the JSON body sent to runner-python (same shape as run).
type RunnerEvaluateRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

// HintRequest is POST /api/hint. Evaluation must be the last run result from the runner.
type HintRequest struct {
	ProblemID            string               `json:"problem_id"`
	Code                 string               `json:"code"`
	Evaluation           StructuredEvaluation `json:"evaluation"`
	HintLevelRequested   *int                 `json:"hint_level_requested,omitempty"`
}

// HintResponse is POST /api/hint response.
type HintResponse struct {
	Hint                 string `json:"hint"`
	HintLevel            int    `json:"hint_level"`
	InterviewerFeedback  string `json:"interviewer_feedback"`
}

// SessionSaveRequest persists editor + hint history (local SQLite).
type SessionSaveRequest struct {
	ProblemID   string   `json:"problem_id"`
	Code        string   `json:"code"`
	HintHistory []string `json:"hint_history"`
}

// SessionState is stored and returned for a problem_id.
type SessionState struct {
	ProblemID   string   `json:"problem_id"`
	Code        string   `json:"code"`
	HintHistory []string `json:"hint_history"`
	UpdatedAt   string   `json:"updated_at"`
}

// Example is embedded problem content.
type Example struct {
	Input         string  `json:"input"`
	Output        string  `json:"output"`
	Explanation   *string `json:"explanation,omitempty"`
}

// Parameter describes the solution function signature.
type Parameter struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// ProblemSummary is GET /api/problems item.
type ProblemSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Difficulty   string `json:"difficulty"`
	FunctionName string `json:"function_name"`
}

// ProblemDetail is GET /api/problems/:id (no hidden test payloads).
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
