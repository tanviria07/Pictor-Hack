"""
Stepwise-scaffold generator backed by DeepSeek.

Call graph
----------
    generate_for_problem(problem_id)
        -> _load_problem_everywhere(problem_id)         # finds every mirror
        -> _should_skip(problem, overwrite)             # idempotency + curated
        -> _deepseek_generate(problem)                  # DeepSeek API
           fallback to _heuristic_generate(problem)     # never raises
        -> _write_everywhere(paths, generated)          # updates all mirrors

Contract
--------
The returned dict always has exactly these keys (all strings or lists of
strings; never None):

    {
        "solution_sentences": [...],
        "hints_per_sentence":  [...],
        "final_explanation":   "...",
    }

The generator NEVER imports or evaluates user code; it only produces
scaffold data. The authoritative validator lives in `app/stepwise.py` and
is untouched.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.problem_io import ProblemLoadError, read_problem_json

# ---------------------------------------------------------------------------
# Repo-layout-aware helpers. The runner only needs `runner-python/problems/`
# at runtime, but the generator is used from scripts that want every mirror
# updated so the Go embed, the runner, and the shared tree stay in sync.
# ---------------------------------------------------------------------------

_REPO_ROOT_ENV = "STEPWISE_REPO_ROOT"


def _repo_root() -> Path:
    raw = os.environ.get(_REPO_ROOT_ENV, "").strip()
    if raw:
        return Path(raw)
    # runner-python/app/stepwise_gen.py -> runner-python/app -> runner-python -> repo root
    return Path(__file__).resolve().parent.parent.parent


def _mirror_roots() -> list[Path]:
    root = _repo_root()
    return [
        root / "shared" / "problems",
        root / "backend-go" / "internal" / "problems" / "data",
        root / "runner-python" / "problems",
    ]


def _iter_problem_paths(problem_id: str) -> list[Path]:
    out: list[Path] = []
    for mirror in _mirror_roots():
        if not mirror.exists():
            continue
        out.extend(sorted(mirror.rglob(f"{problem_id}.json")))
    return out


def _load_problem_everywhere(problem_id: str) -> tuple[dict[str, Any], list[Path]]:
    paths = _iter_problem_paths(problem_id)
    if not paths:
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return read_problem_json(paths[0]), paths


def _save_json(path: Path, data: dict[str, Any]) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_bytes(text.encode("utf-8"))


# ---------------------------------------------------------------------------
# Curated / idempotency guard.
# ---------------------------------------------------------------------------

@dataclass
class SkipReason:
    kind: str  # "curated" | "already-generated" | "no-sources"
    message: str


def _should_skip(problem: dict[str, Any], *, overwrite: bool) -> SkipReason | None:
    if bool(problem.get("curated")):
        return SkipReason("curated", "problem is flagged curated: true")
    if not overwrite and problem.get("solution_sentences"):
        return SkipReason(
            "already-generated",
            "solution_sentences already present (use overwrite=True to replace)",
        )
    if not _has_generation_inputs(problem):
        return SkipReason(
            "no-sources",
            "problem has no description or canonical_solution_summary to seed generation",
        )
    return None


def _has_generation_inputs(problem: dict[str, Any]) -> bool:
    if str(problem.get("description", "")).strip():
        return True
    if str(problem.get("canonical_solution_summary", "")).strip():
        return True
    if str(problem.get("starter_code", "")).strip():
        return True
    return False


# ---------------------------------------------------------------------------
# DeepSeek prompt + caller.
# ---------------------------------------------------------------------------

_DEEPSEEK_SYSTEM = (
    "You are an experienced Python instructor. You convert a reference "
    "solution into a step-by-step scaffold that teaches a student to write "
    "the code themselves, one sentence (one logical Python line) at a time.\n"
    "\n"
    "Follow ALL rules, every time:\n"
    "1. Output ONE valid JSON object and nothing else: no prose, no markdown, "
    "no code fences.\n"
    "2. The JSON MUST have exactly these keys:\n"
    "   - \"solution_sentences\": array of strings. Each string is ONE logical "
    "Python line from the reference solution in execution order. Preserve "
    "exact indentation (4 spaces per level). No blank lines. No comments. "
    "Never merge multiple statements onto one line.\n"
    "   - \"hints_per_sentence\": array of strings, SAME length as "
    "solution_sentences. Each hint gently nudges the student toward writing "
    "that line without quoting it verbatim; keep it 1-2 sentences.\n"
    "   - \"final_explanation\": 2-3 sentence paragraph explaining the "
    "overall solution intuition (not a line-by-line recap).\n"
    "3. The first sentence MUST be the function signature line that matches "
    "the provided starter (`def name(params):` or `class Name:`).\n"
    "4. Use only ASCII where possible. Escape backticks as needed; the value "
    "must round-trip through json.loads."
)


_DEEPSEEK_USER_TEMPLATE = """\
Problem id: {id}
Title: {title}
Difficulty: {difficulty}
Function name: {function_name}
Expected return type: {expected_return_type}

Description:
{description}

Starter code (the student sees this before typing):
```python
{starter_code}
```

Reference solution (do not reveal verbatim in hints):
```python
{reference_solution}
```

Produce the JSON now.
"""


def _build_reference_solution(problem: dict[str, Any]) -> str:
    """Build the best-available reference solution text for the prompt."""
    canonical = str(problem.get("canonical_solution_summary", "")).strip()
    starter = str(problem.get("starter_code", "")).strip()
    fn = problem.get("function_name") or "solution"

    if "\n" in canonical:
        return canonical

    # Single-line canonical: wrap in the signature when possible.
    signature = _first_signature_line(starter)
    if signature and canonical:
        return f"{signature}\n    {canonical}"
    if canonical:
        return canonical
    return starter or f"def {fn}():\n    pass"


def _first_signature_line(starter_code: str) -> str | None:
    for raw in (starter_code or "").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        return raw.rstrip()
    return None


def _deepseek_generate(problem: dict[str, Any]) -> dict[str, Any]:
    """Call DeepSeek and return a normalized dict. Raises on any failure."""
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set")

    # Import lazily so the runner can start without the openai package
    # installed in environments that do not use generation.
    from openai import OpenAI  # type: ignore[import-not-found]

    base_url = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    model = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")

    user = _DEEPSEEK_USER_TEMPLATE.format(
        id=problem.get("id", ""),
        title=problem.get("title", ""),
        difficulty=problem.get("difficulty", ""),
        function_name=problem.get("function_name", ""),
        expected_return_type=problem.get("expected_return_type", ""),
        description=problem.get("description", ""),
        starter_code=problem.get("starter_code", "").rstrip() or "(none)",
        reference_solution=_build_reference_solution(problem),
    )

    client = OpenAI(api_key=api_key, base_url=base_url)
    resp = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": _DEEPSEEK_SYSTEM},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
        timeout=90,
    )

    content = (resp.choices[0].message.content or "").strip()
    if not content:
        raise RuntimeError("DeepSeek returned an empty response")

    parsed = _parse_json_strict(content)
    return _coerce_generated(parsed)


def _parse_json_strict(text: str) -> dict[str, Any]:
    # Strip accidental markdown code fences if the model ignores the system
    # prompt on a bad day.
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _coerce_generated(parsed: Any) -> dict[str, Any]:
    if not isinstance(parsed, dict):
        raise ValueError("DeepSeek response root is not a JSON object")

    sentences = parsed.get("solution_sentences")
    hints = parsed.get("hints_per_sentence")
    explanation = parsed.get("final_explanation")

    if not isinstance(sentences, list) or not all(
        isinstance(s, str) for s in sentences
    ):
        raise ValueError("solution_sentences must be a list of strings")
    if not isinstance(hints, list) or not all(isinstance(s, str) for s in hints):
        raise ValueError("hints_per_sentence must be a list of strings")
    if not isinstance(explanation, str):
        raise ValueError("final_explanation must be a string")

    sentences = [s.rstrip() for s in sentences if s and s.strip()]
    hints = [h.strip() for h in hints]
    if not sentences:
        raise ValueError("solution_sentences is empty")

    # Align hint list length with sentences so the validator is happy.
    if len(hints) < len(sentences):
        hints = hints + [""] * (len(sentences) - len(hints))
    elif len(hints) > len(sentences):
        hints = hints[: len(sentences)]

    return {
        "solution_sentences": sentences,
        "hints_per_sentence": hints,
        "final_explanation": explanation.strip(),
    }


# ---------------------------------------------------------------------------
# Deterministic fallback (no DeepSeek). Never raises.
# ---------------------------------------------------------------------------

def _heuristic_generate(problem: dict[str, Any]) -> dict[str, Any]:
    canonical = str(problem.get("canonical_solution_summary", "")).strip()
    starter = str(problem.get("starter_code", "")).strip()
    signature = _first_signature_line(starter)
    fn = problem.get("function_name") or "<the function>"

    sentences: list[str] = []
    if signature:
        sentences.append(signature)

    if canonical:
        if "\n" in canonical:
            for raw in canonical.splitlines():
                line = raw.rstrip()
                stripped = line.lstrip()
                if not stripped or stripped.startswith("#"):
                    continue
                sentences.append(line)
        else:
            sentences.append(f"    {canonical}")

    if not sentences:
        sentences = [f"def {fn}():", "    pass"]

    hints = [
        f"Line {i + 1}: write `{s.strip()}`." for i, s in enumerate(sentences)
    ]
    explanation = (
        f"Fallback scaffold for `{fn}`. The sentences mirror the reference "
        "solution line by line; generate proper hints with DeepSeek when an "
        "API key is available."
    )
    return {
        "solution_sentences": sentences,
        "hints_per_sentence": hints,
        "final_explanation": explanation,
    }


# ---------------------------------------------------------------------------
# Public orchestration.
# ---------------------------------------------------------------------------

@dataclass
class GenerationResult:
    problem_id: str
    source: str  # "deepseek" | "heuristic" | "skipped"
    skip_reason: str | None
    sentences_count: int
    data: dict[str, Any] | None
    paths: list[Path]


def generate_for_problem(
    problem_id: str,
    *,
    overwrite: bool = False,
    dry_run: bool = False,
    force_fallback: bool = False,
) -> GenerationResult:
    """Generate and persist stepwise scaffold for a single problem.

    overwrite: replace existing solution_sentences (still respects curated).
    dry_run:   skip writing to disk (use for verification).
    force_fallback: never call DeepSeek; always use the heuristic (handy
                   for offline scripts and tests).
    """
    problem, paths = _load_problem_everywhere(problem_id)
    reason = _should_skip(problem, overwrite=overwrite)
    if reason is not None:
        return GenerationResult(
            problem_id=problem_id,
            source="skipped",
            skip_reason=f"{reason.kind}: {reason.message}",
            sentences_count=len(problem.get("solution_sentences") or []),
            data=None,
            paths=paths,
        )

    if force_fallback:
        generated = _heuristic_generate(problem)
        source = "heuristic"
    else:
        try:
            generated = _deepseek_generate(problem)
            source = "deepseek"
        except Exception:
            generated = _heuristic_generate(problem)
            source = "heuristic"

    if not dry_run:
        for path in paths:
            try:
                mirror_data = read_problem_json(path)
            except ProblemLoadError:
                continue
            mirror_data["solution_sentences"] = list(
                generated["solution_sentences"]
            )
            mirror_data["hints_per_sentence"] = list(
                generated["hints_per_sentence"]
            )
            mirror_data["final_explanation"] = generated["final_explanation"]
            # `curated` is only set by humans / the migration script; the
            # generator never flips it.
            _save_json(path, mirror_data)

    return GenerationResult(
        problem_id=problem_id,
        source=source,
        skip_reason=None,
        sentences_count=len(generated["solution_sentences"]),
        data=generated,
        paths=paths,
    )


__all__ = [
    "GenerationResult",
    "SkipReason",
    "generate_for_problem",
    "_deepseek_generate",
    "_heuristic_generate",
]
