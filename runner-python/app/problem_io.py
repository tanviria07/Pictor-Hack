"""
Authoritative UTF-8 loading for problem JSON on disk.

All problem definitions must be valid UTF-8 JSON. Windows-1252 or other legacy
encodings raise ProblemLoadError (platform issue, not user code).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class ProblemLoadError(Exception):
    """Problem file could not be read as UTF-8 JSON."""

    def __init__(self, path: str, message: str) -> None:
        self.path = path
        self.message = message
        super().__init__(f"{path}: {message}")


def read_problem_json(path: Path) -> dict[str, Any]:
    """
    Read a single problem JSON file using strict UTF-8 and valid JSON.

    Raises:
        ProblemLoadError: Not UTF-8, invalid JSON, or unreadable file (wrapped OSError).
    """
    try:
        raw = path.read_bytes()
    except OSError as e:
        raise ProblemLoadError(str(path), f"cannot read file: {e}") from e

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        raise ProblemLoadError(
            str(path),
            f"file is not valid UTF-8 ({e}); re-save as UTF-8 (e.g. em dash must be U+2013, not Windows-1252 0x97).",
        ) from e

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise ProblemLoadError(str(path), f"invalid JSON: {e}") from e

    if not isinstance(data, dict):
        raise ProblemLoadError(str(path), "problem JSON must be an object at the root")
    return data
