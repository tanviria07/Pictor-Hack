from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

ProblemStatus = Literal[
    "syntax_error",
    "runtime_error",
    "internal_error",
    "incomplete",
    "partial",
    "wrong",
    "correct",
]


class VisibleTestResult(BaseModel):
    index: int
    passed: bool
    label: Optional[str] = None


class StructuredEvaluation(BaseModel):
    """Full deterministic evaluation payload; visible_test_results included for a flat JSON shape."""

    status: ProblemStatus
    syntax_ok: bool
    function_found: bool
    signature_ok: bool
    passed_visible_tests: int
    total_visible_tests: int
    passed_hidden_tests: int
    total_hidden_tests: int
    error_type: Optional[str] = None
    error_message: Optional[str] = None
    failing_case_summary: Optional[str] = None
    likely_stage: str = ""
    feedback_targets: list[str] = Field(default_factory=list)
    visible_test_results: list[VisibleTestResult] = Field(default_factory=list)


class RunRequest(BaseModel):
    problem_id: str
    language: Literal["python"] = "python"
    code: str


class RunResponse(BaseModel):
    status: ProblemStatus
    evaluation: StructuredEvaluation
    visible_test_results: list[VisibleTestResult] = Field(default_factory=list)
    interviewer_feedback: str = ""


class StepwiseValidateRequest(BaseModel):
    problem_id: str
    code: str = ""


class StepwiseValidateResponse(BaseModel):
    available: bool
    correct_count: int
    total: int
    is_full_solution: bool
    first_failed_index: Optional[int] = None
    next_hint: str = ""
    final_explanation: str = ""
    expected_sentence: str = ""
    user_sentence: str = ""
    message: str = ""


class StepwiseGenerateRequest(BaseModel):
    problem_id: str
    overwrite: bool = False
    dry_run: bool = False
    force_fallback: bool = False


class StepwiseGenerateResponse(BaseModel):
    problem_id: str
    source: Literal["deepseek", "heuristic", "skipped"]
    skipped: bool = False
    skip_reason: Optional[str] = None
    sentences_count: int = 0
    solution_sentences: list[str] = Field(default_factory=list)
    hints_per_sentence: list[str] = Field(default_factory=list)
    final_explanation: str = ""
    written_paths: list[str] = Field(default_factory=list)


class ProblemMeta(BaseModel):
    id: str
    function_name: str
    execution_mode: str = "function"
    class_name: str = ""
    comparison: str = ""
    parameters: list[dict[str, Any]]
    methods: list[dict[str, Any]] = Field(default_factory=list)
    expected_return_type: str
    visible_tests: list[dict[str, Any]]
    hidden_tests: list[dict[str, Any]]
