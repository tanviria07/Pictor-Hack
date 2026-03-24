"""Load problem definitions from packaged JSON (local lookup by problem_id)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_PROBLEMS_DIR = Path(__file__).resolve().parent.parent / "problems"


def load_problem(problem_id: str) -> dict[str, Any]:
    matches = sorted(_PROBLEMS_DIR.rglob(f"{problem_id}.json"))
    if not matches:
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return json.loads(matches[0].read_text(encoding="utf-8"))


def problem_path(problem_id: str) -> Path:
    matches = sorted(_PROBLEMS_DIR.rglob(f"{problem_id}.json"))
    if not matches:
        return _PROBLEMS_DIR / f"{problem_id}.json"
    return matches[0]
