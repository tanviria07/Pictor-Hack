#!/usr/bin/env python3
"""
Scan problem JSON trees for strict UTF-8 and valid JSON.

Usage:
  python scripts/scan_problem_json_encoding.py
  python scripts/scan_problem_json_encoding.py --fix

With --fix: if a file decodes as Windows-1252 but not UTF-8, rewrites as UTF-8.
Does not modify valid UTF-8 files.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DEFAULT_DIRS = [
    ROOT / "shared" / "problems",
    ROOT / "runner-python" / "problems",
    ROOT / "backend-go" / "internal" / "problems" / "data",
]


def check_file(path: Path) -> tuple[str | None, str | None]:
    """
    Returns (None, None) if OK.
    Otherwise (category, message) where category is 'utf8' | 'json'.
    """
    try:
        raw = path.read_bytes()
    except OSError as e:
        return "read", str(e)

    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return "utf8", "not valid UTF-8"

    try:
        json.loads(text)
    except json.JSONDecodeError as e:
        return "json", str(e)

    return None, None


def try_fix_cp1252(path: Path) -> bool:
    raw = path.read_bytes()
    try:
        raw.decode("utf-8")
        return False
    except UnicodeDecodeError:
        pass
    try:
        text = raw.decode("cp1252")
    except UnicodeDecodeError:
        return False
    try:
        json.loads(text)
    except json.JSONDecodeError:
        return False
    path.write_bytes(text.encode("utf-8"))
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--fix",
        action="store_true",
        help="Rewrite CP1252-decodable files as UTF-8",
    )
    ap.add_argument(
        "dirs",
        nargs="*",
        help=f"Directories to scan (default: {len(DEFAULT_DIRS)} standard trees)",
    )
    args = ap.parse_args()
    dirs = [Path(p) for p in args.dirs] if args.dirs else DEFAULT_DIRS

    bad: list[tuple[Path, str, str]] = []
    fixed: list[Path] = []

    for base in dirs:
        if not base.is_dir():
            print(f"skip missing: {base}", file=sys.stderr)
            continue
        for path in sorted(base.rglob("*.json")):
            cat, msg = check_file(path)
            if cat is None:
                continue
            if cat == "utf8" and args.fix and try_fix_cp1252(path):
                fixed.append(path)
                cat, msg = check_file(path)
            if cat is not None:
                bad.append((path, cat, msg or ""))

    for p, cat, msg in bad:
        print(f"[{cat}] {p}: {msg}")

    if fixed:
        print(f"\nRewrote {len(fixed)} file(s) from CP1252 to UTF-8.")

    if bad:
        return 1
    print("All scanned JSON files are valid UTF-8 and parse as JSON.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
