"""Deterministic test comparison helpers (problem-specific semantics)."""

from __future__ import annotations

from typing import Any


def verify_two_sum(nums: list[Any], target: int, got: Any) -> bool:
    if not isinstance(got, (list, tuple)) or len(got) != 2:
        return False
    i, j = int(got[0]), int(got[1])
    if i == j or i < 0 or j < 0 or i >= len(nums) or j >= len(nums):
        return False
    return nums[i] + nums[j] == target


def _canonicalize_unordered(value: Any) -> Any:
    if isinstance(value, (list, tuple)):
        items = [_canonicalize_unordered(v) for v in value]
        return sorted(items, key=repr)
    if isinstance(value, dict):
        return {k: _canonicalize_unordered(v) for k, v in sorted(value.items())}
    return value


def normalize_expected(
    problem_id: str,
    got: Any,
    exp: Any,
    args: list[Any] | None = None,
    comparison: str = "",
) -> bool:
    if comparison == "codec_roundtrip_strings":
        if not isinstance(got, (list, tuple)) or len(got) < 3:
            return False
        return got[-1] == exp
    if comparison == "codec_roundtrip_tree":
        if not isinstance(got, (list, tuple)) or len(got) < 3:
            return False
        return got[-1] == exp
    if comparison == "mutates_first_arg":
        return got == exp
    if problem_id == "two-sum" and args is not None and len(args) >= 2:
        nums, target = args[0], args[1]
        return verify_two_sum(nums, target, got)
    if comparison == "unordered_list" or problem_id == "top-k-frequent-elements":
        if not isinstance(got, (list, tuple)) or not isinstance(exp, (list, tuple)):
            return False
        return sorted(got) == sorted(exp)
    if comparison == "unordered_nested_list":
        return _canonicalize_unordered(got) == _canonicalize_unordered(exp)
    return got == exp
