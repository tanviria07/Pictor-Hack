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
 * @typedef {Object} ProblemSummary
 * @property {string} id
 * @property {string} title
 * @property {"easy" | "medium" | "hard"} difficulty
 * @property {string} function_name
 * @property {string[]=} company_tags Curated, unofficial company practice filters.
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
