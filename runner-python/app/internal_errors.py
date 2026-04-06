"""Structured responses for platform/runner issues (not user code failures)."""

from __future__ import annotations

import json

from pydantic import ValidationError

from app.feedback import deterministic_interviewer_note
from app.models import RunResponse, StructuredEvaluation


def platform_error_response(
    *,
    problem_id: str,
    visible_count: int,
    hidden_count: int,
    error_type: str,
    error_message: str,
) -> RunResponse:
    """User-facing internal_error: do not blame the candidate's solution."""
    ev = StructuredEvaluation(
        status="internal_error",
        syntax_ok=True,
        function_found=False,
        signature_ok=False,
        passed_visible_tests=0,
        total_visible_tests=visible_count,
        passed_hidden_tests=0,
        total_hidden_tests=hidden_count,
        error_type=error_type,
        error_message=error_message,
        failing_case_summary=None,
        likely_stage="platform",
        feedback_targets=[
            "Internal platform error while loading this problem. Your code may be correct.",
        ],
        visible_test_results=[],
    )
    return RunResponse(
        status="internal_error",
        evaluation=ev,
        visible_test_results=[],
        interviewer_feedback=deterministic_interviewer_note(ev),
    )


def parse_subprocess_stdout_json(
    stdout: bytes,
    *,
    problem_id: str,
    visible_count: int,
    hidden_count: int,
) -> RunResponse:
    """
    Decode child JSON as UTF-8 and validate. Maps decode/parse failures to internal_error.
    """
    try:
        text = stdout.decode("utf-8")
    except UnicodeDecodeError as e:
        return platform_error_response(
            problem_id=problem_id,
            visible_count=visible_count,
            hidden_count=hidden_count,
            error_type="RunnerStdoutDecodeError",
            error_message=(
                f"Runner subprocess output was not valid UTF-8 ({e}). "
                "This usually indicates a Windows console encoding mismatch; report to maintainers."
            ),
        )

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return platform_error_response(
            problem_id=problem_id,
            visible_count=visible_count,
            hidden_count=hidden_count,
            error_type="RunnerJsonParseError",
            error_message=str(e),
        )

    try:
        return RunResponse.model_validate(data)
    except ValidationError as e:
        return platform_error_response(
            problem_id=problem_id,
            visible_count=visible_count,
            hidden_count=hidden_count,
            error_type="RunnerResponseValidationError",
            error_message=str(e),
        )
