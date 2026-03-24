from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
from typing import Any, Callable, Optional

from app.models import ProblemMeta, StructuredEvaluation, VisibleTestResult
from app.safety import SafetyError, assert_code_imports_safe, build_restricted_builtins


def _load_problem(problem_id: str) -> dict[str, Any]:
    base = Path(__file__).resolve().parent.parent / "problems" / f"{problem_id}.json"
    if not base.exists():
        raise FileNotFoundError(f"Unknown problem: {problem_id}")
    return json.loads(base.read_text(encoding="utf-8"))


def _verify_two_sum(nums: list[Any], target: int, got: Any) -> bool:
    if not isinstance(got, (list, tuple)) or len(got) != 2:
        return False
    i, j = int(got[0]), int(got[1])
    if i == j or i < 0 or j < 0 or i >= len(nums) or j >= len(nums):
        return False
    return nums[i] + nums[j] == target


def _normalize_expected(problem_id: str, got: Any, exp: Any, args: list[Any] | None = None) -> bool:
    if problem_id == "two-sum" and args is not None and len(args) >= 2:
        nums, target = args[0], args[1]
        return _verify_two_sum(nums, target, got)
    if problem_id == "top-k-frequent-elements":
        if not isinstance(got, (list, tuple)) or not isinstance(exp, (list, tuple)):
            return False
        return sorted(got) == sorted(exp)
    return got == exp


def _function_body_incomplete(body: list[ast.stmt]) -> bool:
    if not body:
        return True
    # Strip leading docstring
    idx = 0
    if (
        len(body) > 0
        and isinstance(body[0], ast.Expr)
        and isinstance(body[0].value, ast.Constant)
        and isinstance(body[0].value.value, str)
    ):
        idx = 1
    rest = body[idx:]
    if not rest:
        return True
    if len(rest) == 1 and isinstance(rest[0], ast.Pass):
        return True
    if len(rest) == 1 and isinstance(rest[0], ast.Expr) and isinstance(rest[0].value, ast.Constant):
        val = rest[0].value.value
        if val is ...:
            return True
    if len(rest) == 1 and isinstance(rest[0], ast.Return):
        ret = rest[0].value
        if ret is None:
            return True
        if isinstance(ret, ast.Constant) and ret.value is None:
            return True
    # Placeholder: only a pass after docstring
    if all(isinstance(s, ast.Pass) for s in rest):
        return True
    return False


def _arity(fn: Callable[..., Any], expected: int) -> bool:
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):
        return False
    params = [
        p
        for p in sig.parameters.values()
        if p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    # No *args for MVP
    if any(
        p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
        for p in sig.parameters.values()
    ):
        return False
    return len(params) == expected


def _empty_feedback(status: str) -> StructuredEvaluation:
    return StructuredEvaluation(
        status=status,  # type: ignore[arg-type]
        syntax_ok=False,
        function_found=False,
        signature_ok=False,
        passed_visible_tests=0,
        total_visible_tests=0,
        passed_hidden_tests=0,
        total_hidden_tests=0,
        error_type=None,
        error_message=None,
        failing_case_summary=None,
        likely_stage="unknown",
        feedback_targets=[],
    )


def evaluate_user_code(code: str, problem: dict[str, Any]) -> tuple[StructuredEvaluation, list[VisibleTestResult]]:
    meta = ProblemMeta.model_validate(
        {
            "id": problem["id"],
            "function_name": problem["function_name"],
            "parameters": problem["parameters"],
            "expected_return_type": problem["expected_return_type"],
            "visible_tests": problem["visible_tests"],
            "hidden_tests": problem["hidden_tests"],
        }
    )
    pid = meta.id
    fname = meta.function_name
    expected_arity = len(meta.parameters)

    ev = _empty_feedback("incomplete")
    visible_results: list[VisibleTestResult] = []

    # 1) Syntax
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        ev = StructuredEvaluation(
            status="syntax_error",
            syntax_ok=False,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type="SyntaxError",
            error_message=str(e),
            failing_case_summary=None,
            likely_stage="fix_syntax",
            feedback_targets=["Resolve syntax errors before reasoning about logic."],
        )
        return ev, []

    ev.syntax_ok = True

    # 2) Safety (imports)
    try:
        assert_code_imports_safe(code)
    except SafetyError as e:
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type="SafetyError",
            error_message=e.message,
            failing_case_summary=None,
            likely_stage="disallowed_import",
            feedback_targets=["Avoid restricted imports in the MVP sandbox."],
        )
        return ev, []

    # 3) Function exists in AST
    fn_node: ast.FunctionDef | None = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == fname:
            fn_node = node
            break

    if fn_node is None:
        ev = StructuredEvaluation(
            status="incomplete",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=None,
            error_message=None,
            failing_case_summary=f"Define a top-level function named `{fname}` matching the statement.",
            likely_stage="missing_entrypoint",
            feedback_targets=[f"Implement `{fname}` with the requested parameters."],
        )
        return ev, []

    ev.function_found = True

    # 4) Arity from AST
    ast_args = [a for a in fn_node.args.args]  # noqa: RUF005
    if len(ast_args) != expected_arity:
        ev = StructuredEvaluation(
            status="incomplete",
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=None,
            error_message=None,
            failing_case_summary="Parameter count does not match the required signature.",
            likely_stage="signature_mismatch",
            feedback_targets=[f"Match parameter list length {expected_arity} and names from the prompt."],
        )
        return ev, []

    ev.signature_ok = True

    if _function_body_incomplete(fn_node.body):
        ev = StructuredEvaluation(
            status="incomplete",
            syntax_ok=True,
            function_found=True,
            signature_ok=True,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=None,
            error_message=None,
            failing_case_summary="Implementation looks like a stub (pass/empty/placeholder).",
            likely_stage="implementation_stub",
            feedback_targets=["Replace placeholders with real logic that returns the required type."],
        )
        return ev, []

    # 5) Execute with restricted globals
    g: dict[str, Any] = {"__builtins__": build_restricted_builtins()}
    try:
        exec(compile(tree, "<user>", "exec"), g, g)  # noqa: S102 — intentional for MVP judge
    except Exception as e:
        ev = StructuredEvaluation(
            status="runtime_error",
            syntax_ok=True,
            function_found=True,
            signature_ok=True,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=type(e).__name__,
            error_message=str(e),
            failing_case_summary=None,
            likely_stage="import_or_global_runtime",
            feedback_targets=["Code failed before tests ran; check definitions and allowed operations."],
        )
        return ev, []

    user_fn = g.get(fname)
    if not callable(user_fn):
        ev = StructuredEvaluation(
            status="incomplete",
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=None,
            error_message=None,
            failing_case_summary=f"`{fname}` is not callable after execution.",
            likely_stage="not_callable",
            feedback_targets=["Ensure the function name matches and is a real function."],
        )
        return ev, []

    if not _arity(user_fn, expected_arity):
        ev.signature_ok = False
        ev = StructuredEvaluation(
            status="incomplete",
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=len(meta.visible_tests),
            passed_hidden_tests=0,
            total_hidden_tests=len(meta.hidden_tests),
            error_type=None,
            error_message=None,
            failing_case_summary="Runtime signature does not match the expected arity.",
            likely_stage="signature_mismatch_runtime",
            feedback_targets=["Fix parameters so the function accepts the expected arguments."],
        )
        return ev, []

    # 6) Run tests
    def run_case(args: list[Any]) -> Any:
        return user_fn(*args)

    fail_summary: Optional[str] = None
    v_pass = 0
    for i, t in enumerate(meta.visible_tests):
        args = t["args"]
        exp = t["expected"]
        try:
            got = run_case(args)
            ok = _normalize_expected(pid, got, exp, args)
        except Exception as e:
            ev = StructuredEvaluation(
                status="runtime_error",
                syntax_ok=True,
                function_found=True,
                signature_ok=True,
                passed_visible_tests=v_pass,
                total_visible_tests=len(meta.visible_tests),
                passed_hidden_tests=0,
                total_hidden_tests=len(meta.hidden_tests),
                error_type=type(e).__name__,
                error_message=str(e),
                failing_case_summary=f"Visible test {i + 1} raised an exception.",
                likely_stage="runtime_during_tests",
                feedback_targets=["Stabilize execution on sample inputs before edge cases."],
            )
            visible_results.append(VisibleTestResult(index=i, passed=False, label=f"visible#{i + 1}"))
            return ev, visible_results

        visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
        if ok:
            v_pass += 1
        elif fail_summary is None:
            fail_summary = f"Visible test {i + 1} failed (output mismatch)."

    h_pass = 0
    first_hidden_fail: Optional[str] = None
    for j, t in enumerate(meta.hidden_tests):
        args = t["args"]
        exp = t["expected"]
        try:
            got = run_case(args)
            ok = _normalize_expected(pid, got, exp, args)
        except Exception as e:
            ev = StructuredEvaluation(
                status="runtime_error",
                syntax_ok=True,
                function_found=True,
                signature_ok=True,
                passed_visible_tests=v_pass,
                total_visible_tests=len(meta.visible_tests),
                passed_hidden_tests=h_pass,
                total_hidden_tests=len(meta.hidden_tests),
                error_type=type(e).__name__,
                error_message=str(e),
                failing_case_summary="A hidden test raised an exception (details not shown).",
                likely_stage="runtime_on_hidden",
                feedback_targets=["Re-check invariants; hidden tests include edge cases."],
            )
            return ev, visible_results

        if ok:
            h_pass += 1
        elif first_hidden_fail is None:
            first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."

    total_v = len(meta.visible_tests)
    total_h = len(meta.hidden_tests)

    if v_pass == total_v and h_pass == total_h:
        status = "correct"
        likely = "complete"
        targets = ["All visible and hidden checks passed."]
    elif v_pass == 0:
        status = "wrong"
        likely = "logic_not_matching_samples"
        targets = [
            "Align your approach with the sample behavior first.",
            fail_summary or "Compare return values carefully.",
        ]
    elif v_pass < total_v or h_pass < total_h:
        status = "partial"
        likely = "progress_but_gaps"
        targets = [
            f"Passed {v_pass}/{total_v} visible and {h_pass}/{total_h} hidden tests.",
            fail_summary or first_hidden_fail or "Keep hunting the failing pattern.",
        ]
    else:
        status = "partial"
        likely = "unexpected"
        targets = ["Review evaluation state."]

    ev = StructuredEvaluation(
        status=status,  # type: ignore[arg-type]
        syntax_ok=True,
        function_found=True,
        signature_ok=True,
        passed_visible_tests=v_pass,
        total_visible_tests=total_v,
        passed_hidden_tests=h_pass,
        total_hidden_tests=total_h,
        error_type=None,
        error_message=None,
        failing_case_summary=fail_summary or first_hidden_fail,
        likely_stage=likely,
        feedback_targets=[t for t in targets if t],
    )
    return ev, visible_results


def deterministic_interviewer_note(ev: StructuredEvaluation) -> str:
    if ev.status == "correct":
        return "Looks good — your implementation satisfies the visible checks and the hidden battery."
    if ev.status == "syntax_error":
        return "Syntax issue first — I cannot run tests until this parses cleanly."
    if ev.status == "runtime_error":
        return "We hit a runtime error while executing your code; stabilize the happy path, then tighten edge cases."
    if ev.status == "incomplete":
        return "This still reads like an early draft — tighten the core logic so it returns a real answer on the samples."
    if ev.status == "wrong":
        return "The samples are still failing — align the behavior with the examples before optimizing."
    if ev.status == "partial":
        return "You're partway there — some cases pass, but a few behaviors still need tightening."
    return "Let's keep going step by step."


def evaluate_with_problem_id(code: str, problem_id: str) -> tuple[StructuredEvaluation, list[VisibleTestResult]]:
    problem = _load_problem(problem_id)
    return evaluate_user_code(code, problem)
