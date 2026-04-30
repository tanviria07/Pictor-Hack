"""Local code evaluation used by the FastAPI runner."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from app.evaluator import evaluate_with_problem_id
from app.feedback import deterministic_interviewer_note
from app.internal_errors import parse_subprocess_stdout_json
from app.models import RunRequest, RunResponse, StructuredEvaluation
from app.problems import ProblemLoadError, load_problem, problem_path

ROOT = Path(__file__).resolve().parent.parent


def _problem_test_counts(problem_id: str) -> tuple[int, int]:
    try:
        p = load_problem(problem_id)
        return len(p.get("visible_tests", [])), len(p.get("hidden_tests", []))
    except (OSError, ProblemLoadError, FileNotFoundError):
        return 0, 0


def run_user_code(req: RunRequest) -> RunResponse:
    """
    Evaluate user code for a problem.
    """
    if not problem_path(req.problem_id).exists():
        raise FileNotFoundError(f"Unknown problem_id: {req.problem_id}")
    if req.language != "python":
        raise ValueError("Only python is supported in MVP.")

    use_sub = os.environ.get("RUNNER_USE_SUBPROCESS", "1") == "1"
    if use_sub:
        return _run_in_subprocess(req)
    ev = evaluate_with_problem_id(req.code, req.problem_id)
    return RunResponse(
        status=ev.status,
        evaluation=ev,
        visible_test_results=ev.visible_test_results,
        interviewer_feedback=deterministic_interviewer_note(ev),
    )


def _run_in_subprocess(req: RunRequest) -> RunResponse:
    payload = {"code": req.code, "problem_id": req.problem_id}
    env = os.environ.copy()
    # Force UTF-8 stdio in the child (Windows cp1252 stdout breaks parent's UTF-8 decode).
    env.setdefault("PYTHONUTF8", "1")
    env.setdefault("PYTHONIOENCODING", "utf-8")
    tv, th = _problem_test_counts(req.problem_id)
    try:
        with tempfile.TemporaryDirectory(prefix="kitkode-runner-") as temp_code_dir:
            # Keep only the user temp directory on PYTHONPATH so evaluated code cannot
            # discover or import runner internals through the environment.
            env["PYTHONPATH"] = temp_code_dir
            proc = subprocess.run(
                [sys.executable, str(ROOT / "app" / "run_job.py")],
                input=json.dumps(payload).encode("utf-8"),
                capture_output=True,
                timeout=float(os.environ.get("RUNNER_SUBPROCESS_TIMEOUT_SEC", "6")),
                env=env,
                cwd=temp_code_dir,
            )
    except subprocess.TimeoutExpired:
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=True,
            signature_ok=True,
            passed_visible_tests=0,
            total_visible_tests=tv,
            passed_hidden_tests=0,
            total_hidden_tests=th,
            error_type="Timeout",
            error_message="Execution exceeded the sandbox time limit.",
            failing_case_summary=None,
            likely_stage="timeout",
            feedback_targets=[
                "Reduce complexity or infinite loops; aim for linear passes where possible.",
            ],
            visible_test_results=[],
        )
        return RunResponse(
            status="runtime_error",
            evaluation=ev,
            visible_test_results=[],
            interviewer_feedback=deterministic_interviewer_note(ev),
        )

    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", errors="replace")[:2000]
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=tv,
            passed_hidden_tests=0,
            total_hidden_tests=th,
            error_type="SubprocessError",
            error_message=err or "Child process failed.",
            failing_case_summary=None,
            likely_stage="subprocess_crash",
            feedback_targets=["The runner could not finish; check for crashes in your code path."],
            visible_test_results=[],
        )
        return RunResponse(
            status="runtime_error",
            evaluation=ev,
            visible_test_results=[],
            interviewer_feedback=deterministic_interviewer_note(ev),
        )

    return parse_subprocess_stdout_json(
        proc.stdout,
        problem_id=req.problem_id,
        visible_count=tv,
        hidden_count=th,
    )
