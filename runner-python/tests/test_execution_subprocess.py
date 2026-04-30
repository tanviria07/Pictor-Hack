"""Tests for app.execution subprocess path with mocked subprocess.run."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.execution import ROOT, _run_in_subprocess
from app.models import RunRequest, RunResponse


def _minimal_run_response_dict() -> dict:
    return {
        "status": "correct",
        "evaluation": {
            "status": "correct",
            "syntax_ok": True,
            "function_found": True,
            "signature_ok": True,
            "passed_visible_tests": 1,
            "total_visible_tests": 1,
            "passed_hidden_tests": 0,
            "total_hidden_tests": 0,
            "likely_stage": "done",
            "feedback_targets": [],
            "visible_test_results": [],
        },
        "visible_test_results": [],
        "interviewer_feedback": "Nice work.",
    }


def test_run_in_subprocess_success(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = json.dumps({"code": "def twoSum():\n    pass", "problem_id": "two-sum"})
    proc = MagicMock()
    proc.returncode = 0
    proc.stdout = json.dumps(_minimal_run_response_dict()).encode("utf-8")
    proc.stderr = b""

    mock_run = MagicMock(return_value=proc)
    monkeypatch.setattr("app.execution.subprocess.run", mock_run)

    req = RunRequest(problem_id="two-sum", language="python", code="def twoSum():\n    pass")
    out = _run_in_subprocess(req)

    assert isinstance(out, RunResponse)
    assert out.status == "correct"
    mock_run.assert_called_once()
    call_args = mock_run.call_args.args
    call_kw = mock_run.call_args.kwargs
    assert call_args[0][-1] == str(ROOT / "app" / "run_job.py")
    assert call_kw["cwd"] != str(ROOT)
    assert call_kw["env"]["PYTHONPATH"] == call_kw["cwd"]
    assert call_kw["env"].get("PYTHONUTF8") == "1"
    assert call_kw["env"].get("PYTHONIOENCODING") == "utf-8"


def test_run_in_subprocess_nonzero_exit(monkeypatch: pytest.MonkeyPatch) -> None:
    proc = MagicMock()
    proc.returncode = 1
    proc.stdout = b""
    proc.stderr = b"boom"
    monkeypatch.setattr("app.execution.subprocess.run", MagicMock(return_value=proc))

    req = RunRequest(problem_id="two-sum", language="python", code="x")
    out = _run_in_subprocess(req)
    assert out.status == "runtime_error"
    assert out.evaluation.error_type == "SubprocessError"


def test_run_in_subprocess_invalid_stdout_json(monkeypatch: pytest.MonkeyPatch) -> None:
    proc = MagicMock()
    proc.returncode = 0
    proc.stdout = b"not-json"
    proc.stderr = b""
    monkeypatch.setattr("app.execution.subprocess.run", MagicMock(return_value=proc))

    req = RunRequest(problem_id="two-sum", language="python", code="x")
    out = _run_in_subprocess(req)
    assert out.status == "internal_error"
    assert out.evaluation.error_type == "RunnerJsonParseError"
