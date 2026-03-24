"""Load problem definitions from packaged JSON (local lookup by problem_id)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_PROBLEMS_DIR = Path(__file__).resolve().parent.parent / "problems"


def load_problem(problem_id: str) -> dict[str, Any]:
    path = _PROBLEMS_DIR / f"{problem_id}.json"
    if not path.exists():
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def problem_path(problem_id: str) -> Path:
    return _PROBLEMS_DIR / f"{problem_id}.json"
