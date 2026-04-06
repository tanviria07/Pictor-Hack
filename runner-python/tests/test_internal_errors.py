"""Tests for subprocess stdout parsing and platform error responses."""

from __future__ import annotations

import json

from app.internal_errors import parse_subprocess_stdout_json


def test_parse_subprocess_stdout_invalid_utf8() -> None:
    out = parse_subprocess_stdout_json(
        b"\xff\xfe\x97",
        problem_id="x",
        visible_count=1,
        hidden_count=0,
    )
    assert out.status == "internal_error"
    assert out.evaluation.error_type == "RunnerStdoutDecodeError"
    assert "utf-8" in (out.evaluation.error_message or "").lower()


def test_parse_subprocess_stdout_invalid_json() -> None:
    out = parse_subprocess_stdout_json(
        b"not-json",
        problem_id="x",
        visible_count=2,
        hidden_count=1,
    )
    assert out.status == "internal_error"
    assert out.evaluation.error_type == "RunnerJsonParseError"


def test_parse_subprocess_stdout_ok_roundtrip() -> None:
    payload = {
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
        "interviewer_feedback": "ok",
    }
    raw = json.dumps(payload).encode("utf-8")
    out = parse_subprocess_stdout_json(raw, problem_id="z", visible_count=1, hidden_count=0)
    assert out.status == "correct"
