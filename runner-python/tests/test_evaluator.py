from app.evaluator import evaluate_with_problem_id


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
    ev, vis = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "correct"
    assert ev.passed_visible_tests == ev.total_visible_tests
    assert ev.passed_hidden_tests == ev.total_hidden_tests
    assert all(v.passed for v in vis)


def test_syntax_error():
    code = "def two_sum(nums, target):"
    ev, _ = evaluate_with_problem_id(code, "two-sum")
    assert ev.status == "syntax_error"
    assert ev.syntax_ok is False


def test_incomplete_pass_only():
    code = """
def two_sum(nums, target):
    pass
"""
    ev, _ = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "incomplete"


def test_wrong_always():
    code = """
def two_sum(nums, target):
    return [0, 0]
"""
    ev, _ = evaluate_with_problem_id(code.strip(), "two-sum")
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
    ev, _ = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "correct"


def test_valid_anagram():
    code = """
def is_anagram(s, t):
    return sorted(s) == sorted(t)
"""
    ev, _ = evaluate_with_problem_id(code.strip(), "valid-anagram")
    assert ev.status == "correct"


def test_safety_import_os():
    code = """
import os
def two_sum(nums, target):
    return [0,1]
"""
    ev, _ = evaluate_with_problem_id(code.strip(), "two-sum")
    assert ev.status == "runtime_error"
    assert "SafetyError" in (ev.error_type or "") or "not allowed" in (ev.error_message or "").lower()
