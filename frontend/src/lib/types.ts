export type ProblemStatus =
  | "syntax_error"
  | "runtime_error"
  | "internal_error"
  | "incomplete"
  | "partial"
  | "wrong"
  | "correct";

export interface StructuredEvaluation {
  status: ProblemStatus;
  syntax_ok: boolean;
  function_found: boolean;
  signature_ok: boolean;
  passed_visible_tests: number;
  total_visible_tests: number;
  passed_hidden_tests: number;
  total_hidden_tests: number;
  error_type: string | null;
  error_message: string | null;
  failing_case_summary: string | null;
  likely_stage: string;
  feedback_targets: string[];
  visible_test_results?: VisibleTestResult[];
}

export interface VisibleTestResult {
  index: number;
  passed: boolean;
  label?: string;
}

export interface RunResponse {
  status: ProblemStatus;
  evaluation: StructuredEvaluation;
  visible_test_results: VisibleTestResult[];
  interviewer_feedback: string;
}

/** GET /api/run/jobs/:id (async poll) */
export interface RunJobPollResponse {
  job_id: string;
  status: string;
  error?: string;
  result?: RunResponse;
}

/** Curated curriculum bucket (NeetCode-style + PreCode 100). */
export interface CategorySummary {
  id: string;
  title: string;
  problem_count: number;
  track_id?: string;
  track_title?: string;
  section_description?: string;
}

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
  category: string;
  category_title: string;
  function_name: string;
  slug?: string;
  track_id?: string;
  track_title?: string;
  skill_tags?: string[];
  tags?: string[];
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  execution_mode?: string;
  class_name?: string;
  starter_code?: string;
  parameters: { name: string; type: string }[];
  expected_return_type: string;
  visible_test_count: number;
  hidden_test_count: number;
  section_description?: string;
  stepwise_available?: boolean;
  stepwise_total?: number;
}

/** Stepwise (sentence-by-sentence) validation response. */
export interface StepwiseValidateResponse {
  available: boolean;
  correct_count: number;
  total: number;
  is_full_solution: boolean;
  first_failed_index?: number | null;
  next_hint: string;
  final_explanation: string;
  expected_sentence: string;
  user_sentence: string;
  message: string;
}

export interface HintResponse {
  feedback: string;
  hint: string;
  next_focus: string;
  hint_level: number;
  interviewer_feedback: string;
}

/** Local / session practice progress (not runner evaluation status). */
export type PracticeProgress = "not_started" | "in_progress" | "solved";

export interface InlineHintRequest {
  problem_id: string;
  code: string;
  cursor_line: number;
  cursor_column: number;
}

export interface InlineHintResponse {
  line_issue: string;
  next_steps: string;
  problem_redirect: string;
}

export interface SessionPayload {
  problem_id: string;
  code: string;
  hint_history: string[];
  practice_status?: PracticeProgress;
}
