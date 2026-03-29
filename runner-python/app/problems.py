"""Load problem definitions from packaged JSON (local lookup by problem_id)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

_DEFAULT_DIR = Path(__file__).resolve().parent.parent / "problems"


def _problems_dir() -> Path:
    raw = os.environ.get("PROBLEMS_DIR", "").strip()
    if raw:
        return Path(raw)
    return _DEFAULT_DIR


def load_problem(problem_id: str) -> dict[str, Any]:
    root = _problems_dir()
    matches = sorted(root.rglob(f"{problem_id}.json"))
    if not matches:
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return json.loads(matches[0].read_text(encoding="utf-8"))


def problem_path(problem_id: str) -> Path:
    root = _problems_dir()
    matches = sorted(root.rglob(f"{problem_id}.json"))
    if not matches:
        return root / f"{problem_id}.json"
    return matches[0]
