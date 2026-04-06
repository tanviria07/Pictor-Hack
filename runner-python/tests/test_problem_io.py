"""Tests for strict UTF-8 problem JSON loading."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.problem_io import ProblemLoadError, read_problem_json


def test_read_problem_json_valid_utf8(tmp_path: Path) -> None:
    p = tmp_path / "p.json"
    data = {"id": "x", "title": "Hi — unicode em dash"}
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    out = read_problem_json(p)
    assert out["id"] == "x"


def test_read_problem_json_rejects_cp1252_em_dash(tmp_path: Path) -> None:
    """Windows-1252 em dash is byte 0x97 alone — invalid UTF-8."""
    p = tmp_path / "bad.json"
    p.write_bytes(b'{"x":"\x97"}')
    with pytest.raises(ProblemLoadError) as ei:
        read_problem_json(p)
    assert "not valid UTF-8" in str(ei.value).lower() or "utf-8" in str(ei.value).lower()


def test_read_problem_json_invalid_json(tmp_path: Path) -> None:
    p = tmp_path / "bad.json"
    p.write_text("{not json", encoding="utf-8")
    with pytest.raises(ProblemLoadError) as exc:
        read_problem_json(p)
    assert "invalid JSON" in str(exc.value)


def test_read_problem_json_root_must_be_object(tmp_path: Path) -> None:
    p = tmp_path / "arr.json"
    p.write_text("[1,2]", encoding="utf-8")
    with pytest.raises(ProblemLoadError) as exc:
        read_problem_json(p)
    assert "object" in str(exc.value).lower()
