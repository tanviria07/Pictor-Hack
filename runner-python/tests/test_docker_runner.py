"""Docker run path with a mocked Docker client."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from app.docker_runner import run_in_docker
from app.models import RunRequest


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


def test_run_in_docker_success(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("RUNNER_DOCKER_JOB_DIR", str(tmp_path))
    out_bytes = json.dumps(_minimal_run_response_dict()).encode("utf-8")

    mock_client = MagicMock()
    mock_client.containers.run.return_value = out_bytes
    monkeypatch.setattr("app.docker_runner.docker.from_env", lambda: mock_client)

    req = RunRequest(problem_id="two-sum", language="python", code="def twoSum():\n    pass")
    resp = run_in_docker(req)

    assert resp.status == "correct"
    mock_client.containers.run.assert_called_once()
    call_kw = mock_client.containers.run.call_args.kwargs
    assert call_kw["network_mode"] == "none"
    assert call_kw["read_only"] is True


def test_run_in_docker_container_error(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    import docker

    monkeypatch.setenv("RUNNER_DOCKER_JOB_DIR", str(tmp_path))
    mock_client = MagicMock()
    err = docker.errors.ContainerError(None, 1, "cmd", "img", b"stderr-msg")
    mock_client.containers.run.side_effect = err
    monkeypatch.setattr("app.docker_runner.docker.from_env", lambda: mock_client)

    req = RunRequest(problem_id="two-sum", language="python", code="x")
    resp = run_in_docker(req)
    assert resp.status == "runtime_error"
    assert resp.evaluation.error_type == "ContainerError"
