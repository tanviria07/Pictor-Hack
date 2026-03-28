from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.evaluator import evaluate_with_problem_id
from app.feedback import deterministic_interviewer_note
from app.models import RunRequest, RunResponse, StructuredEvaluation
from app.problems import load_problem, problem_path

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="Pictor Hack Python Runner",
    description="Pictor Hack Python execution and evaluation service.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("RUNNER_CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _problem_test_counts(problem_id: str) -> tuple[int, int]:
    """Used when subprocess fails so error payloads still report expected test totals."""
    try:
        p = load_problem(problem_id)
        return len(p.get("visible_tests", [])), len(p.get("hidden_tests", []))
    except OSError:
        return 0, 0


def _run_in_subprocess(req: RunRequest) -> RunResponse:
    """
    Execute evaluation in a child process with a hard timeout.

    MVP: separates wall-clock from the API process and absorbs hard crashes.
    Still not a security boundary - combine with OS-level sandboxing in production.
    """
    payload = {"code": req.code, "problem_id": req.problem_id}
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
    tv, th = _problem_test_counts(req.problem_id)
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "app.run_job"],
            input=json.dumps(payload).encode("utf-8"),
            capture_output=True,
            timeout=float(os.environ.get("RUNNER_SUBPROCESS_TIMEOUT_SEC", "6")),
            env=env,
            cwd=str(ROOT),
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

    try:
        data = json.loads(proc.stdout.decode("utf-8"))
        return RunResponse.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=tv,
            passed_hidden_tests=0,
            total_hidden_tests=th,
            error_type="RunnerParseError",
            error_message=str(exc),
            failing_case_summary=None,
            likely_stage="internal",
            feedback_targets=["Internal runner issue - try again after simplifying your submission."],
            visible_test_results=[],
        )
        return RunResponse(
            status="runtime_error",
            evaluation=ev,
            visible_test_results=[],
            interviewer_feedback=deterministic_interviewer_note(ev),
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/evaluate", response_model=RunResponse)
def evaluate(req: RunRequest) -> RunResponse:
    if not problem_path(req.problem_id).exists():
        raise HTTPException(status_code=404, detail="Unknown problem_id.")
    if req.language != "python":
        raise HTTPException(status_code=400, detail="Only python is supported in MVP.")
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
