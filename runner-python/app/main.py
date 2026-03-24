from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.evaluator import deterministic_interviewer_note, evaluate_with_problem_id
from app.models import RunRequest, RunResponse, StructuredEvaluation, VisibleTestResult

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Jose-Morinho AI — Python Runner", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("RUNNER_CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _run_in_subprocess(req: RunRequest) -> RunResponse:
    """
    Execute evaluation in a child process with a hard timeout.

    Production note: still combine with seccomp/cgroups/containers for real isolation.
    """
    payload = {"code": req.code, "problem_id": req.problem_id}
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ROOT)
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
            total_visible_tests=0,
            passed_hidden_tests=0,
            total_hidden_tests=0,
            error_type="Timeout",
            error_message="Execution exceeded the sandbox time limit.",
            failing_case_summary=None,
            likely_stage="timeout",
            feedback_targets=["Reduce complexity or infinite loops; aim for linear passes where possible."],
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
            total_visible_tests=0,
            passed_hidden_tests=0,
            total_hidden_tests=0,
            error_type="SubprocessError",
            error_message=err or "Child process failed.",
            failing_case_summary=None,
            likely_stage="subprocess_crash",
            feedback_targets=["The runner could not finish; check for crashes in your code path."],
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
            total_visible_tests=0,
            passed_hidden_tests=0,
            total_hidden_tests=0,
            error_type="RunnerParseError",
            error_message=str(exc),
            failing_case_summary=None,
            likely_stage="internal",
            feedback_targets=["Internal runner issue — try again after simplifying your submission."],
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
    prob = ROOT / "problems" / f"{req.problem_id}.json"
    if not prob.exists():
        raise HTTPException(status_code=404, detail="Unknown problem_id.")
    if req.language != "python":
        raise HTTPException(status_code=400, detail="Only python is supported in MVP.")
    use_sub = os.environ.get("RUNNER_USE_SUBPROCESS", "1") == "1"
    if use_sub:
        return _run_in_subprocess(req)
    ev, vis = evaluate_with_problem_id(req.code, req.problem_id)
    return RunResponse(
        status=ev.status,
        evaluation=ev,
        visible_test_results=vis,
        interviewer_feedback=deterministic_interviewer_note(ev),
    )
