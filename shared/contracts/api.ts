/**
 * Shared API contracts for Jose-Morinho AI (frontend ↔ backend).
 * Mirror structs live in backend-go/internal/api/types.go
 */

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
}

export interface VisibleTestResult {
  index: number;
  passed: boolean;
  label?: string;
}

export interface RunRequest {
  problem_id: string;
  language: "python";
  code: string;
}

export interface RunResponse {
  status: ProblemStatus;
  evaluation: StructuredEvaluation;
  visible_test_results: VisibleTestResult[];
  interviewer_feedback: string;
}

export interface HintRequest {
  problem_id: string;
  code: string;
  evaluation: StructuredEvaluation;
  hint_level_requested?: number;
}

export interface HintResponse {
  hint: string;
  hint_level: number;
  interviewer_feedback: string;
}

export interface SessionSaveRequest {
  problem_id: string;
  code: string;
  hint_history: string[];
}

export interface SessionState {
  problem_id: string;
  code: string;
  hint_history: string[];
  updated_at: string;
}

export interface ProblemSummary {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  function_name: string;
}

export interface ProblemDetail extends ProblemSummary {
  description: string;
  examples: { input: string; output: string; explanation?: string }[];
  constraints: string[];
  parameters: { name: string; type: string }[];
  expected_return_type: string;
}
