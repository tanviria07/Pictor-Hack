"""
Deterministic evaluation pipeline: syntax -> safety -> entrypoint checks -> exec -> tests -> status.

MVP execution model:
- User code is compiled and executed in-process with a restricted __builtins__ dict.
- A separate subprocess wrapper (see main.py) adds wall-clock timeout and isolates crashes.
- This is NOT a security sandbox: malicious code can still harm the host in many ways.
  Production systems need containers, seccomp, cgroup limits, no network, and read-only FS.
"""

from __future__ import annotations

import ast
import inspect
from copy import deepcopy
from typing import Any, Callable, Optional

from app.incomplete import is_incomplete_function
from app.models import ProblemMeta, StructuredEvaluation, VisibleTestResult
from app.problem_hooks import postprocess_result, postprocess_value, prepare_args
from app.problems import ProblemLoadError, load_problem
from app.safety import SafetyError, assert_code_imports_safe, build_restricted_builtins
from app.testing import normalize_expected


class ListNode:
    def __init__(self, val: int = 0, next: Any = None) -> None:
        self.val = val
        self.next = next


class TreeNode:
    def __init__(self, val: int = 0, left: Any = None, right: Any = None) -> None:
        self.val = val
        self.left = left
        self.right = right


class Node:
    def __init__(
        self,
        val: int = 0,
        neighbors: Optional[list[Any]] = None,
        next: Any = None,
        random: Any = None,
    ) -> None:
        self.val = val
        self.neighbors = neighbors or []
        self.next = next
        self.random = random


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


def _classify_final(
    v_pass: int,
    total_v: int,
    h_pass: int,
    total_h: int,
    fail_summary: Optional[str],
    first_hidden_fail: Optional[str],
) -> tuple[str, str, list[str]]:
    if v_pass == total_v and h_pass == total_h:
        return "correct", "complete", ["All visible and hidden checks passed."]
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
            return (
                "partial",
                "core_logic_present_but_edge_cases_fail",
                [
                    f"Visible samples pass ({v_pass}/{total_v}); hidden checks {h_pass}/{total_h}.",
                    first_hidden_fail or "Exercise edge cases suggested by constraints.",
                ],
            )
        return (
            "partial",
            "progress_but_gaps",
            [
                f"Passed {v_pass}/{total_v} visible and {h_pass}/{total_h} hidden tests.",
                fail_summary or first_hidden_fail or "Keep hunting the failing pattern.",
            ],
        )
    return "partial", "unexpected", ["Review evaluation state."]


def _all_visible_outputs_none(
    user_fn: Callable[..., Any],
    visible_tests: list[dict[str, Any]],
    parameters: list[dict[str, Any]],
    expected_return_type: str,
    g: dict[str, Any],
) -> bool:
    for t in visible_tests:
        raw = list(t["args"])
        try:
            prep = prepare_args(parameters, raw, g)
            got = user_fn(*prep)
            got = postprocess_result(expected_return_type, got)
        except Exception:
            return False
        if got is not None:
            return False
    return True


def _build_meta(problem: dict[str, Any]) -> ProblemMeta:
    return ProblemMeta.model_validate(
        {
            "id": problem["id"],
            "function_name": problem.get("function_name", ""),
            "execution_mode": problem.get("execution_mode", "function"),
            "class_name": problem.get("class_name", ""),
            "comparison": problem.get("comparison", ""),
            "parameters": problem.get("parameters", []),
            "methods": problem.get("methods", []),
            "expected_return_type": problem.get("expected_return_type", ""),
            "visible_tests": problem.get("visible_tests", []),
            "hidden_tests": problem.get("hidden_tests", []),
        }
    )


def _runtime_globals() -> dict[str, Any]:
    return {
        "__builtins__": build_restricted_builtins(),
        "ListNode": ListNode,
        "TreeNode": TreeNode,
        "Node": Node,
    }


def _evaluate_function(code: str, meta: ProblemMeta, tree: ast.Module) -> StructuredEvaluation:
    fname = meta.function_name
    expected_arity = len(meta.parameters)
    ev = _empty_eval("incomplete", meta)
    visible_results: list[VisibleTestResult] = []

    fn_node: ast.FunctionDef | None = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == fname:
            fn_node = node
            break

    if fn_node is None:
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            failing_case_summary=f"Define a top-level function named `{fname}` matching the statement.",
            likely_stage="missing_entrypoint",
            feedback_targets=[f"Implement `{fname}` with the requested parameters."],
        )

    ev.function_found = True

    ast_args = [a for a in fn_node.args.args]
    if len(ast_args) != expected_arity:
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary="Parameter count does not match the required signature.",
            likely_stage="signature_mismatch",
            feedback_targets=[f"Match parameter list length {expected_arity} and names from the prompt."],
        )

    ev.signature_ok = True

    inc, reason = is_incomplete_function(code, fn_node)
    if inc:
        return _empty_eval(
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

    g = _runtime_globals()
    try:
        exec(compile(tree, "<user>", "exec"), g, g)  # noqa: S102
    except Exception as e:
        return _empty_eval(
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

    user_fn = g.get(fname)
    if not callable(user_fn):
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary=f"`{fname}` is not callable after execution.",
            likely_stage="not_callable",
            feedback_targets=["Ensure the function name matches and is a real function."],
        )

    if not _arity(user_fn, expected_arity):
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary="Runtime signature does not match the expected arity.",
            likely_stage="signature_mismatch_runtime",
            feedback_targets=["Fix parameters so the function accepts the expected arguments."],
        )

    fail_summary: Optional[str] = None
    v_pass = 0
    for i, t in enumerate(meta.visible_tests):
        args = list(t["args"])
        exp = t["expected"]
        try:
            prep = prepare_args(meta.parameters, args, g)
            original = deepcopy(prep)
            got = user_fn(*prep)
            got = postprocess_result(meta.expected_return_type, got)
            if meta.comparison == "mutates_first_arg" and prep:
                got = postprocess_value(meta.parameters[0].get("type", ""), prep[0])
            ok = normalize_expected(meta.id, got, exp, prep if meta.comparison != "mutates_first_arg" else original, meta.comparison)
        except Exception as e:
            vr = visible_results + [VisibleTestResult(index=i, passed=False, label=f"visible#{i + 1}")]
            return StructuredEvaluation(
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

        visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
        if ok:
            v_pass += 1
        elif fail_summary is None:
            fail_summary = f"Visible test {i + 1} failed (output mismatch)."

    if (
        v_pass == 0
        and meta.visible_tests
        and _all_visible_outputs_none(
            user_fn, meta.visible_tests, meta.parameters, meta.expected_return_type, g
        )
        and any(t.get("expected") is not None for t in meta.visible_tests)
    ):
        return StructuredEvaluation(
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

    h_pass = 0
    first_hidden_fail: Optional[str] = None
    for t in meta.hidden_tests:
        args = list(t["args"])
        exp = t["expected"]
        try:
            prep = prepare_args(meta.parameters, args, g)
            original = deepcopy(prep)
            got = user_fn(*prep)
            got = postprocess_result(meta.expected_return_type, got)
            if meta.comparison == "mutates_first_arg" and prep:
                got = postprocess_value(meta.parameters[0].get("type", ""), prep[0])
            ok = normalize_expected(meta.id, got, exp, prep if meta.comparison != "mutates_first_arg" else original, meta.comparison)
        except Exception as e:
            return StructuredEvaluation(
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
        if ok:
            h_pass += 1
        elif first_hidden_fail is None:
            first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."

    status, likely, targets = _classify_final(
        v_pass, len(meta.visible_tests), h_pass, len(meta.hidden_tests), fail_summary, first_hidden_fail
    )
    return StructuredEvaluation(
        status=status,  # type: ignore[arg-type]
        syntax_ok=True,
        function_found=True,
        signature_ok=True,
        passed_visible_tests=v_pass,
        total_visible_tests=len(meta.visible_tests),
        passed_hidden_tests=h_pass,
        total_hidden_tests=len(meta.hidden_tests),
        error_type=None,
        error_message=None,
        failing_case_summary=fail_summary or first_hidden_fail,
        likely_stage=likely,
        feedback_targets=[t for t in targets if t],
        visible_test_results=visible_results,
    )


def _evaluate_class(meta: ProblemMeta, tree: ast.Module) -> StructuredEvaluation:
    class_name = meta.class_name or meta.function_name
    class_node: ast.ClassDef | None = None
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            class_node = node
            break

    if class_node is None:
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            failing_case_summary=f"Define a class named `{class_name}` matching the statement.",
            likely_stage="missing_entrypoint",
            feedback_targets=[f"Implement `{class_name}` with the requested methods."],
        )

    g = _runtime_globals()
    try:
        exec(compile(tree, "<user>", "exec"), g, g)  # noqa: S102
    except Exception as e:
        return _empty_eval(
            "runtime_error",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            error_type=type(e).__name__,
            error_message=str(e),
            likely_stage="import_or_global_runtime",
            feedback_targets=["Code failed before tests ran; check definitions and allowed operations."],
        )

    klass = g.get(class_name)
    if klass is None or not inspect.isclass(klass):
        return _empty_eval(
            "incomplete",
            meta,
            syntax_ok=True,
            function_found=True,
            signature_ok=False,
            failing_case_summary=f"`{class_name}` is not a class after execution.",
            likely_stage="not_callable",
            feedback_targets=["Ensure the class name matches the prompt exactly."],
        )

    visible_results: list[VisibleTestResult] = []
    v_pass = 0
    fail_summary: Optional[str] = None

    for i, t in enumerate(meta.visible_tests):
        ops = t.get("ops", [])
        args_list = t.get("args", [])
        expected = t.get("expected", [])
        try:
            if meta.comparison == "codec_roundtrip_strings":
                instance = klass()
                raw_input = t.get("args", [None])[0]
                encoded = instance.encode(raw_input)
                outputs = [None, encoded, instance.decode(encoded)]
                ok = normalize_expected(meta.id, outputs, t.get("expected"), comparison=meta.comparison)
                visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
                if ok:
                    v_pass += 1
                elif fail_summary is None:
                    fail_summary = f"Visible test {i + 1} failed (output mismatch)."
                continue
            if meta.comparison == "codec_roundtrip_tree":
                instance = klass()
                raw_input = list(t.get("args", [None])[0])
                tree = prepare_args([{"type": "TreeNode"}], [raw_input], g)[0]
                serialized = instance.serialize(tree)
                decoded = instance.deserialize(serialized)
                outputs = [None, serialized, postprocess_value("TreeNode", decoded)]
                ok = normalize_expected(meta.id, outputs, t.get("expected"), comparison=meta.comparison)
                visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
                if ok:
                    v_pass += 1
                elif fail_summary is None:
                    fail_summary = f"Visible test {i + 1} failed (output mismatch)."
                continue
            instance = None
            outputs: list[Any] = []
            for idx, op in enumerate(ops):
                raw_args = list(args_list[idx]) if idx < len(args_list) else []
                if idx == 0:
                    instance = klass(*raw_args)
                    outputs.append(None)
                    continue
                if instance is None:
                    raise RuntimeError("Class instance was not created.")
                method = getattr(instance, op)
                outputs.append(method(*raw_args))
            ok = normalize_expected(meta.id, outputs, expected, comparison=meta.comparison)
        except Exception as e:
            vr = visible_results + [VisibleTestResult(index=i, passed=False, label=f"visible#{i + 1}")]
            return StructuredEvaluation(
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
                feedback_targets=["Stabilize execution on the example call sequence first."],
                visible_test_results=vr,
            )
        visible_results.append(VisibleTestResult(index=i, passed=ok, label=f"visible#{i + 1}"))
        if ok:
            v_pass += 1
        elif fail_summary is None:
            fail_summary = f"Visible test {i + 1} failed (output mismatch)."

    h_pass = 0
    first_hidden_fail: Optional[str] = None
    for t in meta.hidden_tests:
        ops = t.get("ops", [])
        args_list = t.get("args", [])
        expected = t.get("expected", [])
        try:
            if meta.comparison == "codec_roundtrip_strings":
                instance = klass()
                raw_input = t.get("args", [None])[0]
                encoded = instance.encode(raw_input)
                outputs = [None, encoded, instance.decode(encoded)]
                ok = normalize_expected(meta.id, outputs, t.get("expected"), comparison=meta.comparison)
                if ok:
                    h_pass += 1
                elif first_hidden_fail is None:
                    first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."
                continue
            if meta.comparison == "codec_roundtrip_tree":
                instance = klass()
                raw_input = list(t.get("args", [None])[0])
                tree = prepare_args([{"type": "TreeNode"}], [raw_input], g)[0]
                serialized = instance.serialize(tree)
                decoded = instance.deserialize(serialized)
                outputs = [None, serialized, postprocess_value("TreeNode", decoded)]
                ok = normalize_expected(meta.id, outputs, t.get("expected"), comparison=meta.comparison)
                if ok:
                    h_pass += 1
                elif first_hidden_fail is None:
                    first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."
                continue
            instance = None
            outputs: list[Any] = []
            for idx, op in enumerate(ops):
                raw_args = list(args_list[idx]) if idx < len(args_list) else []
                if idx == 0:
                    instance = klass(*raw_args)
                    outputs.append(None)
                    continue
                if instance is None:
                    raise RuntimeError("Class instance was not created.")
                method = getattr(instance, op)
                outputs.append(method(*raw_args))
            ok = normalize_expected(meta.id, outputs, expected, comparison=meta.comparison)
        except Exception as e:
            return StructuredEvaluation(
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
                feedback_targets=["Re-check class state transitions and method contracts."],
                visible_test_results=visible_results,
            )
        if ok:
            h_pass += 1
        elif first_hidden_fail is None:
            first_hidden_fail = "At least one hidden case still fails (inputs not revealed)."

    status, likely, targets = _classify_final(
        v_pass, len(meta.visible_tests), h_pass, len(meta.hidden_tests), fail_summary, first_hidden_fail
    )
    return StructuredEvaluation(
        status=status,  # type: ignore[arg-type]
        syntax_ok=True,
        function_found=True,
        signature_ok=True,
        passed_visible_tests=v_pass,
        total_visible_tests=len(meta.visible_tests),
        passed_hidden_tests=h_pass,
        total_hidden_tests=len(meta.hidden_tests),
        error_type=None,
        error_message=None,
        failing_case_summary=fail_summary or first_hidden_fail,
        likely_stage=likely,
        feedback_targets=[t for t in targets if t],
        visible_test_results=visible_results,
    )


def evaluate_user_code(code: str, problem: dict[str, Any]) -> StructuredEvaluation:
    meta = _build_meta(problem)
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        ev = _empty_eval(
            "syntax_error",
            meta,
            syntax_ok=False,
            likely_stage="fix_syntax",
            feedback_targets=["Resolve syntax errors before reasoning about logic."],
        )
        ev.error_type = "SyntaxError"
        ev.error_message = str(e)
        return ev

    try:
        assert_code_imports_safe(code)
    except SafetyError as e:
        return _empty_eval(
            "runtime_error",
            meta,
            syntax_ok=True,
            error_type="SafetyError",
            error_message=e.message,
            likely_stage="disallowed_import",
            feedback_targets=["Avoid restricted imports in the MVP sandbox."],
        )

    if meta.execution_mode == "class":
        return _evaluate_class(meta, tree)
    return _evaluate_function(code, meta, tree)


def evaluate_with_problem_id(code: str, problem_id: str) -> StructuredEvaluation:
    try:
        problem = load_problem(problem_id)
    except ProblemLoadError as e:
        return StructuredEvaluation(
            status="internal_error",
            syntax_ok=True,
            function_found=False,
            signature_ok=False,
            passed_visible_tests=0,
            total_visible_tests=0,
            passed_hidden_tests=0,
            total_hidden_tests=0,
            error_type="ProblemLoadError",
            error_message=str(e),
            failing_case_summary=None,
            likely_stage="platform",
            feedback_targets=[
                "Internal platform error while loading this problem. Your code may be correct.",
            ],
            visible_test_results=[],
        )
    return evaluate_user_code(code, problem)
