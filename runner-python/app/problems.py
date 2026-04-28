"""Load problem definitions from packaged JSON (local lookup by problem_id)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.problem_io import ProblemLoadError, read_problem_json

_DEFAULT_DIR = Path(__file__).resolve().parent.parent / "problems"
_REPO_ROOT = Path(__file__).resolve().parents[2]
_BACKEND_PROBLEMS_DIR = _REPO_ROOT / "backend-go" / "internal" / "problems" / "data"


def _problems_dir() -> Path:
    raw = os.environ.get("PROBLEMS_DIR", "").strip()
    if raw:
        return Path(raw)
    return _DEFAULT_DIR


def load_problem(problem_id: str) -> dict[str, Any]:
    root = _problems_dir()
    matches = sorted(root.rglob(f"{problem_id}.json"))
    if not matches and _BACKEND_PROBLEMS_DIR.exists():
        matches = sorted(_BACKEND_PROBLEMS_DIR.rglob(f"{problem_id}.json"))
    if not matches:
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return read_problem_json(matches[0])


def problem_path(problem_id: str) -> Path:
    root = _problems_dir()
    matches = sorted(root.rglob(f"{problem_id}.json"))
    if not matches and _BACKEND_PROBLEMS_DIR.exists():
        matches = sorted(_BACKEND_PROBLEMS_DIR.rglob(f"{problem_id}.json"))
    if not matches:
        return root / f"{problem_id}.json"
    return matches[0]


__all__ = ["load_problem", "problem_path", "ProblemLoadError"]
