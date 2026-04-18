from __future__ import annotations

from app.stepwise import validate_stepwise


PROBLEM = {
    "id": "return-seven",
    "solution_sentences": ["def answer():", "    return 7"],
    "hints_per_sentence": [
        "Define the function with no parameters using 'def answer():'",
        "Inside the function, use 'return 7' (not print).",
    ],
    "final_explanation": (
        "The function 'answer' returns the integer 7. No print is needed "
        "because the problem asks for a return value."
    ),
}


def test_not_configured_returns_available_false():
    result = validate_stepwise("def answer():\n    return 7", {})
    assert result.available is False
    assert result.correct_count == 0
    assert result.total == 0
    assert result.is_full_solution is False


def test_empty_code_prompts_for_first_sentence():
    result = validate_stepwise("", PROBLEM)
    assert result.available is True
    assert result.correct_count == 0
    assert result.total == 2
    assert result.is_full_solution is False
    assert "first" in result.message.lower()
    assert "def answer" in result.next_hint


def test_first_sentence_correct_asks_for_second():
    result = validate_stepwise("def answer():", PROBLEM)
    assert result.correct_count == 1
    assert result.is_full_solution is False
    assert "sentence 2" in result.message.lower()
    assert "return 7" in result.next_hint


def test_first_sentence_incorrect_restarts_from_beginning():
    result = validate_stepwise("def wrong():", PROBLEM)
    assert result.correct_count == 0
    assert result.first_failed_index == 0
    assert "beginning" in result.message.lower()
    assert "def answer" in result.next_hint


def test_full_solution_returns_final_explanation():
    result = validate_stepwise("def answer():\n    return 7", PROBLEM)
    assert result.correct_count == 2
    assert result.is_full_solution is True
    assert result.final_explanation.startswith("The function 'answer'")


def test_ignores_blank_lines_and_comments():
    code = """
# prepping

def answer():
    # returns the magic number
    return 7
"""
    result = validate_stepwise(code, PROBLEM)
    assert result.is_full_solution is True


def test_whitespace_normalization_allows_tabs_or_spaces():
    code = "def   answer():\n\treturn 7"
    result = validate_stepwise(code, PROBLEM)
    assert result.is_full_solution is True


def test_extra_trailing_sentences_are_tolerated_when_prefix_correct():
    code = "def answer():\n    return 7\nprint('extra')"
    result = validate_stepwise(code, PROBLEM)
    assert result.is_full_solution is True


def test_second_sentence_wrong_reports_index_and_hint():
    code = "def answer():\n    return 8"
    result = validate_stepwise(code, PROBLEM)
    assert result.correct_count == 1
    assert result.first_failed_index == 1
    assert result.is_full_solution is False
    assert "return 7" in result.next_hint
