from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

ProblemStatus = Literal[
    "syntax_error",
    "runtime_error",
    "incomplete",
    "partial",
    "wrong",
    "correct",
]


class StructuredEvaluation(BaseModel):
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


class RunRequest(BaseModel):
    problem_id: str
    language: Literal["python"] = "python"
    code: str


class VisibleTestResult(BaseModel):
    index: int
    passed: bool
    label: Optional[str] = None


class RunResponse(BaseModel):
    status: ProblemStatus
    evaluation: StructuredEvaluation
    visible_test_results: list[VisibleTestResult]
    interviewer_feedback: str = ""


class ProblemMeta(BaseModel):
    id: str
    function_name: str
    parameters: list[dict[str, Any]]
    expected_return_type: str
    visible_tests: list[dict[str, Any]]
    hidden_tests: list[dict[str, Any]]
