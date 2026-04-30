"""
Entry point executed in a subprocess for timeout isolation.

Reads JSON from stdin, or from the file path in argv[1].
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

RUNNER_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    if len(sys.argv) > 1:
        raw = Path(sys.argv[1]).read_bytes()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as e:
            sys.stderr.write(f"payload file is not UTF-8: {e}\n")
            raise SystemExit(2) from e
    else:
        raw = sys.stdin.buffer.read()
        try:
            payload = json.loads(raw.decode("utf-8"))
        except UnicodeDecodeError as e:
            sys.stderr.write(f"stdin is not valid UTF-8: {e}\n")
            raise SystemExit(2) from e
    code = payload["code"]
    problem_id = payload["problem_id"]

    added_runner_root = False
    runner_root = str(RUNNER_ROOT)
    if runner_root not in sys.path:
        sys.path.insert(0, runner_root)
        added_runner_root = True

    from app.evaluator import evaluate_with_problem_id
    from app.feedback import deterministic_interviewer_note
    from app.models import RunResponse

    if added_runner_root:
        # Drop the internal path before user code is evaluated.
        sys.path = [p for p in sys.path if p != runner_root]

    ev = evaluate_with_problem_id(code, problem_id)
    note = deterministic_interviewer_note(ev)
    resp = RunResponse(
        status=ev.status,
        evaluation=ev,
        visible_test_results=ev.visible_test_results,
        interviewer_feedback=note,
    )
    # Binary stdout so the parent always receives UTF-8 bytes (not cp1252 on Windows).
    sys.stdout.buffer.write(resp.model_dump_json().encode("utf-8"))
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
