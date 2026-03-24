"""
Entry point executed in a subprocess for timeout isolation.

MVP: wall-clock bound + crash containment. Not a substitute for kernel-level sandboxing.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    payload = json.loads(sys.stdin.read())
    code = payload["code"]
    problem_id = payload["problem_id"]

    from app.evaluator import evaluate_with_problem_id
    from app.feedback import deterministic_interviewer_note
    from app.models import RunResponse

    ev = evaluate_with_problem_id(code, problem_id)
    note = deterministic_interviewer_note(ev)
    resp = RunResponse(
        status=ev.status,
        evaluation=ev,
        visible_test_results=ev.visible_test_results,
        interviewer_feedback=note,
    )
    sys.stdout.write(resp.model_dump_json())


if __name__ == "__main__":
    main()
