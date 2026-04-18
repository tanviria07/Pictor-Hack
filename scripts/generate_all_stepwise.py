"""
Batch stepwise-scaffold generator.

Iterates every problem JSON under shared/problems/ and invokes the
generator in runner-python/app/stepwise_gen.py. Each problem call is
idempotent and curated-safe:

* curated: true -> skipped (never overwritten)
* solution_sentences present -> skipped unless --overwrite
* no DEEPSEEK_API_KEY -> falls back to the deterministic heuristic
  (or skips if --require-deepseek)

Examples
--------

    # Dry run: list what would happen, no writes, no API calls
    python scripts/generate_all_stepwise.py --dry-run --force-fallback

    # Real run: fills in every problem that is missing stepwise data
    set DEEPSEEK_API_KEY=sk-...
    python scripts/generate_all_stepwise.py

    # Regenerate a specific id (curated flag still wins)
    python scripts/generate_all_stepwise.py --ids precode-pb-03-swap-pair --overwrite

Rate limiting
-------------
Each DeepSeek call sleeps --sleep seconds afterwards. The script also
exits early on repeated upstream errors (--max-consecutive-errors).
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RUNNER_DIR = REPO_ROOT / "runner-python"

# Make runner-python importable so we can call the generator directly.
# Using the module saves one network hop per problem vs. going through the
# Go backend and keeps this script usable even when the API is not running.
sys.path.insert(0, str(RUNNER_DIR))
os.environ.setdefault("STEPWISE_REPO_ROOT", str(REPO_ROOT))

from app.stepwise_gen import generate_for_problem, GenerationResult  # type: ignore  # noqa: E402


def _discover_problem_ids() -> list[str]:
    shared = REPO_ROOT / "shared" / "problems"
    seen: set[str] = set()
    ids: list[str] = []
    for path in sorted(shared.rglob("*.json")):
        pid = path.stem
        if pid in seen:
            continue
        seen.add(pid)
        ids.append(pid)
    return ids


def _parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="Batch stepwise-scaffold generator")
    ap.add_argument(
        "--ids",
        nargs="+",
        default=None,
        help="Problem ids to process (default: every problem in shared/problems).",
    )
    ap.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing solution_sentences (curated: true is still preserved).",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write any files.",
    )
    ap.add_argument(
        "--force-fallback",
        action="store_true",
        help="Skip DeepSeek entirely and always use the heuristic.",
    )
    ap.add_argument(
        "--require-deepseek",
        action="store_true",
        help="Fail (exit non-zero) if DEEPSEEK_API_KEY is missing or any call fails to reach DeepSeek.",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=1.2,
        help="Seconds to sleep between DeepSeek calls (default: 1.2).",
    )
    ap.add_argument(
        "--max-consecutive-errors",
        type=int,
        default=5,
        help="Abort after this many consecutive generation failures (default: 5).",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Stop after this many generations (0 = no limit).",
    )
    return ap.parse_args()


def main() -> int:
    args = _parse_args()

    if args.require_deepseek and not os.environ.get("DEEPSEEK_API_KEY"):
        print("error: --require-deepseek set but DEEPSEEK_API_KEY is empty", file=sys.stderr)
        return 2

    ids = args.ids or _discover_problem_ids()
    if not ids:
        print("no problem ids found")
        return 0

    totals = {"deepseek": 0, "heuristic": 0, "skipped": 0, "errors": 0}
    consecutive_errors = 0
    generated_so_far = 0

    for i, pid in enumerate(ids, start=1):
        prefix = f"[{i}/{len(ids)}] {pid}"
        try:
            result: GenerationResult = generate_for_problem(
                pid,
                overwrite=args.overwrite,
                dry_run=args.dry_run,
                force_fallback=args.force_fallback,
            )
        except FileNotFoundError as e:
            print(f"{prefix}  ! not found: {e}", file=sys.stderr)
            totals["errors"] += 1
            consecutive_errors += 1
        except Exception as e:  # pragma: no cover - defensive
            print(f"{prefix}  ! error: {e}", file=sys.stderr)
            totals["errors"] += 1
            consecutive_errors += 1
        else:
            consecutive_errors = 0
            totals[result.source] = totals.get(result.source, 0) + 1
            if result.source == "skipped":
                print(f"{prefix}  - skipped ({result.skip_reason})")
            else:
                count = result.sentences_count
                tag = "deepseek" if result.source == "deepseek" else "heuristic"
                print(f"{prefix}  + {tag}: {count} sentence(s){' (dry-run)' if args.dry_run else ''}")

                if args.require_deepseek and result.source != "deepseek":
                    print(
                        f"{prefix}  ! require-deepseek: produced heuristic output",
                        file=sys.stderr,
                    )
                    totals["errors"] += 1
                    return 3

                generated_so_far += 1
                if args.limit and generated_so_far >= args.limit:
                    print(f"stopping: --limit {args.limit} reached")
                    break

                # Only pause when we actually hit the network.
                if not args.force_fallback and result.source == "deepseek":
                    time.sleep(max(0.0, args.sleep))

        if consecutive_errors >= args.max_consecutive_errors:
            print(
                f"aborting: {consecutive_errors} consecutive errors",
                file=sys.stderr,
            )
            return 4

    print(
        "\nsummary: "
        f"deepseek={totals.get('deepseek', 0)}  "
        f"heuristic={totals.get('heuristic', 0)}  "
        f"skipped={totals.get('skipped', 0)}  "
        f"errors={totals.get('errors', 0)}"
    )
    return 0 if totals["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
