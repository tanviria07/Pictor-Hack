// Package dto defines JSON transport types for the REST API.
// Correctness fields (StructuredEvaluation, status, test counts) originate from
// the Python runner only; this package does not implement judging logic.
package dto

// ProblemStatus is mirrored from the runner's deterministic evaluation.
type ProblemStatus string

const (
	StatusSyntaxError   ProblemStatus = "syntax_error"
	StatusRuntimeError  ProblemStatus = "runtime_error"
	StatusInternalError ProblemStatus = "internal_error"
	StatusIncomplete    ProblemStatus = "incomplete"
	StatusPartial       ProblemStatus = "partial"
	StatusWrong         ProblemStatus = "wrong"
	StatusCorrect       ProblemStatus = "correct"
)

// StructuredEvaluation is produced exclusively by the Python runner.
type StructuredEvaluation struct {
	Status             ProblemStatus `json:"status"`
	SyntaxOK           bool          `json:"syntax_ok"`
	FunctionFound      bool          `json:"function_found"`
	SignatureOK        bool          `json:"signature_ok"`
	PassedVisibleTests int           `json:"passed_visible_tests"`
	TotalVisibleTests  int           `json:"total_visible_tests"`
	PassedHiddenTests  int           `json:"passed_hidden_tests"`
	TotalHiddenTests   int           `json:"total_hidden_tests"`
	ErrorType          *string       `json:"error_type"`
	ErrorMessage       *string       `json:"error_message"`
	FailingCaseSummary *string       `json:"failing_case_summary"`
	LikelyStage        string        `json:"likely_stage"`
	FeedbackTargets    []string      `json:"feedback_targets"`
	// Also embedded in evaluation JSON by the runner (duplicates top-level visible_test_results).
	VisibleTestResults []VisibleTestResult `json:"visible_test_results,omitempty"`
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
	Status              ProblemStatus        `json:"status"`
	Evaluation          StructuredEvaluation `json:"evaluation"`
	VisibleTestResults  []VisibleTestResult  `json:"visible_test_results"`
	InterviewerFeedback string               `json:"interviewer_feedback"`
}

// RunnerEvaluateRequest is the JSON body sent to runner-python (same shape as run).
type RunnerEvaluateRequest struct {
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

// HintRequest is POST /api/hint. Evaluation must be the last run result from the runner.
type HintRequest struct {
	ProblemID          string               `json:"problem_id"`
	Code               string               `json:"code"`
	Evaluation         StructuredEvaluation `json:"evaluation"`
	HintLevelRequested *int                 `json:"hint_level_requested,omitempty"`
}

// HintResponse is POST /api/hint response (LLM or fallback).
type HintResponse struct {
	Feedback            string `json:"feedback"`
	Hint                string `json:"hint"`
	NextFocus           string `json:"next_focus"`
	HintLevel           int    `json:"hint_level"`
	InterviewerFeedback string `json:"interviewer_feedback"` // Combined note for legacy clients
}

// PracticeStatus is coarse progress for a problem (no auth; optional server mirror).
type PracticeStatus string

const (
	PracticeNotStarted PracticeStatus = "not_started"
	PracticeInProgress PracticeStatus = "in_progress"
	PracticeSolved     PracticeStatus = "solved"
)

// SessionSaveRequest persists editor + hint history (local SQLite).
type SessionSaveRequest struct {
	ProblemID      string         `json:"problem_id"`
	Code           string         `json:"code"`
	HintHistory    []string       `json:"hint_history"`
	PracticeStatus PracticeStatus `json:"practice_status,omitempty"`
}

// SessionState is stored and returned for a problem_id.
type SessionState struct {
	ProblemID      string         `json:"problem_id"`
	Code           string         `json:"code"`
	HintHistory    []string       `json:"hint_history"`
	PracticeStatus PracticeStatus `json:"practice_status"`
	UpdatedAt      string         `json:"updated_at"`
}

// Example is embedded problem content.
type Example struct {
	Input       string  `json:"input"`
	Output      string  `json:"output"`
	Explanation *string `json:"explanation,omitempty"`
}

// Parameter describes the solution function signature.
type Parameter struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// CategorySummary is GET /api/categories item.
type CategorySummary struct {
	ID                 string `json:"id"`
	Title              string `json:"title"`
	ProblemCount       int    `json:"problem_count"`
	TrackID            string `json:"track_id,omitempty"`
	TrackTitle         string `json:"track_title,omitempty"`
	SectionDescription string `json:"section_description,omitempty"`
}

// ProblemSummary is GET /api/problems item.
type ProblemSummary struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Difficulty    string   `json:"difficulty"`
	Category      string   `json:"category"`
	CategoryTitle string   `json:"category_title"`
	FunctionName  string   `json:"function_name"`
	Slug          string   `json:"slug,omitempty"`
	TrackID       string   `json:"track_id,omitempty"`
	TrackTitle    string   `json:"track_title,omitempty"`
	SkillTags     []string `json:"skill_tags,omitempty"`
	Tags          []string `json:"tags,omitempty"`
}

// ProblemDetail is GET /api/problems/:id (no hidden test payloads).
type ProblemDetail struct {
	ID                 string      `json:"id"`
	Title              string      `json:"title"`
	Difficulty         string      `json:"difficulty"`
	Category           string      `json:"category"`
	CategoryTitle      string      `json:"category_title"`
	Description        string      `json:"description"`
	Examples           []Example   `json:"examples"`
	Constraints        []string    `json:"constraints"`
	FunctionName       string      `json:"function_name"`
	ExecutionMode      string      `json:"execution_mode,omitempty"`
	ClassName          string      `json:"class_name,omitempty"`
	StarterCode        string      `json:"starter_code,omitempty"`
	Parameters         []Parameter `json:"parameters"`
	ExpectedReturnType string      `json:"expected_return_type"`
	VisibleTestCount   int         `json:"visible_test_count"`
	HiddenTestCount    int         `json:"hidden_test_count"`
	Slug               string      `json:"slug,omitempty"`
	TrackID            string      `json:"track_id,omitempty"`
	TrackTitle         string      `json:"track_title,omitempty"`
	SectionDescription string      `json:"section_description,omitempty"`
	SkillTags          []string    `json:"skill_tags,omitempty"`
	Tags               []string    `json:"tags,omitempty"`
}

// RunJobSubmitResponse is returned from POST /api/run/jobs (async queue).
type RunJobSubmitResponse struct {
	JobID  string `json:"job_id"`
	Status string `json:"status"`
}

// RunJobPollResponse is returned from GET /api/run/jobs/:job_id while polling.
type RunJobPollResponse struct {
	JobID  string       `json:"job_id"`
	Status string       `json:"status"`
	Error  *string      `json:"error,omitempty"`
	Result *RunResponse `json:"result,omitempty"`
}
