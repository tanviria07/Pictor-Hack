export type ProblemStatus =
  | "syntax_error"
  | "runtime_error"
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

/** Curated curriculum bucket (NeetCode-style). */
export interface CategorySummary {
  id: string;
  title: string;
  problem_count: number;
}

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: string;
  category: string;
  category_title: string;
  function_name: string;
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  parameters: { name: string; type: string }[];
  expected_return_type: string;
  visible_test_count: number;
  hidden_test_count: number;
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

export interface SessionPayload {
  problem_id: string;
  code: string;
  hint_history: string[];
  practice_status?: PracticeProgress;
}
