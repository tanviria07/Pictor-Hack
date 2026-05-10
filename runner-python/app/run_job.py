"""
Entry point executed in a subprocess for timeout isolation.

Reads JSON from stdin, or from the file path in argv[1].
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

RUNNER_ROOT = Path(__file__).resolve().parents[1]
RESOURCE_LIMIT_MESSAGE = "Your code exceeded memory/CPU limits"
MEMORY_LIMIT_BYTES = 512 * 1024 * 1024
CPU_LIMIT_SECONDS = 5

logger = logging.getLogger(__name__)


def _apply_user_code_limits() -> None:
    sys.setrecursionlimit(1000)
    if os.name == "nt":
        logger.warning("resource limits are not available on Windows; skipping RLIMIT_AS/RLIMIT_CPU")
        return
    try:
        import resource
    except ImportError:
        logger.warning("resource module is not available; skipping RLIMIT_AS/RLIMIT_CPU")
        return
    resource.setrlimit(resource.RLIMIT_AS, (MEMORY_LIMIT_BYTES, MEMORY_LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_LIMIT_SECONDS, CPU_LIMIT_SECONDS))


def _resource_limit_response(problem_id: str):
    from app.feedback import deterministic_interviewer_note
    from app.models import RunResponse, StructuredEvaluation
    from app.problems import load_problem

    try:
        problem = load_problem(problem_id)
        visible_count = len(problem.get("visible_tests", []))
        hidden_count = len(problem.get("hidden_tests", []))
    except Exception:
        visible_count = 0
        hidden_count = 0

    ev = StructuredEvaluation(
        status="runtime_error",
        syntax_ok=True,
        function_found=True,
        signature_ok=True,
        passed_visible_tests=0,
        total_visible_tests=visible_count,
        passed_hidden_tests=0,
        total_hidden_tests=hidden_count,
        error_type="ResourceLimitExceeded",
        error_message=RESOURCE_LIMIT_MESSAGE,
        failing_case_summary=None,
        likely_stage="resource_limit",
        feedback_targets=["Reduce memory use, avoid infinite loops, and keep recursion shallow."],
        visible_test_results=[],
    )
    return RunResponse(
        status="runtime_error",
        evaluation=ev,
        visible_test_results=[],
        interviewer_feedback=deterministic_interviewer_note(ev),
    )


def main() -> None:
    if len(sys.argv) > 1:
        raw = Path(sys.argv[1]).read_bytes()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as e:
            sys.stderr.write(f"payload file is not UTF-8: {e}\n")
            raise SystemExit(2) from e
    else:
        raw = sys.stdin.buffer.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as e:
            sys.stderr.write(f"stdin is not valid UTF-8: {e}\n")
            raise SystemExit(2) from e
    code = payload["code"]
    problem_id = payload["problem_id"]

    added_runner_root = False
    runner_root = str(RUNNER_ROOT)
    if runner_root not in sys.path:
        sys.path.insert(0, runner_root)
        added_runner_root = True

    from app.evaluator import evaluate_with_problem_id
    from app.feedback import deterministic_interviewer_note
    from app.models import RunResponse

    if added_runner_root:
        # Drop the internal path before user code is evaluated.
        sys.path = [p for p in sys.path if p != runner_root]

    _apply_user_code_limits()
    try:
        ev = evaluate_with_problem_id(code, problem_id)
        note = deterministic_interviewer_note(ev)
        resp = RunResponse(
            status=ev.status,
            evaluation=ev,
            visible_test_results=ev.visible_test_results,
            interviewer_feedback=note,
        )
    except (MemoryError, RecursionError):
        resp = _resource_limit_response(problem_id)
    # Binary stdout so the parent always receives UTF-8 bytes (not cp1252 on Windows).
    sys.stdout.buffer.write(resp.model_dump_json().encode("utf-8"))
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
