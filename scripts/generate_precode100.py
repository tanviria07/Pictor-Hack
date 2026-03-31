#!/usr/bin/env python3
"""Generate 100 PreCode 100 problem JSON files. Run: python scripts/generate_precode100.py"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def hp(a: str, b: str, c: str, d: str) -> dict[str, str]:
    return {"level_1": a, "level_2": b, "level_3": c, "level_4": d}


def tests(*cases: tuple) -> list[dict]:
    """Each case is (args_tuple, expected) where args_tuple matches function arity."""
    out = []
    for args, exp in cases:
        if not isinstance(args, tuple):
            args = (args,)
        out.append({"args": list(args), "expected": exp})
    return out


def fn_problem(
    pid: str,
    title: str,
    category: str,
    difficulty: str,
    skills: list[str],
    tags: list[str],
    description: str,
    examples: list[dict],
    constraints: list[str],
    fn_name: str,
    params: list[dict],
    ret: str,
    starter: str,
    vis: list,
    hid: list,
    hints: dict[str, str],
    canon: str,
) -> dict:
    return {
        "id": pid,
        "slug": pid,
        "title": title,
        "difficulty": difficulty,
        "category": category,
        "description": description,
        "examples": examples,
        "constraints": constraints,
        "execution_mode": "function",
        "class_name": "",
        "function_name": fn_name,
        "starter_code": starter,
        "parameters": params,
        "expected_return_type": ret,
        "comparison": "",
        "visible_tests": vis,
        "hidden_tests": hid,
        "hint_plan": hints,
        "canonical_solution_summary": canon,
        "disallowed_full_solution_exposure": True,
        "skill_tags": skills,
        "tags": tags,
    }


def cls_problem(
    pid: str,
    title: str,
    category: str,
    difficulty: str,
    skills: list[str],
    tags: list[str],
    description: str,
    examples: list[dict],
    constraints: list[str],
    class_name: str,
    starter: str,
    params: list[dict],
    vis: list,
    hid: list,
    hints: dict[str, str],
    canon: str,
) -> dict:
    return {
        "id": pid,
        "slug": pid,
        "title": title,
        "difficulty": difficulty,
        "category": category,
        "description": description,
        "examples": examples,
        "constraints": constraints,
        "execution_mode": "class",
        "class_name": class_name,
        "function_name": class_name,
        "starter_code": starter,
        "parameters": params,
        "expected_return_type": "class",
        "comparison": "",
        "visible_tests": vis,
        "hidden_tests": hid,
        "hint_plan": hints,
        "canonical_solution_summary": canon,
        "disallowed_full_solution_exposure": True,
        "skill_tags": skills,
        "tags": tags,
    }


C = {
    "pb": "precode-python-basics",
    "cf": "precode-control-flow",
    "ds": "precode-core-data-structures",
    "sl": "precode-strings-lists",
    "dz": "precode-dicts-sets",
    "ps": "precode-problem-solving",
    "rc": "precode-recursion",
    "oo": "precode-oop-foundations",
    "op": "precode-oop-practice",
    "db": "precode-debugging",
}


def all_problems() -> list[dict]:
    o: list[dict] = []
    H = lambda *x: hp(*x)  # noqa: E731

    # === Python Basics (10) ===
    o.append(
        fn_problem(
            "precode-pb-01-return-seven",
            "Return Seven",
            C["pb"],
            "easy",
            ["variables", "functions"],
            ["precode", "basics"],
            "Define a function named `answer` with no parameters. It should **return** the integer `7`. "
            "In Python, `print` shows output to the user; `return` hands a value back to the caller—here we only need `return`.",
            [{"input": "answer()", "output": "7"}],
            ["The function name must be exactly `answer`."],
            "answer",
            [],
            "int",
            "def answer():\n    pass\n",
            tests(((), 7)),
            tests(((), 7)),
            H(
                "The tests call `answer()` and check the returned value.",
                "Use a `return` statement, not `print`.",
                "Return the integer 7: `return 7`.",
                "Run passes when visible and hidden checks agree with the reference behavior.",
            ),
            "return 7",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-02-sum-two-integers",
            "Sum Two Integers",
            C["pb"],
            "easy",
            ["functions", "arithmetic"],
            ["precode", "basics"],
            "Return the sum of `a` and `b`.",
            [{"input": "2, 3", "output": "5"}],
            [],
            "sum_two",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "int",
            "def sum_two(a, b):\n    pass\n",
            tests(((2, 3), 5), ((0, 0), 0)),
            tests(((100, -25), 75)),
            H("Add with `+`.", "Both parameters are integers.", "return a + b", "Works for negatives."),
            "return a + b",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-03-swap-pair",
            "Swap Pair Values",
            C["pb"],
            "easy",
            ["tuples", "functions"],
            ["precode", "basics"],
            "Return `(y, x)` so callers receive swapped values.",
            [{"input": "1, 2", "output": "(2, 1)"}],
            [],
            "swap_pair",
            [{"name": "x", "type": "int"}, {"name": "y", "type": "int"}],
            "Tuple[int, int]",
            "def swap_pair(x, y):\n    pass\n",
            tests(((1, 2), (2, 1)), ((0, 0), (0, 0))),
            tests(((9, -1), (-1, 9))),
            H("Return two values as a tuple.", "Order is (y, x).", "return (y, x)", "Tuple syntax uses commas."),
            "return (y, x)",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-04-int-to-string",
            "Integer to String",
            C["pb"],
            "easy",
            ["strings", "types"],
            ["precode", "basics"],
            "Convert `n` to its decimal string with `str`.",
            [{"input": "42", "output": "'42'"}],
            [],
            "int_to_str",
            [{"name": "n", "type": "int"}],
            "str",
            "def int_to_str(n):\n    pass\n",
            tests((0, "0"), (-3, "-3")),
            tests((1001, "1001")),
            H("Built-in str converts numbers.", "Call str on n.", "return str(n)", ""),
            "str(n)",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-05-string-to-int",
            "String to Integer",
            C["pb"],
            "easy",
            ["strings", "types"],
            ["precode", "basics"],
            "Parse valid integer string `s` with `int`.",
            [{"input": "'12'", "output": "12"}],
            [],
            "str_to_int",
            [{"name": "s", "type": "str"}],
            "int",
            "def str_to_int(s):\n    pass\n",
            tests(("0", 0), ("-7", -7)),
            tests(("404", 404)),
            H("int() parses integer strings.", "return int(s)", "", ""),
            "int(s)",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-06-even-or-odd",
            "Even or Odd Label",
            C["pb"],
            "easy",
            ["conditionals", "arithmetic"],
            ["precode", "basics"],
            "Return `'even'` or `'odd'` for integer `n`.",
            [{"input": "4", "output": "'even'"}],
            [],
            "even_or_odd",
            [{"name": "n", "type": "int"}],
            "str",
            "def even_or_odd(n):\n    pass\n",
            tests((4, "even"), (7, "odd")),
            tests((0, "even"), (-2, "even")),
            H("Use n % 2.", "Zero is even.", "Compare remainder to 0.", ""),
            "n % 2 == 0",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-07-sign",
            "Sign of a Number",
            C["pb"],
            "easy",
            ["conditionals"],
            ["precode", "basics"],
            "Return -1, 0, or 1 for negative, zero, or positive `n`.",
            [{"input": "-4", "output": "-1"}],
            [],
            "sign",
            [{"name": "n", "type": "int"}],
            "int",
            "def sign(n):\n    pass\n",
            tests((-5, -1), (0, 0), (3, 1)),
            tests((100, 1)),
            H("Compare to zero.", "Three branches.", "", ""),
            "cmp-style sign",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-08-absolute-difference",
            "Absolute Difference",
            C["pb"],
            "easy",
            ["arithmetic", "functions"],
            ["precode", "basics"],
            "Return |a - b|.",
            [{"input": "3, 8", "output": "5"}],
            [],
            "abs_diff",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "int",
            "def abs_diff(a, b):\n    pass\n",
            tests(((3, 8), 5), ((8, 3), 5)),
            tests(((-4, -9), 5)),
            H("abs built-in.", "abs(a - b)", "", ""),
            "abs(a-b)",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-09-integer-average",
            "Integer Average",
            C["pb"],
            "easy",
            ["arithmetic"],
            ["precode", "basics"],
            "Return floor average `(a + b) // 2`.",
            [{"input": "3,4", "output": "3"}],
            [],
            "int_avg",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "int",
            "def int_avg(a, b):\n    pass\n",
            tests(((3, 4), 3), ((5, 5), 5)),
            tests(((0, 1), 0)),
            H("Integer division //", "", "", ""),
            "(a+b)//2",
        )
    )
    o.append(
        fn_problem(
            "precode-pb-10-clamp",
            "Clamp to Inclusive Range",
            C["pb"],
            "easy",
            ["conditionals"],
            ["precode", "basics"],
            "Keep `x` inside the inclusive range `[lo, hi]`: if `x < lo` return `lo`, if `x > hi` return `hi`, else return `x`.",
            [{"input": "x=5, lo=0, hi=10", "output": "5"}],
            ["Assume lo <= hi."],
            "clamp",
            [
                {"name": "x", "type": "int"},
                {"name": "lo", "type": "int"},
                {"name": "hi", "type": "int"},
            ],
            "int",
            "def clamp(x, lo, hi):\n    pass\n",
            tests(((5, 0, 10), 5), ((-1, 0, 3), 0)),
            tests(((3, 3, 3), 3)),
            H("min/max trick or if/elif.", "", "", ""),
            "clamp",
        )
    )

    # Control flow (10)
    o.append(
        fn_problem(
            "precode-cf-01-max-of-three",
            "Maximum of Three",
            C["cf"],
            "easy",
            ["conditionals", "functions"],
            ["precode", "control-flow"],
            "Return the largest of `a`, `b`, `c`.",
            [{"input": "1,2,3", "output": "3"}],
            [],
            "max_of_three",
            [
                {"name": "a", "type": "int"},
                {"name": "b", "type": "int"},
                {"name": "c", "type": "int"},
            ],
            "int",
            "def max_of_three(a, b, c):\n    pass\n",
            tests(((1, 2, 3), 3), ((9, 1, 2), 9)),
            tests(((-1, -2, -3), -1)),
            H("Use max(a,b,c).", "", "", ""),
            "max",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-02-letter-grade",
            "Letter Grade",
            C["cf"],
            "easy",
            ["conditionals"],
            ["precode", "control-flow"],
            "Map a score from 0–100 to a letter grade: A≥90, B≥80, C≥70, D≥60, else F.",
            [{"input": "92", "output": "'A'"}],
            [],
            "letter_grade",
            [{"name": "score", "type": "int"}],
            "str",
            "def letter_grade(score):\n    pass\n",
            tests((95, "A"), (80, "B"), (70, "C"), (60, "D"), (0, "F")),
            tests((100, "A"), (59, "F")),
            H("Chain elif by score.", "", "", ""),
            "thresholds",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-03-calculator",
            "Four-Function Calculator",
            C["cf"],
            "easy",
            ["conditionals", "strings"],
            ["precode", "control-flow"],
            "`op` is '+', '-', '*', or '//'. Use integer division for '//'; `b` is never 0.",
            [{"input": "6,2,'//'", "output": "3"}],
            [],
            "calculate",
            [
                {"name": "a", "type": "int"},
                {"name": "b", "type": "int"},
                {"name": "op", "type": "str"},
            ],
            "int",
            "def calculate(a, b, op):\n    pass\n",
            tests(((2, 3, "+"), 5), ((10, 2, "//"), 5)),
            tests(((4, 5, "*"), 20)),
            H("if/elif on op string.", "", "", ""),
            "dispatch",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-04-leap-year",
            "Leap Year",
            C["cf"],
            "easy",
            ["conditionals"],
            ["precode", "control-flow"],
            "A year is a leap year in the Gregorian calendar if it is divisible by 4, except years divisible by 100, "
            "unless also divisible by 400. Return whether `year` is a leap year.",
            [{"input": "2000", "output": "True"}],
            [],
            "is_leap_year",
            [{"name": "year", "type": "int"}],
            "bool",
            "def is_leap_year(year):\n    pass\n",
            tests((2000, True), (1900, False), (2024, True)),
            tests((2023, False)),
            H("Divisible by 4, 100, 400.", "", "", ""),
            "leap rules",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-05-count-divisors",
            "Count Divisors",
            C["cf"],
            "easy",
            ["loops", "functions"],
            ["precode", "control-flow"],
            "Count how many integers `d` from 1 through `n` divide `n` evenly (`n % d == 0`).",
            [{"input": "6", "output": "4"}],
            ["n >= 1"],
            "count_divisors",
            [{"name": "n", "type": "int"}],
            "int",
            "def count_divisors(n):\n    pass\n",
            tests((6, 4), (7, 2)),
            tests((12, 6)),
            H("Loop 1..n.", "", "", ""),
            "loop",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-06-sum-to-n",
            "Sum 1 Through N",
            C["cf"],
            "easy",
            ["loops", "arithmetic"],
            ["precode", "control-flow"],
            "Return the sum 1 + 2 + … + `n` for `n >= 1` (triangular number).",
            [{"input": "5", "output": "15"}],
            ["n >= 1"],
            "sum_to_n",
            [{"name": "n", "type": "int"}],
            "int",
            "def sum_to_n(n):\n    pass\n",
            tests((1, 1), (5, 15)),
            tests((100, 5050)),
            H("Loop or formula.", "", "", ""),
            "sum",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-07-factorial-iterative",
            "Factorial Iterative",
            C["cf"],
            "easy",
            ["loops"],
            ["precode", "control-flow"],
            "Return `n` factorial (`n!`) for `0 <= n <= 12`. Use a loop (no recursion here).",
            [{"input": "5", "output": "120"}],
            [],
            "fact_iter",
            [{"name": "n", "type": "int"}],
            "int",
            "def fact_iter(n):\n    pass\n",
            tests((0, 1), (5, 120)),
            tests((7, 5040)),
            H("Product loop.", "", "", ""),
            "iterative factorial",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-08-divisible-by",
            "Evenly Divisible",
            C["cf"],
            "easy",
            ["conditionals", "arithmetic"],
            ["precode", "control-flow"],
            "Return `True` if `n` is evenly divisible by `k` (remainder zero: `n % k == 0`). "
            "Assume `k > 0`. Note: `0` is divisible by any positive `k`.",
            [{"input": "10, 2", "output": "True"}],
            ["k > 0"],
            "is_divisible",
            [{"name": "n", "type": "int"}, {"name": "k", "type": "int"}],
            "bool",
            "def is_divisible(n, k):\n    pass\n",
            tests(((10, 2), True), ((10, 3), False), ((0, 5), True)),
            tests(((25, 5), True)),
            H(
                "Divisibility means remainder 0 when you divide.",
                "The operator `%` gives the remainder.",
                "Return whether `n % k == 0`.",
                "Think about why 0 % k is 0 for positive k.",
            ),
            "n % k == 0",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-09-fizzbuzz-value",
            "FizzBuzz Single",
            C["cf"],
            "easy",
            ["conditionals"],
            ["precode", "control-flow"],
            "For a positive integer `n`, return a string: `\"fizzbuzz\"` if divisible by 15, `\"fizz\"` by 3, "
            "`\"buzz\"` by 5, otherwise the decimal string of `n` (e.g. `\"7\"`).",
            [{"input": "15", "output": "'fizzbuzz'"}],
            ["n >= 1"],
            "fizzbuzz_value",
            [{"name": "n", "type": "int"}],
            "str",
            "def fizzbuzz_value(n):\n    pass\n",
            tests((3, "fizz"), (5, "buzz"), (15, "fizzbuzz"), (7, "7")),
            tests((30, "fizzbuzz")),
            H("Check 15 first.", "", "", ""),
            "fizzbuzz",
        )
    )
    o.append(
        fn_problem(
            "precode-cf-10-digit-sum",
            "Sum of Decimal Digits",
            C["cf"],
            "easy",
            ["loops", "strings"],
            ["precode", "control-flow"],
            "Sum the decimal digits of a non-negative integer `n` (e.g. 123 → 1+2+3).",
            [{"input": "123", "output": "6"}],
            [],
            "digit_sum",
            [{"name": "n", "type": "int"}],
            "int",
            "def digit_sum(n):\n    pass\n",
            tests((0, 0), (123, 6)),
            tests((999, 27)),
            H("str(n) or modulo.", "", "", ""),
            "digit sum",
        )
    )

    # Core data structures (10)
    o.append(
        fn_problem(
            "precode-ds-01-range-list",
            "Build Range List",
            C["ds"],
            "easy",
            ["lists"],
            ["precode", "data-structures"],
            "Return a list `[0, 1, …, n - 1]` for `n >= 0` (empty list when `n` is 0).",
            [{"input": "3", "output": "[0,1,2]"}],
            [],
            "range_list",
            [{"name": "n", "type": "int"}],
            "List[int]",
            "def range_list(n):\n    pass\n",
            tests((3, [0, 1, 2]), (0, [])),
            tests((1, [0])),
            H("list(range(n))", "", "", ""),
            "range",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-02-last-item",
            "Last List Element",
            C["ds"],
            "easy",
            ["lists"],
            ["precode", "data-structures"],
            "Return the last element of non-empty `items`.",
            [{"input": "[1,2,3]", "output": "3"}],
            ["len(items) >= 1"],
            "last_item",
            [{"name": "items", "type": "List[int]"}],
            "int",
            "def last_item(items):\n    pass\n",
            tests(([1, 2, 3], 3), ([0], 0)),
            tests(([9, 8], 8)),
            H("items[-1]", "", "", ""),
            "last",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-03-list-sum",
            "Sum a List",
            C["ds"],
            "easy",
            ["lists", "loops"],
            ["precode", "data-structures"],
            "Return the sum of all integers in `nums` (empty list sums to `0`).",
            [{"input": "[1,2,3]", "output": "6"}],
            [],
            "list_sum",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def list_sum(nums):\n    pass\n",
            tests(([1, 2, 3], 6), ([], 0)),
            tests(([5, 5, 5], 15)),
            H("sum(nums) or loop.", "", "", ""),
            "sum",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-04-dict-get",
            "Dictionary Get",
            C["ds"],
            "easy",
            ["dictionaries"],
            ["precode", "data-structures"],
            "Return `d.get(k, default)` — the value for `k` if present, otherwise `default`.",
            [{"input": "d={'a':1}, k='a', default=0", "output": "1"}],
            [],
            "dict_get",
            [
                {"name": "d", "type": "dict"},
                {"name": "k", "type": "str"},
                {"name": "default", "type": "int"},
            ],
            "int",
            "def dict_get(d, k, default):\n    pass\n",
            tests((({"a": 1}, "a", 0), 1), (({}, "x", -1), -1)),
            tests((({"z": 9}, "z", 0), 9)),
            H("Use .get", "", "", ""),
            "get",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-05-unique-count",
            "Unique Count",
            C["ds"],
            "easy",
            ["sets", "lists"],
            ["precode", "data-structures"],
            "Return how many **different** integers appear in `nums` (duplicates count once).",
            [{"input": "[1,1,2]", "output": "2"}],
            [],
            "unique_count",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def unique_count(nums):\n    pass\n",
            tests(([1, 1, 2], 2), ([], 0)),
            tests(([3, 3, 3], 1)),
            H("len(set(nums))", "", "", ""),
            "set",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-06-increment-all",
            "Increment All Elements",
            C["ds"],
            "easy",
            ["lists"],
            ["precode", "data-structures"],
            "Return a **new** list where each number is one greater than in `nums` (do not mutate the input list).",
            [{"input": "[0,1]", "output": "[1,2]"}],
            [],
            "increment_all",
            [{"name": "nums", "type": "List[int]"}],
            "List[int]",
            "def increment_all(nums):\n    pass\n",
            tests(([0, 1], [1, 2]), ([], [])),
            tests(([-1], [0])),
            H("List comprehension or loop.", "", "", ""),
            "map +1",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-07-merge-lists",
            "Merge Two Lists",
            C["ds"],
            "easy",
            ["lists"],
            ["precode", "data-structures"],
            "Return one list containing every element of `a` followed by every element of `b` (list concatenation).",
            [{"input": "[1],[2]", "output": "[1,2]"}],
            [],
            "merge_lists",
            [{"name": "a", "type": "List[int]"}, {"name": "b", "type": "List[int]"}],
            "List[int]",
            "def merge_lists(a, b):\n    pass\n",
            tests((([], [1]), [1]), (([1, 2], [3]), [1, 2, 3])),
            tests((([], []), [])),
            H("Use + on lists.", "", "", ""),
            "concat",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-08-in-both",
            "Value In Both Lists",
            C["ds"],
            "easy",
            ["lists"],
            ["precode", "data-structures"],
            "Return `True` if `x` appears in **both** `a` and `b`, otherwise `False`.",
            [{"input": "2,[2,3],[1,2]", "output": "True"}],
            [],
            "in_both",
            [
                {"name": "x", "type": "int"},
                {"name": "a", "type": "List[int]"},
                {"name": "b", "type": "List[int]"},
            ],
            "bool",
            "def in_both(x, a, b):\n    pass\n",
            tests(((2, [2, 3], [1, 2]), True), ((1, [2], [3]), False)),
            tests(((0, [0], [0]), True)),
            H("in operator", "", "", ""),
            "membership",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-09-nested-sum",
            "Sum Nested One Level",
            C["ds"],
            "medium",
            ["lists", "loops"],
            ["precode", "data-structures"],
            "`nested` is a list of lists of integers (one level of nesting). Return the sum of every integer inside.",
            [{"input": "[[1,2],[3]]", "output": "6"}],
            [],
            "nested_sum",
            [{"name": "nested", "type": "List"}],
            "int",
            "def nested_sum(nested):\n    pass\n",
            tests(([[1, 2], [3]], 6), ([[]], 0)),
            tests(([[0]], 0)),
            H("Double loop or extend.", "", "", ""),
            "nested",
        )
    )
    o.append(
        fn_problem(
            "precode-ds-10-count-occurrences",
            "Count Value Occurrences",
            C["ds"],
            "easy",
            ["lists", "loops"],
            ["precode", "data-structures"],
            "Return how many times `x` appears in `nums`.",
            [{"input": "[1,1,2],1", "output": "2"}],
            [],
            "count_occurrences",
            [{"name": "nums", "type": "List[int]"}, {"name": "x", "type": "int"}],
            "int",
            "def count_occurrences(nums, x):\n    pass\n",
            tests((([1, 1, 2], 1), 2), (([], 5), 0)),
            tests((([3, 3, 3], 3), 3)),
            H("Loop or .count", "", "", ""),
            "count",
        )
    )

    # Strings & lists (10) — explicit
    o.extend(
        _strings_lists(C, H)
    )

    # Dictionaries & sets (10)
    o.extend(_dicts_sets(C, H))

    # Problem solving (10)
    o.extend(_problem_solving(C, H))

    # Recursion (10)
    o.extend(_recursion(C, H))

    # OOP foundations (10)
    o.extend(_oop_foundations(C, H))

    # OOP practice (10)
    o.extend(_oop_practice(C, H))

    # Debugging (10)
    o.extend(_debugging(C, H))

    assert len(o) == 100, len(o)
    return o


def _strings_lists(C: dict, H) -> list[dict]:
    """10 string/list problems."""
    r = []
    r.append(
        fn_problem(
            "precode-sl-01-reverse-string",
            "Reverse String",
            C["sl"],
            "easy",
            ["strings", "slicing"],
            ["precode", "strings-lists"],
            "Return `s` reversed.",
            [{"input": "ab", "output": "ba"}],
            [],
            "reverse_string",
            [{"name": "s", "type": "str"}],
            "str",
            "def reverse_string(s):\n    pass\n",
            tests(("ab", "ba"), ("", "")),
            tests(("hello", "olleh")),
            H("Slicing with step -1.", "", "", ""),
            "s[::-1]",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-02-count-vowels",
            "Count Vowels",
            C["sl"],
            "easy",
            ["strings", "loops"],
            ["precode", "strings-lists"],
            "Count letters in aeiou (case-insensitive).",
            [{"input": "hello", "output": "2"}],
            [],
            "count_vowels",
            [{"name": "s", "type": "str"}],
            "int",
            "def count_vowels(s):\n    pass\n",
            tests(("hello", 2), ("AEIOU", 5)),
            tests(("", 0)),
            H("Lowercase s and count chars in a set.", "", "", ""),
            "count vowels",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-03-remove-spaces",
            "Remove Spaces",
            C["sl"],
            "easy",
            ["strings"],
            ["precode", "strings-lists"],
            "Remove every space character from `s`.",
            [{"input": "a b", "output": "ab"}],
            [],
            "remove_spaces",
            [{"name": "s", "type": "str"}],
            "str",
            "def remove_spaces(s):\n    pass\n",
            tests(("a b", "ab"), ("  ", "")),
            tests(("x y z", "xyz")),
            H("Replace or join split parts.", "", "", ""),
            "no spaces",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-04-is-title-word",
            "Title Case Single Word",
            C["sl"],
            "easy",
            ["strings", "conditionals"],
            ["precode", "strings-lists"],
            "True if non-empty, first char upper, remaining chars lower.",
            [{"input": "Hello", "output": "True"}],
            [],
            "is_title_word",
            [{"name": "s", "type": "str"}],
            "bool",
            "def is_title_word(s):\n    pass\n",
            tests(("Hello", True), ("hello", False), ("Hi", True)),
            tests(("A", True)),
            H("Index into s; use isupper/islower.", "", "", ""),
            "check pattern",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-05-is-palindrome",
            "String Palindrome",
            C["sl"],
            "easy",
            ["strings"],
            ["precode", "strings-lists"],
            "True if `s` reads the same forwards and backwards.",
            [{"input": "aba", "output": "True"}],
            [],
            "is_palindrome",
            [{"name": "s", "type": "str"}],
            "bool",
            "def is_palindrome(s):\n    pass\n",
            tests(("aba", True), ("ab", False), ("", True)),
            tests(("racecar", True)),
            H("Compare to reverse.", "", "", ""),
            "palindrome",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-06-rotate-left-one",
            "Rotate Left By One",
            C["sl"],
            "easy",
            ["lists"],
            ["precode", "strings-lists"],
            "Move first element to the end; `[]` stays `[]`.",
            [{"input": "[1,2,3]", "output": "[2,3,1]"}],
            [],
            "rotate_left_one",
            [{"name": "nums", "type": "List[int]"}],
            "List[int]",
            "def rotate_left_one(nums):\n    pass\n",
            tests(([1, 2, 3], [2, 3, 1]), ([], [])),
            tests(([9], [9])),
            H("Slice and concatenate.", "", "", ""),
            "rotate",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-07-second-largest",
            "Second Largest Value",
            C["sl"],
            "medium",
            ["lists"],
            ["precode", "strings-lists"],
            "Return second largest distinct value (len >= 2).",
            [{"input": "[1,2,3,4]", "output": "3"}],
            [],
            "second_largest",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def second_largest(nums):\n    pass\n",
            tests(([1, 2, 3, 4], 3), ([10, 20], 10)),
            tests(([5, 1, 5, 2], 2)),
            H("Sort unique or track max and second.", "", "", ""),
            "second max",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-08-flatten-once",
            "Flatten One Level",
            C["sl"],
            "easy",
            ["lists"],
            ["precode", "strings-lists"],
            "Concatenate inner lists left to right.",
            [{"input": "[[1],[2,3]]", "output": "[1,2,3]"}],
            [],
            "flatten_once",
            [{"name": "nested", "type": "List"}],
            "List[int]",
            "def flatten_once(nested):\n    pass\n",
            tests(([[1], [2, 3]], [1, 2, 3]), ([], [])),
            tests(([[], [1]], [1])),
            H("Loop and extend.", "", "", ""),
            "flatten",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-09-starts-with",
            "Starts With Prefix",
            C["sl"],
            "easy",
            ["strings"],
            ["precode", "strings-lists"],
            "True if `s` starts with `p` (use string startswith or manual).",
            [{"input": "hello, he", "output": "True"}],
            [],
            "starts_with",
            [{"name": "s", "type": "str"}, {"name": "p", "type": "str"}],
            "bool",
            "def starts_with(s, p):\n    pass\n",
            tests((("hello", "he"), True), (("abc", "x"), False)),
            tests((("", ""), True)),
            H("startswith method.", "", "", ""),
            "prefix",
        )
    )
    r.append(
        fn_problem(
            "precode-sl-10-count-sub-nonoverlap",
            "Count Non-Overlapping Substrings",
            C["sl"],
            "medium",
            ["strings"],
            ["precode", "strings-lists"],
            "Count how many times `sub` appears in `s` **without overlaps**: after each match, continue searching **after** the end of that match.",
            [{"input": "aaaa, aa", "output": "2"}],
            [],
            "count_sub",
            [{"name": "s", "type": "str"}, {"name": "sub", "type": "str"}],
            "int",
            "def count_sub(s, sub):\n    pass\n",
            tests((("aaaa", "aa"), 2), (("abc", "x"), 0)),
            tests((("", "a"), 0)),
            H("If sub empty, define as 0.", "", "", ""),
            "count",
        )
    )
    return r


def _dicts_sets(C: dict, H) -> list[dict]:
    """Dictionaries & sets: each problem has concrete examples and tiered hints."""
    r = []
    rows: list[dict] = [
        {
            "pid": "precode-dz-01-char-frequency",
            "title": "Character Frequency Map",
            "difficulty": "easy",
            "desc": "Build a dictionary: each distinct character in `s` maps to how many times it appears.",
            "examples": [{"input": '"aba"', "output": "{'a': 2, 'b': 1}"}],
            "constraints": [],
            "fn": "char_frequency",
            "params": [{"name": "s", "type": "str"}],
            "ret": "dict",
            "starter": "def char_frequency(s):\n    pass\n",
            "vis": tests(("aba", {"a": 2, "b": 1}), ("", {})),
            "hid": tests(("aaa", {"a": 3})),
            "skills": ["dictionaries", "strings"],
            "canon": "freq",
            "hints": H(
                "Count letters as you scan the string.",
                "A dict maps key → count; start each key at 0 or use .get.",
                "For each character: `counts[ch] = counts.get(ch, 0) + 1`.",
                "Empty string → empty dict.",
            ),
        },
        {
            "pid": "precode-dz-02-first-unique-char-index",
            "title": "First Unique Character Index",
            "difficulty": "medium",
            "desc": "Return the smallest index of a character that appears exactly once in `s`. If none, return `-1`.",
            "examples": [{"input": '"aabbc"', "output": "4"}],
            "constraints": [],
            "fn": "first_unique_index",
            "params": [{"name": "s", "type": "str"}],
            "ret": "int",
            "starter": "def first_unique_index(s):\n    pass\n",
            "vis": tests(("aabbc", 4), ("aabb", -1)),
            "hid": tests(("a", 0)),
            "skills": ["dictionaries"],
            "canon": "unique",
            "hints": H(
                "Count frequencies first, then scan indices in order.",
                "Two passes: build counts, then find first `i` with count 1.",
                "If you only scan once, remember: later duplicates can invalidate earlier uniqueness.",
                "Return -1 when no character appears exactly once.",
            ),
        },
        {
            "pid": "precode-dz-03-intersection-size",
            "title": "Set Intersection Size",
            "difficulty": "easy",
            "desc": "Return how many **different** integers appear in **both** lists (repeats in one list do not add extra matches).",
            "examples": [{"input": "[1,2,3], [2,4]", "output": "1"}],
            "constraints": [],
            "fn": "intersection_count",
            "params": [
                {"name": "a", "type": "List[int]"},
                {"name": "b", "type": "List[int]"},
            ],
            "ret": "int",
            "starter": "def intersection_count(a, b):\n    pass\n",
            "vis": tests((([1, 2, 3], [2, 4]), 1), (([], [1]), 0)),
            "hid": tests((([5, 5], [5]), 1)),
            "skills": ["sets"],
            "canon": "intersection",
            "hints": H(
                "Distinct values in both lists mean: set(a) ∩ set(b).",
                "len(set(a) & set(b)) or manual membership checks.",
                "Duplicates in one list do not increase the count.",
                "Empty intersection → 0.",
            ),
        },
        {
            "pid": "precode-dz-04-dedupe-preserve-order",
            "title": "Deduplicate Words",
            "difficulty": "easy",
            "desc": "Split `sentence` on spaces. Return a list of words in **first-seen** order, skipping later duplicates.",
            "examples": [{"input": '"a a b"', "output": "['a', 'b']"}],
            "constraints": ['Words are separated by whitespace; ignore empty tokens from `split()`.'],
            "fn": "dedupe_words",
            "params": [{"name": "sentence", "type": "str"}],
            "ret": "List[str]",
            "starter": "def dedupe_words(sentence):\n    pass\n",
            "vis": tests(("a a b", ["a", "b"]), ("", [])),
            "hid": tests(("x y x", ["x", "y"])),
            "skills": ["lists", "dictionaries"],
            "canon": "dedupe",
            "hints": H(
                "`sentence.split()` gives tokens; skip repeats.",
                "Track seen words in a set or dict while building the result list.",
                "Only append when the word is new.",
                "Strip runs of spaces: split handles multiple spaces if you split on whitespace.",
            ),
        },
        {
            "pid": "precode-dz-05-histogram-bars",
            "title": "Bar Histogram String",
            "difficulty": "medium",
            "desc": "Given `counts` mapping character keys to positive integers, return one line per key: `key:` + that many `#` characters. "
            "Sort keys **lexicographically**. Join lines with a single newline `\\n`. Empty dict → empty string.",
            "examples": [{"input": "{'a':2,'b':1}", "output": "'a:##\\nb:#'"}],
            "constraints": [],
            "fn": "histogram_lines",
            "params": [{"name": "counts", "type": "dict"}],
            "ret": "str",
            "starter": "def histogram_lines(counts):\n    pass\n",
            "vis": tests(({"a": 2, "b": 1}, "a:##\nb:#"), ({}, "")),
            "hid": tests(({"z": 3}, "z:###")),
            "skills": ["strings", "dictionaries"],
            "canon": "hist",
            "hints": H(
                "Iterate sorted keys, build line `k + ':' + '#' * n`.",
                "Join with `\\n`.",
                "Watch for off-by-one in the number of `#` symbols.",
                "Empty dict: return `''`.",
            ),
        },
        {
            "pid": "precode-dz-06-group-by-first-letter",
            "title": "Group By First Letter",
            "difficulty": "easy",
            "desc": "Group each word by the **first character** of the word (use that character as the dict key). "
            "Preserve the order of words within each group as they appear in the input list.",
            "examples": [
                {
                    "input": "['apple', 'bat', 'berry']",
                    "output": "{'a': ['apple'], 'b': ['bat', 'berry']}",
                }
            ],
            "constraints": [],
            "fn": "group_by_first_letter",
            "params": [{"name": "words", "type": "List[str]"}],
            "ret": "dict",
            "starter": "def group_by_first_letter(words):\n    pass\n",
            "vis": tests(
                (["apple", "bat", "berry"], {"a": ["apple"], "b": ["bat", "berry"]}),
                ([], {}),
            ),
            "hid": tests((["x"], {"x": ["x"]})),
            "skills": ["dictionaries", "strings"],
            "canon": "group",
            "hints": H(
                "For each word, key = first character (word[0]).",
                "Append the full word to `groups[key]` (default empty list).",
                "If `words` is empty, return `{}`.",
                "Single-letter words still map under that letter.",
            ),
        },
        {
            "pid": "precode-dz-07-two-sum-brute",
            "title": "Pair Indices For Target Sum",
            "difficulty": "medium",
            "desc": "You have a list of integers `nums` and a `target`. Return indices `[i, j]` with `i < j` such that "
            "`nums[i] + nums[j] == target`. If no such pair exists, return `[]`. "
            "If several pairs work, return the first one found when you try `i` from left to right, then `j` after `i`.",
            "examples": [{"input": "[2,7,11,15], 9", "output": "[0, 1]"}],
            "constraints": [],
            "fn": "two_sum_brute",
            "params": [
                {"name": "nums", "type": "List[int]"},
                {"name": "target", "type": "int"},
            ],
            "ret": "List[int]",
            "starter": "def two_sum_brute(nums, target):\n    pass\n",
            "vis": tests((([2, 7, 11, 15], 9), [0, 1]), (([1, 1], 2), [0, 1])),
            "hid": tests((([1, 2], 5), [])),
            "skills": ["lists", "loops"],
            "canon": "brute",
            "hints": H(
                "Use nested loops: for each `i`, try `j` with `j > i`.",
                "Return as soon as you find a pair that sums to `target`.",
                "You only need plain loops here—focus on correct bounds and early exit.",
                "Return `[]` when no pair works.",
            ),
        },
        {
            "pid": "precode-dz-08-word-count",
            "title": "Word Count",
            "difficulty": "easy",
            "desc": "Count how many words `s` contains. Words are non-empty tokens separated by whitespace.",
            "examples": [{"input": '"hello world"', "output": "2"}],
            "constraints": [],
            "fn": "word_count",
            "params": [{"name": "s", "type": "str"}],
            "ret": "int",
            "starter": "def word_count(s):\n    pass\n",
            "vis": tests(("hello world", 2), ("", 0)),
            "hid": tests(("  a  b  ", 2)),
            "skills": ["strings"],
            "canon": "split",
            "hints": H(
                "`split()` with no argument splits on any whitespace.",
                "Filter empty strings if you split manually.",
                "Empty or whitespace-only input → 0 words.",
                "Trim leading/trailing spaces mentally: split handles it.",
            ),
        },
        {
            "pid": "precode-dz-09-key-with-max-value",
            "title": "Key With Maximum Value",
            "difficulty": "medium",
            "desc": "Given `d` mapping string keys to integers, return the key whose value is largest. "
            "If several keys tie for the maximum, return the key that is **smallest lexicographically** (alphabetical order).",
            "examples": [{"input": "{'a':1,'b':2}", "output": "'b'"}],
            "constraints": ["Assume `d` is non-empty."],
            "fn": "max_key",
            "params": [{"name": "d", "type": "dict"}],
            "ret": "str",
            "starter": "def max_key(d):\n    pass\n",
            "vis": tests(({"a": 1, "b": 2}, "b"), ({"x": 5}, "x")),
            "hid": tests(({"m": 1, "a": 1}, "a")),
            "skills": ["dictionaries"],
            "canon": "max key",
            "hints": H(
                "Track best key and best value while iterating items.",
                "On a tie in value, keep the smaller key (lexicographic `min`).",
                "You can also sort keys and pick the first that satisfies max value.",
                "Single entry: return that key.",
            ),
        },
        {
            "pid": "precode-dz-10-set-symmetric-size",
            "title": "Symmetric Difference Size",
            "difficulty": "easy",
            "desc": "Count how many **distinct** integers appear in exactly one of the two lists (elements in `a` or `b` but not in both).",
            "examples": [{"input": "[1,2], [2,3]", "output": "2"}],
            "constraints": [],
            "fn": "symmetric_diff_count",
            "params": [
                {"name": "a", "type": "List[int]"},
                {"name": "b", "type": "List[int]"},
            ],
            "ret": "int",
            "starter": "def symmetric_diff_count(a, b):\n    pass\n",
            "vis": tests((([1, 2], [2, 3]), 2), (([], []), 0)),
            "hid": tests((([1], [1]), 0)),
            "skills": ["sets"],
            "canon": "symdiff",
            "hints": H(
                "Symmetric difference of sets: `set(a) ^ set(b)` or union minus intersection.",
                "Count distinct elements in exactly one set.",
                "Duplicates in one list do not change the distinct-element set.",
                "Equal multisets as sets → 0.",
            ),
        },
    ]
    for row in rows:
        diff = row["difficulty"]
        r.append(
            fn_problem(
                row["pid"],
                row["title"],
                C["dz"],
                diff,
                row["skills"],
                ["precode", "dicts-sets"],
                row["desc"],
                row["examples"],
                row["constraints"],
                row["fn"],
                row["params"],
                row["ret"],
                row["starter"],
                row["vis"],
                row["hid"],
                row["hints"],
                row["canon"],
            )
        )
    return r


def _problem_solving(C: dict, H) -> list[dict]:
    r = []
    def _fb_row(n: int) -> list[str]:
        out = []
        for i in range(1, n + 1):
            if i % 15 == 0:
                out.append("fizzbuzz")
            elif i % 3 == 0:
                out.append("fizz")
            elif i % 5 == 0:
                out.append("buzz")
            else:
                out.append(str(i))
        return out

    fb15 = _fb_row(15)
    r.append(
        fn_problem(
            "precode-ps-01-fizzbuzz-list",
            "FizzBuzz List To N",
            C["ps"],
            "easy",
            ["loops", "conditionals"],
            ["precode", "problem-solving"],
            "Build a list of strings for the integers `1` through `n` (inclusive) using the usual FizzBuzz rules.",
            [{"input": "n=3", "output": "['1','2','fizz']"}],
            ["n >= 1"],
            "fizzbuzz_list",
            [{"name": "n", "type": "int"}],
            "List[str]",
            "def fizzbuzz_list(n):\n    pass\n",
            tests((3, ["1", "2", "fizz"]), (5, ["1", "2", "fizz", "4", "buzz"])),
            tests((15, fb15)),
            H("Build result in a loop.", "Check divisibility in order 15,3,5.", "", ""),
            "iterate",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-02-running-sum",
            "Running Sum",
            C["ps"],
            "easy",
            ["lists", "loops"],
            ["precode", "problem-solving"],
            "Return a new list of **running totals**: index `i` holds the sum of `nums[0]` through `nums[i]`.",
            [{"input": "[1,2,3]", "output": "[1,3,6]"}],
            [],
            "running_sum",
            [{"name": "nums", "type": "List[int]"}],
            "List[int]",
            "def running_sum(nums):\n    pass\n",
            tests(([1, 2, 3], [1, 3, 6]), ([], [])),
            tests(([5], [5])),
            H("Accumulate total as you iterate.", "", "", ""),
            "prefix",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-03-missing-number-small",
            "Missing Number In Range",
            C["ps"],
            "easy",
            ["math", "loops"],
            ["precode", "problem-solving"],
            "The list `nums` contains every integer from `0` through `n` exactly once, except **one** number is missing. "
            "The list length is `n`. Return that missing number.",
            [{"input": "[0,1]", "output": "2"}],
            [],
            "missing_number",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def missing_number(nums):\n    pass\n",
            tests(([0, 1], 2), ([1, 2, 0], 3)),
            tests(([0], 1)),
            H(
                "What should the total be if nothing were missing? Compare to the actual sum.",
                "Sum the integers from 0 through n, then subtract the sum of `nums`.",
                "",
                "",
            ),
            "sum diff",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-04-first-index",
            "First Index Of Value",
            C["ps"],
            "easy",
            ["loops"],
            ["precode", "problem-solving"],
            "Return first index of `x` in `nums`, or -1.",
            [{"input": "[1,2,3], 2", "output": "1"}],
            [],
            "first_index",
            [{"name": "nums", "type": "List[int]"}, {"name": "x", "type": "int"}],
            "int",
            "def first_index(nums, x):\n    pass\n",
            tests((([1, 2, 3], 2), 1), (([], 1), -1)),
            tests((([5], 5), 0)),
            H("enumerate or range(len)", "", "", ""),
            "linear",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-05-steps-to-zero",
            "Steps To Reach Zero",
            C["ps"],
            "easy",
            ["loops", "simulation"],
            ["precode", "problem-solving"],
            "Start from n>0: if odd subtract 1, else divide by 2. Count steps until 0.",
            [{"input": "6", "output": "4"}],
            [],
            "steps_to_zero",
            [{"name": "n", "type": "int"}],
            "int",
            "def steps_to_zero(n):\n    pass\n",
            tests((1, 1), (6, 4), (0, 0)),
            tests((8, 4)),
            H("Simulate until n==0.", "", "", ""),
            "simulate",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-06-strictly-ascending",
            "Strictly Ascending List",
            C["ps"],
            "easy",
            ["loops"],
            ["precode", "problem-solving"],
            "True if every element is greater than the previous (empty and singleton True).",
            [{"input": "[1,2,3]", "output": "True"}],
            [],
            "is_strictly_ascending",
            [{"name": "nums", "type": "List[int]"}],
            "bool",
            "def is_strictly_ascending(nums):\n    pass\n",
            tests(([1, 2, 3], True), ([1, 1], False), ([], True)),
            tests(([9], True)),
            H("Compare neighbors.", "", "", ""),
            "pairwise",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-07-min-coins-greedy",
            "Minimum Coins Greedy",
            C["ps"],
            "medium",
            ["greedy", "math"],
            ["precode", "problem-solving"],
            "Coins 1, 5, and 10. Return minimum number of coins to make `amount`.",
            [{"input": "7", "output": "3"}],
            [],
            "min_coins",
            [{"name": "amount", "type": "int"}],
            "int",
            "def min_coins(amount):\n    pass\n",
            tests((7, 3), (30, 3), (0, 0)),
            tests((42, 6)),
            H("Take as many 10s as possible, then 5s, then 1s.", "", "", ""),
            "greedy",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-08-reverse-digits",
            "Reverse Digits",
            C["ps"],
            "easy",
            ["loops"],
            ["precode", "problem-solving"],
            "Reverse decimal digits of positive integer `n` (1200 -> 21).",
            [{"input": "1200", "output": "21"}],
            [],
            "reverse_int_positive",
            [{"name": "n", "type": "int"}],
            "int",
            "def reverse_int_positive(n):\n    pass\n",
            tests((1200, 21), (7, 7)),
            tests((100, 1)),
            H("Extract digits with % 10 and // 10.", "", "", ""),
            "reverse",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-09-list-mean",
            "Arithmetic Mean",
            C["ps"],
            "easy",
            ["lists"],
            ["precode", "problem-solving"],
            "Return arithmetic mean of `nums` as float (nums non-empty).",
            [{"input": "[2,4]", "output": "3.0"}],
            [],
            "list_mean",
            [{"name": "nums", "type": "List[int]"}],
            "float",
            "def list_mean(nums):\n    pass\n",
            tests(([2, 4], 3.0), ([5], 5.0)),
            tests(([1, 1, 1], 1.0)),
            H("sum(nums)/len(nums)", "", "", ""),
            "mean",
        )
    )
    r.append(
        fn_problem(
            "precode-ps-10-total-service-time",
            "Total Minutes for All Jobs",
            C["ps"],
            "easy",
            ["simulation", "lists"],
            ["precode", "problem-solving"],
            "Imagine a single clerk handles jobs back-to-back. Each value in `service_times` is the minutes that job takes. "
            "Return the **total minutes** for every job combined—that is the sum of all numbers in the list.",
            [{"input": "[3,2,1]", "output": "6"}],
            [],
            "ticket_total",
            [{"name": "service_times", "type": "List[int]"}],
            "int",
            "def ticket_total(service_times):\n    pass\n",
            tests(([3, 2, 1], 6), ([5], 5), ([], 0)),
            tests(([1, 1, 1, 1], 4)),
            H(
                "Total time is additive when jobs run one after another.",
                "You do not need nested loops here.",
                "Python’s `sum` on the list matches the story.",
                "Empty list → 0.",
            ),
            "sum",
        )
    )
    return r


def _recursion(C: dict, H) -> list[dict]:
    r = []
    r.append(
        fn_problem(
            "precode-rc-01-factorial-rec",
            "Factorial Recursive",
            C["rc"],
            "easy",
            ["recursion"],
            ["precode", "recursion"],
            "Return n! for 0 <= n <= 12 using recursion.",
            [{"input": "5", "output": "120"}],
            [],
            "fact_rec",
            [{"name": "n", "type": "int"}],
            "int",
            "def fact_rec(n):\n    pass\n",
            tests((0, 1), (5, 120)),
            tests((7, 5040)),
            H("Base case n==0.", "fact(n)=n*fact(n-1)", "", ""),
            "recursive fact",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-02-fib-number",
            "Fibonacci Number",
            C["rc"],
            "easy",
            ["recursion"],
            ["precode", "recursion"],
            "Return F(n) for n>=0 with F(0)=0, F(1)=1 (small n only).",
            [{"input": "6", "output": "8"}],
            [],
            "fib",
            [{"name": "n", "type": "int"}],
            "int",
            "def fib(n):\n    pass\n",
            tests((0, 0), (1, 1), (6, 8)),
            tests((10, 55)),
            H("fib(n)=fib(n-1)+fib(n-2).", "", "", ""),
            "fib",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-03-sum-digits-rec",
            "Sum Digits Recursive",
            C["rc"],
            "easy",
            ["recursion"],
            ["precode", "recursion"],
            "Sum decimal digits of non-negative n recursively.",
            [{"input": "123", "output": "6"}],
            [],
            "sum_digits_rec",
            [{"name": "n", "type": "int"}],
            "int",
            "def sum_digits_rec(n):\n    pass\n",
            tests((0, 0), (123, 6)),
            tests((999, 27)),
            H("n%10 + sum_digits(n//10)", "", "", ""),
            "digits",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-04-reverse-string-rec",
            "Reverse String Recursive",
            C["rc"],
            "medium",
            ["recursion", "strings"],
            ["precode", "recursion"],
            "Reverse `s` using recursion only (no [::-1] in your logic — ok to use slicing in helper).",
            [{"input": "ab", "output": "ba"}],
            [],
            "reverse_str_rec",
            [{"name": "s", "type": "str"}],
            "str",
            "def reverse_str_rec(s):\n    pass\n",
            tests(("ab", "ba"), ("", "")),
            tests(("hello", "olleh")),
            H("Last char + reverse(prefix)", "", "", ""),
            "recursive string",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-05-list-sum-rec",
            "Recursive List Sum",
            C["rc"],
            "easy",
            ["recursion", "lists"],
            ["precode", "recursion"],
            "Return sum of nums using recursion.",
            [{"input": "[1,2,3]", "output": "6"}],
            [],
            "list_sum_rec",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def list_sum_rec(nums):\n    pass\n",
            tests(([1, 2, 3], 6), ([], 0)),
            tests(([9], 9)),
            H("Empty base case; else first + rest.", "", "", ""),
            "sum rec",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-06-power-rec",
            "Integer Power",
            C["rc"],
            "easy",
            ["recursion"],
            ["precode", "recursion"],
            "Return base**exp for exp>=0 using recursion.",
            [{"input": "3,4", "output": "81"}],
            [],
            "int_power",
            [{"name": "base", "type": "int"}, {"name": "exp", "type": "int"}],
            "int",
            "def int_power(base, exp):\n    pass\n",
            tests(((2, 0), 1), ((3, 4), 81)),
            tests(((2, 10), 1024)),
            H("exp==0 -> 1", "", "", ""),
            "power",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-07-count-down-string",
            "Countdown String",
            C["rc"],
            "easy",
            ["recursion", "strings"],
            ["precode", "recursion"],
            "Return 'n..0' joined by comma for n>=0 e.g. n=2 -> '2,1,0'.",
            [{"input": "2", "output": "'2,1,0'"}],
            [],
            "countdown_str",
            [{"name": "n", "type": "int"}],
            "str",
            "def countdown_str(n):\n    pass\n",
            tests((2, "2,1,0"), (0, "0")),
            tests((4, "4,3,2,1,0")),
            H("Base n==0", "", "", ""),
            "countdown",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-08-length-rec",
            "List Length Recursive",
            C["rc"],
            "easy",
            ["recursion"],
            ["precode", "recursion"],
            "Return len(nums) without using len() — use recursion.",
            [{"input": "[1,2,3]", "output": "3"}],
            [],
            "length_rec",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def length_rec(nums):\n    pass\n",
            tests(([1, 2, 3], 3), ([], 0)),
            tests(([0], 1)),
            H("Empty -> 0 else 1+length(rest)", "", "", ""),
            "len rec",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-09-is-palindrome-rec",
            "Palindrome Recursive",
            C["rc"],
            "medium",
            ["recursion", "strings"],
            ["precode", "recursion"],
            "Return True if `s` is palindrome (recursive approach).",
            [{"input": "aba", "output": "True"}],
            [],
            "is_pal_rec",
            [{"name": "s", "type": "str"}],
            "bool",
            "def is_pal_rec(s):\n    pass\n",
            tests(("aba", True), ("ab", False)),
            tests(("racecar", True)),
            H("Compare first/last and recurse.", "", "", ""),
            "pal rec",
        )
    )
    r.append(
        fn_problem(
            "precode-rc-10-gcd-rec",
            "Greatest Common Divisor (Recursive)",
            C["rc"],
            "medium",
            ["recursion", "math"],
            ["precode", "recursion"],
            "Return the **greatest common divisor** of non-negative integers `a` and `b` (the largest integer that divides both). "
            "Use the usual rule: `gcd(n, 0) = n`. This is the classic Euclidean algorithm—handy for simplifying ratios and shared measures.",
            [{"input": "48,18", "output": "6"}],
            [],
            "gcd_rec",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "int",
            "def gcd_rec(a, b):\n    pass\n",
            tests(((48, 18), 6), ((7, 1), 1)),
            tests(((100, 25), 25)),
            H("Euclid gcd(a,b)=gcd(b,a%b)", "", "", ""),
            "gcd",
        )
    )
    return r


def _oop_foundations(C: dict, H) -> list[dict]:
    r = []
    r.append(
        cls_problem(
            "precode-oo-01-counter-class",
            "Counter Class",
            C["oo"],
            "easy",
            ["classes", "methods"],
            ["precode", "oop"],
            "Class `Counter` with __init__(self), increment(self)->None, value(self)->int starting at 0.",
            [{"input": "ops", "output": "see tests"}],
            [],
            "Counter",
            "class Counter:\n    def __init__(self):\n        pass\n    def increment(self):\n        pass\n    def value(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Counter", "increment", "increment", "value"],
                    "args": [[], [], [], []],
                    "expected": [None, None, None, 2],
                }
            ],
            [
                {
                    "ops": ["Counter", "value"],
                    "args": [[], []],
                    "expected": [None, 0],
                }
            ],
            H("Store count on self.", "", "", ""),
            "counter",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-02-bank-account",
            "Bank Account",
            C["oo"],
            "easy",
            ["classes", "methods"],
            ["precode", "oop"],
            "BankAccount(balance) with deposit(amount), withdraw(amount), get_balance(). No negative balance.",
            [{"input": "", "output": ""}],
            [],
            "BankAccount",
            "class BankAccount:\n    def __init__(self, balance=0):\n        pass\n    def deposit(self, amount):\n        pass\n    def withdraw(self, amount):\n        pass\n    def get_balance(self):\n        pass\n",
            [{"name": "balance", "type": "int"}],
            [
                {
                    "ops": ["BankAccount", "deposit", "get_balance", "withdraw", "get_balance"],
                    "args": [[0], [10], [], [3], []],
                    "expected": [None, None, 10, None, 7],
                }
            ],
            [
                {
                    "ops": ["BankAccount", "withdraw", "get_balance"],
                    "args": [[5], [10], []],
                    "expected": [None, None, 5],
                }
            ],
            H("Track balance on self.", "", "", ""),
            "bank",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-03-rectangle",
            "Rectangle Area",
            C["oo"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "Rectangle(w,h) with area() and perimeter().",
            [{"input": "", "output": ""}],
            [],
            "Rectangle",
            "class Rectangle:\n    def __init__(self, w, h):\n        pass\n    def area(self):\n        pass\n    def perimeter(self):\n        pass\n",
            [{"name": "w", "type": "int"}, {"name": "h", "type": "int"}],
            [
                {
                    "ops": ["Rectangle", "area", "perimeter"],
                    "args": [[3, 4], [], []],
                    "expected": [None, 12, 14],
                }
            ],
            [
                {
                    "ops": ["Rectangle", "area"],
                    "args": [[2, 2], []],
                    "expected": [None, 4],
                }
            ],
            H("Store w,h.", "", "", ""),
            "rect",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-04-book",
            "Book Class",
            C["oo"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "Book(title, author) with get_title(), get_author().",
            [{"input": "", "output": ""}],
            [],
            "Book",
            "class Book:\n    def __init__(self, title, author):\n        pass\n    def get_title(self):\n        pass\n    def get_author(self):\n        pass\n",
            [{"name": "title", "type": "str"}, {"name": "author", "type": "str"}],
            [
                {
                    "ops": ["Book", "get_title", "get_author"],
                    "args": [["T", "A"], [], []],
                    "expected": [None, "T", "A"],
                }
            ],
            [
                {
                    "ops": ["Book", "get_title"],
                    "args": [["X", "Y"], []],
                    "expected": [None, "X"],
                }
            ],
            H("Save attributes.", "", "", ""),
            "book",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-05-student-gpa",
            "Student GPA",
            C["oo"],
            "medium",
            ["classes"],
            ["precode", "oop"],
            "Student(name) with add_grade(g) and gpa() returning sum/n (grades list).",
            [{"input": "", "output": ""}],
            [],
            "Student",
            "class Student:\n    def __init__(self, name):\n        pass\n    def add_grade(self, g):\n        pass\n    def gpa(self):\n        pass\n",
            [{"name": "name", "type": "str"}],
            [
                {
                    "ops": ["Student", "add_grade", "add_grade", "gpa"],
                    "args": [["Ann"], [4], [2], []],
                    "expected": [None, None, None, 3.0],
                }
            ],
            [
                {
                    "ops": ["Student", "gpa"],
                    "args": [["B"], []],
                    "expected": [None, 0.0],
                }
            ],
            H("Keep list of grades.", "", "", ""),
            "student",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-06-point",
            "Point Distance",
            C["oo"],
            "easy",
            ["classes", "math"],
            ["precode", "oop"],
            "Point(x,y) with distance_from_origin returning sqrt(x*x+y*y) — use **0.5 or math.sqrt.",
            [{"input": "", "output": ""}],
            [],
            "Point",
            "class Point:\n    def __init__(self, x, y):\n        pass\n    def distance_from_origin(self):\n        pass\n",
            [{"name": "x", "type": "int"}, {"name": "y", "type": "int"}],
            [
                {
                    "ops": ["Point", "distance_from_origin"],
                    "args": [[3, 4], []],
                    "expected": [None, 5.0],
                }
            ],
            [
                {
                    "ops": ["Point", "distance_from_origin"],
                    "args": [[0, 0], []],
                    "expected": [None, 0.0],
                }
            ],
            H("**(1/2) for sqrt.", "", "", ""),
            "point",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-07-stack-class",
            "Stack Class",
            C["oo"],
            "medium",
            ["classes", "lists"],
            ["precode", "oop"],
            "Stack with push(x), pop() removes last, peek() returns top without removing.",
            [{"input": "", "output": ""}],
            [],
            "Stack",
            "class Stack:\n    def __init__(self):\n        pass\n    def push(self, x):\n        pass\n    def pop(self):\n        pass\n    def peek(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Stack", "push", "push", "peek", "pop", "peek"],
                    "args": [[], [5], [7], [], [], []],
                    "expected": [None, None, None, 7, 7, 5],
                }
            ],
            [
                {
                    "ops": ["Stack", "push", "push", "pop", "peek"],
                    "args": [[], [1], [2], [], []],
                    "expected": [None, None, None, 2, 1],
                }
            ],
            H("Use a list internally.", "", "", ""),
            "stack",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-08-queue-simple",
            "Simple Queue",
            C["oo"],
            "medium",
            ["classes"],
            ["precode", "oop"],
            "Queue enqueue(x), dequeue() FIFO, front() without removing.",
            [{"input": "", "output": ""}],
            [],
            "Queue",
            "class Queue:\n    def __init__(self):\n        pass\n    def enqueue(self, x):\n        pass\n    def dequeue(self):\n        pass\n    def front(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Queue", "enqueue", "enqueue", "front", "dequeue", "front"],
                    "args": [[], [1], [2], [], [], []],
                    "expected": [None, None, None, 1, 1, 2],
                }
            ],
            [
                {
                    "ops": ["Queue", "enqueue", "dequeue"],
                    "args": [[], [9], []],
                    "expected": [None, None, 9],
                }
            ],
            H("collections.deque or list pop(0) — list ok for small n.", "", "", ""),
            "queue",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-09-timer",
            "Stopwatch Ticks",
            C["oo"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "Timer with tick() incrementing count, count() returns ticks.",
            [{"input": "", "output": ""}],
            [],
            "Timer",
            "class Timer:\n    def __init__(self):\n        pass\n    def tick(self):\n        pass\n    def count(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Timer", "tick", "tick", "count"],
                    "args": [[], [], [], []],
                    "expected": [None, None, None, 2],
                }
            ],
            [
                {
                    "ops": ["Timer", "count"],
                    "args": [[], []],
                    "expected": [None, 0],
                }
            ],
            H("Internal counter.", "", "", ""),
            "timer",
        )
    )
    r.append(
        cls_problem(
            "precode-oo-10-named-rectangle-str",
            "Rectangle With String Form",
            C["oo"],
            "easy",
            ["classes", "strings"],
            ["precode", "oop"],
            "Rectangle(w,h) with __str__ returning 'WxH'.",
            [{"input": "", "output": ""}],
            [],
            "RectStr",
            "class RectStr:\n    def __init__(self, w, h):\n        pass\n    def __str__(self):\n        pass\n",
            [{"name": "w", "type": "int"}, {"name": "h", "type": "int"}],
            [
                {
                    "ops": ["RectStr", "__str__"],
                    "args": [[3, 4], []],
                    "expected": [None, "3x4"],
                }
            ],
            [
                {
                    "ops": ["RectStr", "__str__"],
                    "args": [[10, 2], []],
                    "expected": [None, "10x2"],
                }
            ],
            H("__str__ returns descriptive string.", "", "", ""),
            "str",
        )
    )
    return r


def _oop_practice(C: dict, H) -> list[dict]:
    r = []
    r.append(
        cls_problem(
            "precode-op-01-shopping-cart",
            "Shopping Cart",
            C["op"],
            "medium",
            ["classes", "methods"],
            ["precode", "oop"],
            "Cart with add_item(price), total().",
            [{"input": "", "output": ""}],
            [],
            "ShoppingCart",
            "class ShoppingCart:\n    def __init__(self):\n        pass\n    def add_item(self, price):\n        pass\n    def total(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["ShoppingCart", "add_item", "add_item", "total"],
                    "args": [[], [10], [5], []],
                    "expected": [None, None, None, 15],
                }
            ],
            [
                {
                    "ops": ["ShoppingCart", "total"],
                    "args": [[], []],
                    "expected": [None, 0],
                }
            ],
            H("Accumulate prices.", "", "", ""),
            "cart",
        )
    )
    r.append(
        cls_problem(
            "precode-op-02-library",
            "Library Add Borrow",
            C["op"],
            "medium",
            ["classes"],
            ["precode", "oop"],
            "Library has books set; add_book(title), has_book(title).",
            [{"input": "", "output": ""}],
            [],
            "Library",
            "class Library:\n    def __init__(self):\n        pass\n    def add_book(self, title):\n        pass\n    def has_book(self, title):\n        pass\n",
            [],
            [
                {
                    "ops": ["Library", "add_book", "has_book", "has_book"],
                    "args": [[], ["A"], ["A"], ["B"]],
                    "expected": [None, None, True, False],
                }
            ],
            [
                {
                    "ops": ["Library", "add_book", "has_book"],
                    "args": [[], ["X"], ["X"]],
                    "expected": [None, None, True],
                }
            ],
            H("Use a set.", "", "", ""),
            "library",
        )
    )
    r.append(
        cls_problem(
            "precode-op-03-inventory",
            "Inventory Quantity",
            C["op"],
            "medium",
            ["classes", "dictionaries"],
            ["precode", "oop"],
            "Inventory: add_sku(name,qty), quantity(name).",
            [{"input": "", "output": ""}],
            [],
            "Inventory",
            "class Inventory:\n    def __init__(self):\n        pass\n    def add_sku(self, name, qty):\n        pass\n    def quantity(self, name):\n        pass\n",
            [],
            [
                {
                    "ops": ["Inventory", "add_sku", "add_sku", "quantity"],
                    "args": [[], ["a", 2], ["a", 3], ["a"]],
                    "expected": [None, None, None, 5],
                }
            ],
            [
                {
                    "ops": ["Inventory", "quantity"],
                    "args": [[], ["missing"]],
                    "expected": [None, 0],
                }
            ],
            H("Dict counts.", "", "", ""),
            "inv",
        )
    )
    r.append(
        cls_problem(
            "precode-op-04-classroom",
            "Classroom Roster",
            C["op"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "Classroom with add_student(name), count().",
            [{"input": "", "output": ""}],
            [],
            "Classroom",
            "class Classroom:\n    def __init__(self):\n        pass\n    def add_student(self, name):\n        pass\n    def count(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Classroom", "add_student", "add_student", "count"],
                    "args": [[], ["a"], ["b"], []],
                    "expected": [None, None, None, 2],
                }
            ],
            [
                {
                    "ops": ["Classroom", "count"],
                    "args": [[], []],
                    "expected": [None, 0],
                }
            ],
            H("List of names.", "", "", ""),
            "class",
        )
    )
    r.append(
        cls_problem(
            "precode-op-05-vehicle-car",
            "Vehicle And Car",
            C["op"],
            "medium",
            ["inheritance", "classes"],
            ["precode", "oop"],
            "Vehicle(kind) with wheels() returning 0; Car inherits Vehicle, wheels returns 4.",
            [{"input": "", "output": ""}],
            [],
            "Car",
            "class Vehicle:\n    def __init__(self, kind):\n        pass\n    def wheels(self):\n        pass\n\nclass Car(Vehicle):\n    def __init__(self):\n        pass\n    def wheels(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Car", "wheels"],
                    "args": [[], []],
                    "expected": [None, 4],
                }
            ],
            [
                {
                    "ops": ["Vehicle", "wheels"],
                    "args": [["x"], []],
                    "expected": [None, 0],
                }
            ],
            H("Override in subclass.", "", "", ""),
            "inherit",
        )
    )
    r.append(
        cls_problem(
            "precode-op-06-team-players",
            "Team With Players",
            C["op"],
            "medium",
            ["classes", "composition"],
            ["precode", "oop"],
            "Team(name) with add_player(p) and roster() returning comma-separated names in order.",
            [{"input": "", "output": ""}],
            [],
            "Team",
            "class Team:\n    def __init__(self, name):\n        pass\n    def add_player(self, player):\n        pass\n    def roster(self):\n        pass\n",
            [{"name": "name", "type": "str"}],
            [
                {
                    "ops": ["Team", "add_player", "add_player", "roster"],
                    "args": [["T"], ["a"], ["b"], []],
                    "expected": [None, None, None, "a,b"],
                }
            ],
            [
                {
                    "ops": ["Team", "roster"],
                    "args": [["X"], []],
                    "expected": [None, ""],
                }
            ],
            H("Keep a list of player names.", "", "", ""),
            "team",
        )
    )
    r.append(
        cls_problem(
            "precode-op-07-email-user",
            "User With Email",
            C["op"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "User(name, email) with display() returning 'name <email>'.",
            [{"input": "", "output": ""}],
            [],
            "User",
            "class User:\n    def __init__(self, name, email):\n        pass\n    def display(self):\n        pass\n",
            [{"name": "name", "type": "str"}, {"name": "email", "type": "str"}],
            [
                {
                    "ops": ["User", "display"],
                    "args": [["A", "a@b.c"], []],
                    "expected": [None, "A <a@b.c>"],
                }
            ],
            [
                {
                    "ops": ["User", "display"],
                    "args": [["X", "y@z"], []],
                    "expected": [None, "X <y@z>"],
                }
            ],
            H("Format string.", "", "", ""),
            "user",
        )
    )
    r.append(
        cls_problem(
            "precode-op-08-savings-interest",
            "Savings Interest",
            C["op"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "SavingsAccount(balance) with apply_interest(rate) multiplying balance by (1+rate) rounded to 2 decimals.",
            [{"input": "", "output": ""}],
            [],
            "SavingsAccount",
            "class SavingsAccount:\n    def __init__(self, balance):\n        pass\n    def apply_interest(self, rate):\n        pass\n    def balance(self):\n        pass\n",
            [{"name": "balance", "type": "float"}],
            [
                {
                    "ops": ["SavingsAccount", "apply_interest", "balance"],
                    "args": [[100.0], [0.1], []],
                    "expected": [None, None, 110.0],
                }
            ],
            [
                {
                    "ops": ["SavingsAccount", "apply_interest", "balance"],
                    "args": [[50.0], [0.0], []],
                    "expected": [None, None, 50.0],
                }
            ],
            H("Update self.balance.", "", "", ""),
            "interest",
        )
    )
    r.append(
        cls_problem(
            "precode-op-09-polynomial-eval",
            "Polynomial Evaluator",
            C["op"],
            "medium",
            ["classes"],
            ["precode", "oop"],
            "Poly(coeffs) coeffs[0]+coeffs[1]*x+coeffs[2]*x*x for len 3; eval_at(x).",
            [{"input": "", "output": ""}],
            [],
            "Poly",
            "class Poly:\n    def __init__(self, coeffs):\n        pass\n    def eval_at(self, x):\n        pass\n",
            [{"name": "coeffs", "type": "List[int]"}],
            [
                {
                    "ops": ["Poly", "eval_at"],
                    "args": [[[1, 2, 3]], [2]],
                    "expected": [None, 17],
                }
            ],
            [
                {
                    "ops": ["Poly", "eval_at"],
                    "args": [[[0, 0, 1]], [5]],
                    "expected": [None, 25],
                }
            ],
            H("Horner or direct formula.", "", "", ""),
            "poly",
        )
    )
    r.append(
        cls_problem(
            "precode-op-10-session-counter",
            "Login Session",
            C["op"],
            "easy",
            ["classes"],
            ["precode", "oop"],
            "Session with login() sets active True, logout() False, is_active().",
            [{"input": "", "output": ""}],
            [],
            "Session",
            "class Session:\n    def __init__(self):\n        pass\n    def login(self):\n        pass\n    def logout(self):\n        pass\n    def is_active(self):\n        pass\n",
            [],
            [
                {
                    "ops": ["Session", "is_active", "login", "is_active", "logout", "is_active"],
                    "args": [[], [], [], [], [], []],
                    "expected": [None, False, None, True, None, False],
                }
            ],
            [
                {
                    "ops": ["Session", "login", "logout", "is_active"],
                    "args": [[], [], [], []],
                    "expected": [None, None, None, False],
                }
            ],
            H("Boolean flag.", "", "", ""),
            "session",
        )
    )
    return r


def _debugging(C: dict, H) -> list[dict]:
    r = []
    r.append(
        fn_problem(
            "precode-db-01-off-by-one-range",
            "Fix Off By One",
            C["db"],
            "easy",
            ["debugging", "loops"],
            ["precode", "debugging"],
            "Return sum of integers from 1 through n inclusive. The starter uses a wrong range.",
            [{"input": "5", "output": "15"}],
            [],
            "sum_one_to_n",
            [{"name": "n", "type": "int"}],
            "int",
            "def sum_one_to_n(n):\n    total = 0\n    for i in range(n):\n        total += i\n    return total\n",
            tests((5, 15), (1, 1)),
            tests((10, 55)),
            H(
                "You want 1 + 2 + … + n, but the loop adds 0 + 1 + … + (n - 1).",
                "`range(n)` runs `n` times starting at 0; it never includes `n` as a value to add.",
                "Loop over `range(1, n + 1)` or change what you add each step.",
                "Trace with n=5: current code sums 0..4, not 1..5.",
            ),
            "range(1,n+1)",
        )
    )
    r.append(
        fn_problem(
            "precode-db-02-wrong-compare",
            "Fix Comparison",
            C["db"],
            "easy",
            ["debugging", "conditionals"],
            ["precode", "debugging"],
            "Return True if a equals b. Starter used `is` by mistake.",
            [{"input": "3,3", "output": "True"}],
            [],
            "ints_equal",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "bool",
            "def ints_equal(a, b):\n    return a is b\n",
            tests(((3, 3), True), ((1, 2), False)),
            tests(((100, 100), True)),
            H(
                "`==` compares values; `is` checks whether two names refer to the same object.",
                "Small integers may be cached, so `is` can accidentally pass some tests.",
                "Use `a == b` whenever you mean “equal values”.",
                "",
            ),
            "use ==",
        )
    )
    r.append(
        fn_problem(
            "precode-db-03-mutable-default",
            "Avoid Mutable Default",
            C["db"],
            "medium",
            ["debugging"],
            ["precode", "debugging"],
            "Append value to a list and return it. Starter uses mutable default list.",
            [{"input": "1", "output": "[1]"}],
            [],
            "append_value",
            [
                {"name": "value", "type": "int"},
                {"name": "items", "type": "Optional[List[int]]"},
            ],
            "List[int]",
            "def append_value(value, items=[]):\n    items.append(value)\n    return items\n",
            tests(((1, None), [1]), ((2, [1]), [1, 2])),
            tests(((3, []), [3])),
            H(
                "A default argument like `[]` is created once and reused across calls.",
                "That shared list makes later calls see leftover items—classic Python gotcha.",
                "Use `items=None` and set `items = []` inside the function when needed.",
                "Or build a fresh list each time before appending.",
            ),
            "mutable default",
        )
    )
    r.append(
        fn_problem(
            "precode-db-04-early-return",
            "Fix Early Return",
            C["db"],
            "easy",
            ["debugging"],
            ["precode", "debugging"],
            "Return max of a,b. Starter returns too early.",
            [{"input": "3,5", "output": "5"}],
            [],
            "max_two",
            [{"name": "a", "type": "int"}, {"name": "b", "type": "int"}],
            "int",
            "def max_two(a, b):\n    if a > b:\n        return a\n    return a\n",
            tests(((3, 5), 5), ((9, 2), 9)),
            tests(((0, 0), 0)),
            H(
                "When `a <= b`, the code still returns `a` because the final `return a` runs for both cases.",
                "The second branch should handle the case where `b` is larger.",
                "Return `b` when `a` is not greater than `b` (or use `max(a, b)`).",
                "",
            ),
            "return b",
        )
    )
    r.append(
        fn_problem(
            "precode-db-05-loop-condition",
            "Fix Loop Bound",
            C["db"],
            "easy",
            ["debugging", "loops"],
            ["precode", "debugging"],
            "Return product 1*2*...*n for n>=1. Starter stops too early.",
            [{"input": "4", "output": "24"}],
            [],
            "factorial_buggy",
            [{"name": "n", "type": "int"}],
            "int",
            "def factorial_buggy(n):\n    p = 1\n    for i in range(1, n):\n        p *= i\n    return p\n",
            tests((4, 24), (3, 6)),
            tests((5, 120)),
            H(
                "`range(1, n)` stops before `n`, so the factor `n` never multiplies into `p`.",
                "You need every integer from 1 through n inclusive.",
                "Use `range(1, n + 1)` in the loop.",
                "",
            ),
            "range(1,n+1)",
        )
    )
    r.append(
        fn_problem(
            "precode-db-06-string-strip",
            "Remember To Strip",
            C["db"],
            "easy",
            ["debugging", "strings"],
            ["precode", "debugging"],
            "Return True if stripped s equals stripped t.",
            [{"input": "' hi ','hi'", "output": "True"}],
            [],
            "same_word",
            [{"name": "s", "type": "str"}, {"name": "t", "type": "str"}],
            "bool",
            "def same_word(s, t):\n    return s == t\n",
            tests(((" hi ", "hi"), True), (("a", "b"), False)),
            tests((("  x", "x  "), True)),
            H(
                "Leading or trailing spaces make `' hi ' != 'hi'`.",
                "Normalize both sides the same way before comparing.",
                "Call `.strip()` on `s` and on `t`.",
                "",
            ),
            "strip",
        )
    )
    r.append(
        fn_problem(
            "precode-db-07-dict-accidental-mutation",
            "Copy Before Mutate",
            C["db"],
            "medium",
            ["debugging", "dictionaries"],
            ["precode", "debugging"],
            "Return new dict equal to d with key k set to v without mutating input d.",
            [{"input": "{'a':1},'b',2", "output": "{'a':1,'b':2}"}],
            [],
            "set_key_copy",
            [{"name": "d", "type": "dict"}, {"name": "k", "type": "str"}, {"name": "v", "type": "int"}],
            "dict",
            "def set_key_copy(d, k, v):\n    d[k] = v\n    return d\n",
            tests((({"a": 1}, "b", 2), {"a": 1, "b": 2}), (({}, "x", 1), {"x": 1})),
            tests((({"z": 0}, "z", 9), {"z": 9})),
            H(
                "Assigning `d[k] = v` changes the dict the caller passed in.",
                "Callers expect the original mapping left unchanged.",
                "Copy first: `out = dict(d)` then `out[k] = v` and return `out`.",
                "",
            ),
            "copy",
        )
    )
    r.append(
        fn_problem(
            "precode-db-08-none-check",
            "Explicit None Check",
            C["db"],
            "easy",
            ["debugging", "conditionals"],
            ["precode", "debugging"],
            "Return True if x is None. Starter uses `not x` which is wrong for 0.",
            [{"input": "None", "output": "True"}],
            [],
            "is_none_val",
            [{"name": "x", "type": "Optional[int]"}],
            "bool",
            "def is_none_val(x):\n    return not x\n",
            tests((None, True), (0, False)),
            tests((5, False)),
            H(
                "`not x` is true for `None`, but also for `0`, `[]`, and `''`—usually not what you want here.",
                "To test specifically for missing values, distinguish `None` from zero.",
                "Use `x is None`.",
                "",
            ),
            "is None",
        )
    )
    r.append(
        fn_problem(
            "precode-db-09-list-alias",
            "List Copy",
            C["db"],
            "medium",
            ["debugging", "lists"],
            ["precode", "debugging"],
            "Return reversed copy of nums without mutating nums.",
            [{"input": "[1,2,3]", "output": "[3,2,1]"}],
            [],
            "rev_copy",
            [{"name": "nums", "type": "List[int]"}],
            "List[int]",
            "def rev_copy(nums):\n    nums.reverse()\n    return nums\n",
            tests(([1, 2, 3], [3, 2, 1]), ([9], [9])),
            tests(([1, 2], [2, 1])),
            H(
                "`.reverse()` reverses the list **in place** and returns `None`.",
                "The caller’s list is modified, which breaks the “copy” requirement.",
                "Work on a copy: `nums[::-1]` or `list(reversed(nums))`.",
                "",
            ),
            "copy",
        )
    )
    r.append(
        fn_problem(
            "precode-db-10-shadow-builtin",
            "Do Not Shadow Len",
            C["db"],
            "easy",
            ["debugging"],
            ["precode", "debugging"],
            "Return length of list nums. Starter shadows len.",
            [{"input": "[1,2,3]", "output": "3"}],
            [],
            "safe_length",
            [{"name": "nums", "type": "List[int]"}],
            "int",
            "def safe_length(nums):\n    len = 0\n    for _ in nums:\n        len += 1\n    return len(nums)\n",
            tests(([1, 2, 3], 3), ([], 0)),
            tests(([0], 1)),
            H(
                "The name `len` now refers to an integer, so `len(nums)` no longer calls the built-in.",
                "Shadowing builtins causes confusing `TypeError`s.",
                "Rename the counter (e.g. `count`) and use the real `len` or your counter consistently.",
                "",
            ),
            "no shadow",
        )
    )
    return r


def main() -> None:
    problems = all_problems()
    assert len(problems) == 100
    for p in problems:
        cat = p["category"]
        out_dir = ROOT / "shared" / "problems" / cat
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{p['id']}.json"
        path.write_text(json.dumps(p, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(problems)} problems under shared/problems/")


if __name__ == "__main__":
    main()
