/**
 * Shared API contracts for Kitkode (frontend <-> backend).
 * Mirror structs live in backend-go/internal/dto/dto.go.
 *
 * @typedef {"syntax_error" | "runtime_error" | "internal_error" | "incomplete" | "partial" | "wrong" | "correct"} ProblemStatus
 *
 * @typedef {Object} VisibleTestResult
 * @property {number} index
 * @property {boolean} passed
 * @property {string=} label
 *
 * @typedef {Object} StructuredEvaluation
 * @property {ProblemStatus} status
 * @property {boolean} syntax_ok
 * @property {boolean} function_found
 * @property {boolean} signature_ok
 * @property {number} passed_visible_tests
 * @property {number} total_visible_tests
 * @property {number} passed_hidden_tests
 * @property {number} total_hidden_tests
 * @property {string | null} error_type
 * @property {string | null} error_message
 * @property {string | null} failing_case_summary
 * @property {string} likely_stage
 * @property {string[]} feedback_targets
 * @property {VisibleTestResult[]=} visible_test_results Duplicates the top-level run response field.
 *
 * @typedef {Object} RunRequest
 * @property {string} problem_id
 * @property {"python"} language
 * @property {string} code
 *
 * @typedef {Object} RunResponse
 * @property {ProblemStatus} status
 * @property {StructuredEvaluation} evaluation
 * @property {VisibleTestResult[]} visible_test_results
 * @property {string} interviewer_feedback
 *
 * @typedef {Object} HintRequest
 * @property {string} problem_id
 * @property {string} code
 * @property {StructuredEvaluation} evaluation
 * @property {number=} hint_level_requested
 *
 * @typedef {Object} HintResponse
 * @property {string} feedback
 * @property {string} hint
 * @property {string} next_focus
 * @property {number} hint_level
 * @property {string} interviewer_feedback
 *
 * @typedef {Object} SessionSaveRequest
 * @property {string} problem_id
 * @property {string} code
 * @property {string[]} hint_history
 *
 * @typedef {Object} SessionState
 * @property {string} problem_id
 * @property {string} code
 * @property {string[]} hint_history
 * @property {string} updated_at
 *
 * @typedef {Object} AuthUser
 * @property {number} id
 * @property {string} email
 * @property {string} username
 * @property {boolean} email_verified
 * @property {string} created_at
 * @property {string} updated_at
 *
 * @typedef {Object} AuthResponse
 * @property {AuthUser} user
 *
 * @typedef {Object} SignupRequest
 * @property {string} email
 * @property {string} username
 * @property {string} password
 *
 * @typedef {Object} PendingVerificationResponse
 * @property {"pending_verification"} status
 * @property {string} email
 * @property {string} expires_at
 *
 * @typedef {Object} LoginRequest
 * @property {string} identifier Email or username.
 * @property {string} password
 *
 * @typedef {Object} VerifyEmailRequest
 * @property {string} email
 * @property {string} otp Six numeric digits.
 *
 * @typedef {AuthResponse} VerifyEmailResponse
 *
 * @typedef {Object} ResendOTPRequest
 * @property {string} email
 *
 * @typedef {PendingVerificationResponse} ResendOTPResponse
 *
 * @typedef {Object} ForgotPasswordRequest
 * @property {string} email
 *
 * @typedef {Object} ForgotPasswordResponse
 * @property {boolean} ok
 *
 * @typedef {Object} ResetPasswordRequest
 * @property {string} token
 * @property {string} new_password
 *
 * @typedef {Object} ResetPasswordResponse
 * @property {boolean} ok
 *
 * @typedef {Object} ProblemSummary
 * @property {string} id
 * @property {string} title
 * @property {"easy" | "medium" | "hard"} difficulty
 * @property {string} function_name
 * @property {string[]=} company_tags Curated, unofficial company practice filters.
 * @property {Array<{ company_id: string, priority: "core" | "high" | "medium" | "bonus", reason: string, recommended_order: number }>=} company_track_tags Rich unofficial company-track metadata.
 *
 * @typedef {ProblemSummary & {
 *   description: string,
 *   examples: Array<{ input: string, output: string, explanation?: string }>,
 *   constraints: string[],
 *   parameters: Array<{ name: string, type: string }>,
 *   expected_return_type: string
 * }} ProblemDetail
 */

export {};
