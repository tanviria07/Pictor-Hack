"""
Stepwise migration: add `solution_sentences`, `hints_per_sentence`, and
`final_explanation` to every problem JSON that can be safely auto-populated.

Strategy
--------
1. CURATED (manual, high quality) — a small hand-written map keyed by
   problem id. Always wins if present.
2. HEURISTIC (automatic, best-effort) — for every other problem whose
   `canonical_solution_summary` looks like a single executable statement we
   construct a two-sentence solution: the function signature from
   `starter_code` followed by `    <canonical>`. Generic default hints are
   filled in. If the heuristic cannot produce something plausible the
   problem is skipped; stepwise stays disabled for it and the existing
   full-solution Run Code flow continues to work.

The script writes UTF-8 JSON and preserves all existing keys. It updates
three mirror roots at once so the Go backend embed and the Python runner
stay in sync:

    shared/problems/
    backend-go/internal/problems/data/
    runner-python/problems/

Run it from the repo root:

    python scripts/generate_stepwise_defaults.py
    python scripts/generate_stepwise_defaults.py --dry-run
    python scripts/generate_stepwise_defaults.py --force   # overwrite existing

Idempotent: re-running never clobbers hand-curated fields unless --force
is passed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
MIRROR_ROOTS = [
    REPO_ROOT / "shared" / "problems",
    REPO_ROOT / "backend-go" / "internal" / "problems" / "data",
    REPO_ROOT / "runner-python" / "problems",
]

# ---------------------------------------------------------------------------
# Curated stepwise data. Keep focused on PreCode 100 section 1 for the first
# pass; extend over time. Values must match the existing starter_code
# signatures exactly so the first sentence is always the same line the user
# sees in the editor on load.
# ---------------------------------------------------------------------------
CURATED: dict[str, dict[str, Any]] = {
    "precode-pb-01-return-seven": {
        "solution_sentences": [
            "def answer():",
            "    return 7",
        ],
        "hints_per_sentence": [
            "Define a function named `answer` with no parameters using `def answer():`.",
            "Inside the function, use `return 7` (not `print`).",
        ],
        "final_explanation": (
            "`answer` is a zero-argument function that returns the integer 7. "
            "We use `return` (not `print`) because the tests check the value "
            "handed back to the caller, not what is printed."
        ),
    },
    "precode-pb-02-sum-two-integers": {
        "solution_sentences": [
            "def sum_two(a, b):",
            "    return a + b",
        ],
        "hints_per_sentence": [
            "Define the function signature: `def sum_two(a, b):`.",
            "Add `a` and `b` with the `+` operator and `return` the result.",
        ],
        "final_explanation": (
            "`sum_two(a, b)` simply returns `a + b`. The `+` operator on two "
            "integers produces their arithmetic sum, including for negatives."
        ),
    },
    "precode-pb-06-even-or-odd": {
        "solution_sentences": [
            "def parity(n):",
            "    if n % 2 == 0:",
            "        return \"even\"",
            "    return \"odd\"",
        ],
        "hints_per_sentence": [
            "Start with the function signature: `def parity(n):`.",
            "Check divisibility by 2 using the modulo operator: `if n % 2 == 0:`.",
            "When divisible, return the string `\"even\"`.",
            "Otherwise, return `\"odd\"` (no `else` needed since the previous branch returned).",
        ],
        "final_explanation": (
            "`parity(n)` uses the modulo operator `%` to test whether `n` is "
            "divisible by 2. The early `return` in the `if` branch means we "
            "reach the final `return \"odd\"` only for odd numbers."
        ),
    },
    "precode-pb-07-sign": {
        "solution_sentences": [
            "def sign(n):",
            "    if n > 0:",
            "        return 1",
            "    if n < 0:",
            "        return -1",
            "    return 0",
        ],
        "hints_per_sentence": [
            "Define the function: `def sign(n):`.",
            "Check positive first: `if n > 0:`.",
            "Return `1` for positive numbers.",
            "Next check negative: `if n < 0:`.",
            "Return `-1` for negative numbers.",
            "If neither branch returned, `n` is zero — return `0`.",
        ],
        "final_explanation": (
            "`sign(n)` returns `1` for positives, `-1` for negatives, and `0` "
            "for zero. Early returns let each branch exit as soon as it matches, "
            "so the final `return 0` handles the remaining zero case."
        ),
    },
    "precode-pb-08-absolute-difference": {
        "solution_sentences": [
            "def abs_diff(a, b):",
            "    return abs(a - b)",
        ],
        "hints_per_sentence": [
            "Define the function: `def abs_diff(a, b):`.",
            "Subtract and wrap in `abs(...)`: `return abs(a - b)`.",
        ],
        "final_explanation": (
            "`abs_diff` computes the distance between `a` and `b` regardless "
            "of order. `abs()` returns the non-negative magnitude of its input."
        ),
    },
}


# ---------------------------------------------------------------------------
# Heuristic builder.
# ---------------------------------------------------------------------------

def _first_signature_line(starter_code: str) -> str | None:
    """Return the first non-blank, non-comment line of `starter_code`."""
    for raw in (starter_code or "").splitlines():
        line = raw.rstrip()
        stripped = line.lstrip()
        if not stripped or stripped.startswith("#"):
            continue
        return line
    return None


_SAFE_LEADING = (
    "return ",
    "return\t",
    "yield ",
    "pass",
    "raise ",
)


def _looks_like_single_statement(code: str) -> bool:
    code = (code or "").strip()
    if not code:
        return False
    if "\n" in code:
        return False
    if code.startswith(_SAFE_LEADING) or code == "pass":
        return True
    # Simple assignment or expression — keep conservative.
    if code.startswith("return"):
        return True
    return False


def _heuristic(problem: dict[str, Any]) -> dict[str, Any] | None:
    canonical = problem.get("canonical_solution_summary", "")
    if not _looks_like_single_statement(canonical):
        return None
    signature = _first_signature_line(problem.get("starter_code", ""))
    if not signature:
        return None
    fn = problem.get("function_name", "<the function>")
    body_line = f"    {canonical.strip()}"
    return {
        "solution_sentences": [signature, body_line],
        "hints_per_sentence": [
            f"Start with the function signature exactly as shown: `{signature}`.",
            f"Inside `{fn}`, the body is a single statement: `{canonical.strip()}`.",
        ],
        "final_explanation": (
            f"`{fn}` is implemented with one statement: `{canonical.strip()}`. "
            "The signature declares the parameters and the body returns the "
            "value the tests expect."
        ),
    }


# ---------------------------------------------------------------------------
# I/O.
# ---------------------------------------------------------------------------

def _iter_problem_files() -> list[Path]:
    files: list[Path] = []
    for root in MIRROR_ROOTS:
        if not root.exists():
            continue
        files.extend(sorted(root.rglob("*.json")))
    return files


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_bytes().decode("utf-8"))


def _save(path: Path, data: dict[str, Any]) -> None:
    text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    path.write_bytes(text.encode("utf-8"))


def _should_skip(problem: dict[str, Any], force: bool) -> bool:
    if force:
        return False
    if problem.get("solution_sentences"):
        return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without writing files.")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing solution_sentences/hints_per_sentence/final_explanation.")
    parser.add_argument("--ids", nargs="*", default=None,
                        help="Restrict to specific problem ids.")
    args = parser.parse_args()

    files = _iter_problem_files()
    if not files:
        print("No problem files found under any mirror root.")
        return 1

    curated_updates = 0
    heuristic_updates = 0
    skipped_existing = 0
    skipped_no_data = 0

    per_id: dict[str, list[Path]] = {}
    for path in files:
        try:
            data = _load(path)
        except Exception as exc:  # pragma: no cover - reporting only
            print(f"! cannot parse {path}: {exc}")
            continue
        pid = str(data.get("id") or "")
        if not pid:
            continue
        per_id.setdefault(pid, []).append(path)

    ids = sorted(per_id)
    if args.ids:
        ids = [pid for pid in ids if pid in set(args.ids)]

    for pid in ids:
        paths = per_id[pid]
        data = _load(paths[0])

        if _should_skip(data, args.force):
            skipped_existing += 1
            continue

        update: dict[str, Any] | None = CURATED.get(pid)
        source = "curated"
        if update is None:
            update = _heuristic(data)
            source = "heuristic"
        if update is None:
            skipped_no_data += 1
            continue

        if source == "curated":
            curated_updates += 1
        else:
            heuristic_updates += 1

        label = f"[{source}]"
        print(f"{label} {pid}  ({len(update['solution_sentences'])} sentences)")

        if args.dry_run:
            continue

        # Write the updated data to every mirror path for this id.
        for path in paths:
            mirror_data = _load(path)
            mirror_data["solution_sentences"] = list(update["solution_sentences"])
            mirror_data["hints_per_sentence"] = list(update["hints_per_sentence"])
            mirror_data["final_explanation"] = update["final_explanation"]
            _save(path, mirror_data)

    print()
    print(f"curated updates:   {curated_updates}")
    print(f"heuristic updates: {heuristic_updates}")
    print(f"skipped (already have solution_sentences): {skipped_existing}")
    print(f"skipped (no derivable sentences): {skipped_no_data}")
    if args.dry_run:
        print("(dry run — nothing written)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
