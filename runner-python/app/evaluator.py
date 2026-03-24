"""
Deterministic evaluation pipeline: syntax → safety → AST (function/signature/incomplete) → exec → tests → status.

MVP execution model:
- User code is compiled and executed in-process with a restricted __builtins__ dict.
- A separate subprocess wrapper (see main.py) adds wall-clock timeout and isolates crashes.
- This is NOT a security sandbox: malicious code can still harm the host in many ways.
  Production systems need containers, seccomp, cgroup limits, no network, and read-only FS.
"""

from __future__ import annotations

import ast
import inspect
from typing import Any, Callable, Optional

from app.incomplete import is_incomplete_function
from app.models import ProblemMeta, StructuredEvaluation, VisibleTestResult
from app.problems import load_problem
from app.safety import SafetyError, assert_code_imports_safe, build_restricted_builtins
from app.testing import normalize_expected


def _empty_eval(
    status: str,
    meta: ProblemMeta,
    *,
    syntax_ok: bool = False,
    function_found: bool = False,
    signature_ok: bool = False,
    error_type: Optional[str] = None,
    error_message: Optional[str] = None,
    failing_case_summary: Optional[str] = None,
    likely_stage: str = "unknown",
    feedback_targets: Optional[list[str]] = None,
) -> StructuredEvaluation:
    return StructuredEvaluation(
        status=status,  # type: ignore[arg-type]
        syntax_ok=syntax_ok,
        function_found=function_found,
        signature_ok=signature_ok,
        passed_visible_tests=0,
        total_visible_tests=len(meta.visible_tests),
        passed_hidden_tests=0,
        total_hidden_tests=len(meta.hidden_tests),
        error_type=error_type,
        error_message=error_message,
        failing_case_summary=failing_case_summary,
        likely_stage=likely_stage,
        feedback_targets=feedback_targets or [],
        visible_test_results=[],
    )


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
    if any(
        p.kind in (inspect.Parameter.VAR_POSITIONAL, inspect.Parameter.VAR_KEYWORD)
        for p in sig.parameters.values()
    ):
        return False
    return len(params) == expected


def _all_visible_outputs_none(
    user_fn: Callable[..., Any], visible_tests: list[dict[str, Any]]
) -> bool:
    """Heuristic: every call returns None — likely missing real return logic."""
    for t in visible_tests:
        args = t["args"]
        try:
            got = user_fn(*args)
        except Exception:
            return False
        if got is not None:
            return False
    return True


def _classify_final(
    v_pass: int,
    total_v: int,
    h_pass: int,
    total_h: int,
    fail_summary: Optional[str],
    first_hidden_fail: Optional[str],
) -> tuple[str, str, list[str]]:
    if v_pass == total_v and h_pass == total_h:
        return (
            "correct",
            "complete",
            ["All visible and hidden checks passed."],
        )
    if v_pass == 0:
        return (
            "wrong",
            "logic_not_matching_samples",
            [
                "Align your approach with the sample behavior first.",
                fail_summary or "Compare return values carefully.",
            ],
        )
    if v_pass < total_v or h_pass < total_h:
        if v_pass == total_v and h_pass < total_h:
            stage = "core_logic_present_but_edge_cases_fail"
            targets = [
                f"Visible samples pass ({v_pass}/{total_v}); hidden checks {h_pass}/{total_h}.",
                first_hidden_fail or "Exercise edge cases suggested by constraints.",
            ]
        else:
            stage = "progress_but_gaps"
            targets = [
                f"Passed {v_pass}/{total_v} visible and {h_pass}/{total_h} hidden tests.",
                fail_summary or first_hidden_fail or "Keep hunting the failing pattern.",
            ]
        return "partial", stage, targets
    return "partial", "unexpected", ["Review evaluation state."]


def evaluate_user_code(code: str, problem: dict[str, Any]) -> StructuredEvaluation:
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

    ev = _empty_eval("incomplete", meta)
    visible_results: list[VisibleTestResult] = []

    # 1) Syntax
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        ev = _empty_eval(
            "syntax_error",
            meta,
            syntax_ok=False,
            failing_case_summary=None,
            likely_stage="fix_syntax",
            feedback_targets=["Resolve syntax errors before reasoning about logic."],
        )
        ev.error_type = "SyntaxError"
        ev.error_message = str(e)
        return ev

    ev.syntax_ok = True

    # 2) Safety (imports) — MVP denylist; not a full sandbox.
    try:
        assert_code_imports_safe(code)
    except SafetyError as e:
        ev = _empty_eval(
            "runtime_error",
            meta,
            syntax_ok=True,
            error_type="SafetyError",
            error_message=e.message,
            likely_stage="disallowed_import",
            feedback_targets=["Avoid restricted imports in the MVP sandbox."],
        )
        return ev

    # 3) Target function in AST
    fn_node: ast.FunctionDef | None = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == fname:
            fn_node = node
            break

    if fn_node is None:
        ev = _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            failing_case_summary=f"Define a top-level function named `{fname}` matching the statement.",
            likely_stage="missing_entrypoint",
            feedback_targets=[f"Implement `{fname}` with the requested parameters."],
        )
        return ev

    ev.function_found = True

    # 4) Arity (AST)
    ast_args = [a for a in fn_node.args.args]  # noqa: RUF005
    if len(ast_args) != expected_arity:
        ev = _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary="Parameter count does not match the required signature.",
            likely_stage="signature_mismatch",
            feedback_targets=[f"Match parameter list length {expected_arity} and names from the prompt."],
        )
        return ev

    ev.signature_ok = True

    # 5) Incomplete body (stub / placeholder / NotImplemented)
    inc, reason = is_incomplete_function(code, fn_node)
    if inc:
        ev = _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=True,
            failing_case_summary=f"Implementation not ready for tests ({reason}).",
            likely_stage="implementation_stub",
            feedback_targets=[
                "Replace placeholders, stubs, TODO-only comments, or raise NotImplementedError with real logic.",
            ],
        )
        return ev

    # 6) Execute user module with restricted builtins (same-process MVP; subprocess optional in main).
    g: dict[str, Any] = {"__builtins__": build_restricted_builtins()}
    try:
        exec(compile(tree, "<user>", "exec"), g, g)  # noqa: S102 — intentional for MVP judge
    except Exception as e:
        ev = _empty_eval(
            "runtime_error",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=True,
            error_type=type(e).__name__,
            error_message=str(e),
            likely_stage="import_or_global_runtime",
            feedback_targets=["Code failed before tests ran; check definitions and allowed operations."],
        )
        return ev

    user_fn = g.get(fname)
    if not callable(user_fn):
        ev = _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary=f"`{fname}` is not callable after execution.",
            likely_stage="not_callable",
            feedback_targets=["Ensure the function name matches and is a real function."],
        )
        return ev

    if not _arity(user_fn, expected_arity):
        ev = _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary="Runtime signature does not match the expected arity.",
            likely_stage="signature_mismatch_runtime",
            feedback_targets=["Fix parameters so the function accepts the expected arguments."],
        )
        return ev

    def run_case(args: list[Any]) -> Any:
        return user_fn(*args)

    fail_summary: Optional[str] = None
    v_pass = 0
    for i, t in enumerate(meta.visible_tests):
        args = t["args"]
        exp = t["expected"]
        try:
            got = run_case(args)
            ok = normalize_expected(pid, got, exp, args)
        except Exception as e:
            vr = visible_results + [
                VisibleTestResult(index=i, passed=False, label=f"visible#{i + 1}")
            ]
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
                visible_test_results=vr,
            )
            return ev

        visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
        if ok:
            v_pass += 1
        elif fail_summary is None:
            fail_summary = f"Visible test {i + 1} failed (output mismatch)."

    # Heuristic: always returns None on visible tests while expectations are non-None → incomplete
    if (
        v_pass == 0
        and meta.visible_tests
        and _all_visible_outputs_none(user_fn, meta.visible_tests)
        and any(t.get("expected") is not None for t in meta.visible_tests)
    ):
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
            failing_case_summary="Function returns None on visible tests while outputs are expected.",
            likely_stage="returns_none_no_logic",
            feedback_targets=[
                "Add logic that returns the required type; avoid returning None unless the problem allows it.",
            ],
            visible_test_results=visible_results,
        )
        return ev

    h_pass = 0
    first_hidden_fail: Optional[str] = None
    for j, t in enumerate(meta.hidden_tests):
        args = t["args"]
        exp = t["expected"]
        try:
            got = run_case(args)
            ok = normalize_expected(pid, got, exp, args)
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
                visible_test_results=visible_results,
            )
            return ev

        if ok:
            h_pass += 1
        elif first_hidden_fail is None:
            first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."

    total_v = len(meta.visible_tests)
    total_h = len(meta.hidden_tests)

    status, likely, targets = _classify_final(
        v_pass, total_v, h_pass, total_h, fail_summary, first_hidden_fail
    )

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
        visible_test_results=visible_results,
    )
    return ev


def evaluate_with_problem_id(code: str, problem_id: str) -> StructuredEvaluation:
    problem = load_problem(problem_id)
    return evaluate_user_code(code, problem)
