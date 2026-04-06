import pytest

from app.evaluator import evaluate_with_problem_id
from app.problems import ProblemLoadError


def test_two_sum_correct():
    code = """
def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        c = target - x
        if c in seen:
            return [seen[c], i]
        seen[x] = i
    return []
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "correct"
    assert ev.passed_visible_tests == ev.total_visible_tests
    assert ev.passed_hidden_tests == ev.total_hidden_tests
    assert all(v.passed for v in ev.visible_test_results)


def test_syntax_error():
    code = "def two_sum(nums, target):"
    ev = evaluate_with_problem_id(code, "two-sum")
    assert ev.status == "syntax_error"
    assert ev.syntax_ok is False


def test_incomplete_pass_only():
    code = """
def two_sum(nums, target):
    pass
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "incomplete"


def test_incomplete_not_implemented():
    code = """
def two_sum(nums, target):
    raise NotImplementedError("later")
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "incomplete"


def test_wrong_always():
    code = """
def two_sum(nums, target):
    return [0, 0]
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status in ("wrong", "partial", "runtime_error")


def test_normalize_order_two_sum():
    code = """
def two_sum(nums, target):
    # return reversed order vs tests — still ok
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [j, i]
    return []
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "correct"


def test_valid_anagram():
    code = """
def is_anagram(s, t):
    return sorted(s) == sorted(t)
"""
    ev = evaluate_with_problem_id(code.strip(), "valid-anagram")
    assert ev.status == "correct"


def test_safety_import_os():
    code = """
import os
def two_sum(nums, target):
    return [0,1]
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "runtime_error"
    assert "SafetyError" in (ev.error_type or "") or "not allowed" in (ev.error_message or "").lower()


def test_safety_relative_import():
    code = """
from . import foo
def two_sum(nums, target):
    return [0, 1]
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "runtime_error"
    assert "SafetyError" in (ev.error_type or "") or "relative" in (ev.error_message or "").lower()


def test_always_none_incomplete():
    code = """
def two_sum(nums, target):
    x = 1
    return None
"""
    ev = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "incomplete"


def test_evaluate_with_problem_id_problem_load_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(_pid: str) -> dict:
        raise ProblemLoadError("/fake/path.json", "file is not valid UTF-8")

    monkeypatch.setattr("app.evaluator.load_problem", boom)
    ev = evaluate_with_problem_id("def answer():\n    return 7", "any-id")
    assert ev.status == "internal_error"
    assert ev.error_type == "ProblemLoadError"
    assert "platform" in ev.likely_stage
