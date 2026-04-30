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
	ComplexityNote     string        `json:"complexity_note,omitempty"`
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
	Role      string `json:"role,omitempty"`
}

// RunResponse is returned to the frontend. Evaluation is unmodified from the runner;
// InterviewerFeedback may be rephrased by DeepSeek (wording only).
type RunResponse struct {
	Status              ProblemStatus        `json:"status"`
	Evaluation          StructuredEvaluation `json:"evaluation"`
	VisibleTestResults  []VisibleTestResult  `json:"visible_test_results"`
	InterviewerFeedback string               `json:"interviewer_feedback"`
	Trace               *InterviewTrace      `json:"trace,omitempty"`
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
	Role               string               `json:"role,omitempty"`
}

// HintResponse is POST /api/hint response (LLM or fallback).
type HintResponse struct {
	Feedback            string `json:"feedback"`
	Hint                string `json:"hint"`
	NextFocus           string `json:"next_focus"`
	HintLevel           int    `json:"hint_level"`
	InterviewerFeedback string `json:"interviewer_feedback"` // Combined note for legacy clients
}

// InlineHintRequest is POST /api/inline-hint for real-time line‑by‑line feedback.
type InlineHintRequest struct {
	ProblemID    string `json:"problem_id"`
	Code         string `json:"code"`
	CursorLine   int    `json:"cursor_line"`
	CursorColumn int    `json:"cursor_column"`
	Role         string `json:"role,omitempty"`
}

// InlineHintResponse is returned by POST /api/inline-hint.
type InlineHintResponse struct {
	LineIssue       string `json:"line_issue"`
	NextSteps       string `json:"next_steps"`
	ProblemRedirect string `json:"problem_redirect"`
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

type AuthRequest struct {
	Email      string `json:"email,omitempty"`
	Username   string `json:"username,omitempty"`
	Identifier string `json:"identifier,omitempty"`
	Password   string `json:"password"`
}

type AuthUser struct {
	ID            int64  `json:"id"`
	Email         string `json:"email"`
	Username      string `json:"username"`
	EmailVerified bool   `json:"email_verified"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type AuthResponse struct {
	User AuthUser `json:"user"`
}

type PendingVerificationResponse struct {
	Status    string `json:"status"`
	Email     string `json:"email"`
	ExpiresAt string `json:"expires_at"`
}

type VerifyEmailRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

type ResendOTPRequest struct {
	Email string `json:"email"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"new_password"`
}

type CoachRequest struct {
	SystemPrompt string `json:"system_prompt"`
	Context      string `json:"context"`
	Role         string `json:"role,omitempty"`
	Transcript   string `json:"transcript"`
}

type CoachResponse struct {
	Reply string `json:"reply"`
}

type UserProgress struct {
	UserID        int64  `json:"-"`
	ProblemID     string `json:"problem_id"`
	Track         string `json:"track"`
	Category      string `json:"category"`
	Status        string `json:"status"`
	AttemptCount  int    `json:"attempt_count"`
	BestStatus    string `json:"best_status"`
	LastCode      string `json:"last_code,omitempty"`
	LastAttemptAt string `json:"last_attempt_at,omitempty"`
	SolvedAt      string `json:"solved_at,omitempty"`
	HintCount     int    `json:"hint_count"`
	RoleMode      string `json:"role_mode,omitempty"`
}

type UserAttempt struct {
	ID            int64  `json:"id"`
	UserID        int64  `json:"-"`
	ProblemID     string `json:"problem_id"`
	SubmittedCode string `json:"submitted_code,omitempty"`
	Status        string `json:"status"`
	PassedVisible int    `json:"passed_visible"`
	TotalVisible  int    `json:"total_visible"`
	PassedHidden  int    `json:"passed_hidden"`
	TotalHidden   int    `json:"total_hidden"`
	RuntimeError  string `json:"runtime_error,omitempty"`
	CreatedAt     string `json:"created_at"`
	ProblemTitle  string `json:"problem_title,omitempty"`
	Category      string `json:"category,omitempty"`
	Track         string `json:"track,omitempty"`
}

type ProgressBucket struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Solved int    `json:"solved"`
	Total  int    `json:"total"`
}

type WeakArea struct {
	Category               string `json:"category"`
	WrongOrPartialAttempts int    `json:"wrong_or_partial_attempts"`
}

type RecommendedProblem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Track      string `json:"track"`
	Category   string `json:"category"`
	Difficulty string `json:"difficulty"`
	Reason     string `json:"reason"`
}

type RoleModeActivity struct {
	Role         string `json:"role"`
	AttemptCount int    `json:"attempt_count"`
}

type DashboardResponse struct {
	SolvedCount          int                  `json:"solved_count"`
	TotalProblems        int                  `json:"total_problems"`
	ProgressByTrack      []ProgressBucket     `json:"progress_by_track"`
	ProgressByCategory   []ProgressBucket     `json:"progress_by_category"`
	RecentAttempts       []UserAttempt        `json:"recent_attempts"`
	WeakAreas            []WeakArea           `json:"weak_areas"`
	RecommendedProblems  []RecommendedProblem `json:"recommended_problems"`
	RoleModeSummary      []RoleModeActivity   `json:"role_mode_summary"`
	PracticeStreakDays   int                  `json:"practice_streak_days"`
	PracticeActivityDays int                  `json:"practice_activity_days"`
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

// Rubric describes rubric-based practice for non-coding cloud items.
type Rubric struct {
	Categories           []string `json:"categories,omitempty"`
	StrongAnswerIncludes []string `json:"strong_answer_includes,omitempty"`
	CommonGaps           []string `json:"common_gaps,omitempty"`
}

// CompanyTrackTag describes unofficial company-track placement metadata.
type CompanyTrackTag struct {
	CompanyID        string `json:"company_id"`
	Priority         string `json:"priority"`
	Reason           string `json:"reason"`
	RecommendedOrder int    `json:"recommended_order"`
}

// ProblemSummary is GET /api/problems item.
type ProblemSummary struct {
	ID               string            `json:"id"`
	Title            string            `json:"title"`
	Difficulty       string            `json:"difficulty"`
	Category         string            `json:"category"`
	CategoryTitle    string            `json:"category_title"`
	FunctionName     string            `json:"function_name"`
	Slug             string            `json:"slug,omitempty"`
	TrackID          string            `json:"track_id,omitempty"`
	TrackTitle       string            `json:"track_title,omitempty"`
	SkillTags        []string          `json:"skill_tags,omitempty"`
	Tags             []string          `json:"tags,omitempty"`
	CompanyTags      []string          `json:"company_tags,omitempty"`
	CompanyTrackTags []CompanyTrackTag `json:"company_track_tags,omitempty"`
	ProblemType      string            `json:"problem_type,omitempty"`
}

// ProblemDetail is GET /api/problems/:id (no hidden test payloads).
type ProblemDetail struct {
	ID                 string            `json:"id"`
	Title              string            `json:"title"`
	Difficulty         string            `json:"difficulty"`
	Category           string            `json:"category"`
	CategoryTitle      string            `json:"category_title"`
	Description        string            `json:"description"`
	Examples           []Example         `json:"examples"`
	Constraints        []string          `json:"constraints"`
	FunctionName       string            `json:"function_name"`
	ExecutionMode      string            `json:"execution_mode,omitempty"`
	ClassName          string            `json:"class_name,omitempty"`
	StarterCode        string            `json:"starter_code,omitempty"`
	Parameters         []Parameter       `json:"parameters"`
	ExpectedReturnType string            `json:"expected_return_type"`
	VisibleTestCount   int               `json:"visible_test_count"`
	HiddenTestCount    int               `json:"hidden_test_count"`
	Slug               string            `json:"slug,omitempty"`
	TrackID            string            `json:"track_id,omitempty"`
	TrackTitle         string            `json:"track_title,omitempty"`
	SectionDescription string            `json:"section_description,omitempty"`
	SkillTags          []string          `json:"skill_tags,omitempty"`
	Tags               []string          `json:"tags,omitempty"`
	CompanyTags        []string          `json:"company_tags,omitempty"`
	CompanyTrackTags   []CompanyTrackTag `json:"company_track_tags,omitempty"`
	StepwiseAvailable  bool              `json:"stepwise_available,omitempty"`
	StepwiseTotal      int               `json:"stepwise_total,omitempty"`
	ProblemType        string            `json:"problem_type,omitempty"`
	Prompt             string            `json:"prompt,omitempty"`
	Rubric             *Rubric           `json:"rubric,omitempty"`
	SampleAnswer       string            `json:"sample_answer,omitempty"`
}

// StepwiseValidateRequest is POST /api/validate. The runner splits the code
// into sentences and compares them left-to-right against solution_sentences.
type StepwiseValidateRequest struct {
	ProblemID string `json:"problem_id"`
	Code      string `json:"code"`
}

// StepwiseValidateResponse mirrors the runner's /validate response.
// Correctness decisions are owned by the runner; this API does not rejudge.
type StepwiseValidateResponse struct {
	Available        bool   `json:"available"`
	CorrectCount     int    `json:"correct_count"`
	Total            int    `json:"total"`
	IsFullSolution   bool   `json:"is_full_solution"`
	FirstFailedIndex *int   `json:"first_failed_index,omitempty"`
	NextHint         string `json:"next_hint"`
	FinalExplanation string `json:"final_explanation"`
	ExpectedSentence string `json:"expected_sentence"`
	UserSentence     string `json:"user_sentence"`
	Message          string `json:"message"`
}

// StepwiseGenerateRequest is POST /api/generate-stepwise. Admin/tooling flow
// that asks the Python runner to synthesize (and persist) scaffold data via
// DeepSeek. The runner performs all writes; this API is transport-only.
type StepwiseGenerateRequest struct {
	ProblemID     string `json:"problem_id"`
	Overwrite     bool   `json:"overwrite,omitempty"`
	DryRun        bool   `json:"dry_run,omitempty"`
	ForceFallback bool   `json:"force_fallback,omitempty"`
}

// StepwiseGenerateResponse mirrors the runner's /generate-stepwise response.
type StepwiseGenerateResponse struct {
	ProblemID         string   `json:"problem_id"`
	Source            string   `json:"source"`
	Skipped           bool     `json:"skipped"`
	SkipReason        string   `json:"skip_reason,omitempty"`
	SentencesCount    int      `json:"sentences_count"`
	SolutionSentences []string `json:"solution_sentences"`
	HintsPerSentence  []string `json:"hints_per_sentence"`
	FinalExplanation  string   `json:"final_explanation"`
	WrittenPaths      []string `json:"written_paths"`
}
