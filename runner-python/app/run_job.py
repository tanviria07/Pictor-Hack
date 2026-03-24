"""
Entry point executed in a subprocess for timeout isolation.

Production-grade sandboxing would still require OS-level containment even with subprocess;
this mainly bounds wall-clock time and separates interpreter crashes from the API process.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    payload = json.loads(sys.stdin.read())
    code = payload["code"]
    problem_id = payload["problem_id"]

    from app.evaluator import deterministic_interviewer_note, evaluate_with_problem_id
    from app.models import RunResponse, StructuredEvaluation, VisibleTestResult

    ev, visible = evaluate_with_problem_id(code, problem_id)
    note = deterministic_interviewer_note(ev)
    resp = RunResponse(
        status=ev.status,
        evaluation=ev,
        visible_test_results=visible,
        interviewer_feedback=note,
    )
    sys.stdout.write(resp.model_dump_json())


if __name__ == "__main__":
    main()
