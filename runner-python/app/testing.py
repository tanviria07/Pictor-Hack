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


def normalize_expected(
    problem_id: str, got: Any, exp: Any, args: list[Any] | None = None
) -> bool:
    if problem_id == "two-sum" and args is not None and len(args) >= 2:
        nums, target = args[0], args[1]
        return verify_two_sum(nums, target, got)
    if problem_id == "top-k-frequent-elements":
        if not isinstance(got, (list, tuple)) or not isinstance(exp, (list, tuple)):
            return False
        return sorted(got) == sorted(exp)
    return got == exp
