"""Deterministic short interviewer notes (no LLM)."""

from __future__ import annotations

from app.models import StructuredEvaluation


def deterministic_interviewer_note(ev: StructuredEvaluation) -> str:
    if ev.status == "correct":
        return "Looks good — your implementation satisfies the visible checks and the hidden battery."
    if ev.status == "syntax_error":
        return "Syntax issue first — I cannot run tests until this parses cleanly."
    if ev.status == "runtime_error":
        return "We hit a runtime error while executing your code; stabilize the happy path, then tighten edge cases."
    if ev.status == "incomplete":
        return "This still reads like an early draft — tighten the core logic so it returns a real answer on the samples."
    if ev.status == "wrong":
        return "The samples are still failing — align the behavior with the examples before optimizing."
    if ev.status == "partial":
        return "You're partway there — some cases pass, but a few behaviors still need tightening."
    return "Let's keep going step by step."
