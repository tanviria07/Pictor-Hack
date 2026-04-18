"""
Stepwise (sentence-by-sentence) validation.

A "sentence" is a single logical code line (blank lines and `#` comments are
ignored). The user's code is normalized and compared left-to-right against the
problem's expected `solution_sentences` list. Comparison collapses all
whitespace runs so indentation with tabs vs. spaces does not matter.

This module is intentionally self-contained: no filesystem or network access,
no import of user code. All sandboxing/execution rules continue to live in
`app.safety` and `app.execution` for the regular /evaluate path.
"""

from __future__ import annotations

from typing import Any

from app.models import (
    StepwiseValidateRequest,
    StepwiseValidateResponse,
)


def _normalize_sentences(code: str) -> list[str]:
    """Return non-empty, non-comment lines from `code`.

    Leading/trailing whitespace is kept on each line so callers can still see
    the original shape if they want; comparison uses collapse_whitespace().
    """
    out: list[str] = []
    for raw in (code or "").splitlines():
        line = raw.rstrip()
        stripped = line.lstrip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        # Drop inline trailing comments only when they are clearly safe
        # (# preceded by whitespace, not inside a string literal). A real
        # parser is overkill here; we keep it simple and conservative.
        line = _strip_trailing_comment(line)
        if not line.strip():
            continue
        out.append(line)
    return out


def _strip_trailing_comment(line: str) -> str:
    in_single = False
    in_double = False
    i = 0
    while i < len(line):
        ch = line[i]
        if ch == "\\":
            i += 2
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
        elif ch == '"' and not in_single:
            in_double = not in_double
        elif ch == "#" and not in_single and not in_double:
            return line[:i].rstrip()
        i += 1
    return line


def _collapse_whitespace(s: str) -> str:
    return " ".join(s.split())


def _compare(user: str, expected: str) -> bool:
    return _collapse_whitespace(user) == _collapse_whitespace(expected)


def validate_stepwise(
    code: str, problem: dict[str, Any]
) -> StepwiseValidateResponse:
    """Core validator: pure function over problem metadata and user code."""
    sentences: list[str] = list(problem.get("solution_sentences") or [])
    hints: list[str] = list(problem.get("hints_per_sentence") or [])
    explanation: str = str(problem.get("final_explanation") or "")

    if not sentences:
        return StepwiseValidateResponse(
            available=False,
            correct_count=0,
            total=0,
            is_full_solution=False,
            first_failed_index=None,
            next_hint=(
                "Stepwise validation is not configured for this problem yet."
            ),
            final_explanation="",
            expected_sentence="",
            user_sentence="",
            message="Stepwise validation not configured for this problem.",
        )

    user_sentences = _normalize_sentences(code)
    total = len(sentences)
    correct_count = 0
    first_failed_index: int | None = None

    for i, expected in enumerate(sentences):
        if i >= len(user_sentences):
            break
        if _compare(user_sentences[i], expected):
            correct_count += 1
        else:
            first_failed_index = i
            break

    is_full = correct_count >= total and len(user_sentences) >= total

    if is_full:
        message = "Full solution correct!"
        next_hint = ""
        expected_sentence = ""
        user_sentence = ""
    elif first_failed_index is not None:
        if first_failed_index == 0:
            message = "Incorrect. Let's start from the beginning."
        else:
            message = (
                f"Sentence {first_failed_index + 1} is incorrect. "
                "Fix it before moving on."
            )
        next_hint = _hint_for(hints, sentences, first_failed_index)
        expected_sentence = sentences[first_failed_index]
        user_sentence = user_sentences[first_failed_index]
    else:
        # No mismatch so far; user has written `correct_count` sentences and
        # they all match. Either nothing yet (correct_count==0) or a prefix.
        if correct_count == 0:
            message = "Write the first sentence of the solution."
        else:
            message = (
                f"Correct! Now write sentence {correct_count + 1} of {total}."
            )
        next_hint = _hint_for(hints, sentences, correct_count)
        expected_sentence = sentences[correct_count] if correct_count < total else ""
        user_sentence = ""

    return StepwiseValidateResponse(
        available=True,
        correct_count=correct_count,
        total=total,
        is_full_solution=is_full,
        first_failed_index=first_failed_index,
        next_hint=next_hint,
        final_explanation=explanation if is_full else "",
        expected_sentence=expected_sentence,
        user_sentence=user_sentence,
        message=message,
    )


def _hint_for(hints: list[str], sentences: list[str], idx: int) -> str:
    if 0 <= idx < len(hints) and hints[idx]:
        return hints[idx]
    if 0 <= idx < len(sentences):
        return f"Next sentence should be: `{sentences[idx]}`"
    return ""


def validate_request(
    req: StepwiseValidateRequest, problem: dict[str, Any]
) -> StepwiseValidateResponse:
    return validate_stepwise(req.code, problem)


__all__ = [
    "validate_stepwise",
    "validate_request",
]
