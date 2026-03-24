"""
Heuristics for marking submissions as *incomplete* (stub / not a serious attempt).

Limitations (MVP):
- AST does not preserve comments; we combine AST checks with a light source scan
  of the function body lines to catch comment-only placeholders.
- Heuristics can have false positives/negatives; prefer marking borderline cases as
  *wrong* or *partial* once real logic runs and tests execute.
"""

from __future__ import annotations

import ast


def strip_leading_docstring(body: list[ast.stmt]) -> tuple[list[ast.stmt], bool]:
    """Remove a leading docstring expression from a function body."""
    if not body:
        return [], False
    first = body[0]
    if (
        isinstance(first, ast.Expr)
        and isinstance(first.value, ast.Constant)
        and isinstance(first.value.value, str)
    ):
        return body[1:], True
    return body, False


def _is_not_implemented_raise(stmt: ast.stmt) -> bool:
    if not isinstance(stmt, ast.Raise):
        return False
    exc = stmt.exc
    if exc is None:
        return False
    if isinstance(exc, ast.Call):
        fn = exc.func
        if isinstance(fn, ast.Name) and fn.id == "NotImplementedError":
            return True
    if isinstance(exc, ast.Name) and exc.id == "NotImplementedError":
        return True
    return False


def _body_is_only_pass_or_ellipsis(rest: list[ast.stmt]) -> bool:
    if not rest:
        return True
    return all(
        isinstance(s, ast.Pass)
        or (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and s.value.value is ...)
        for s in rest
    )


def ast_body_incomplete(fn_node: ast.FunctionDef) -> tuple[bool, str]:
    """
    Return (True, reason) if the function body is structurally a stub.
    """
    body = fn_node.body
    rest, _ = strip_leading_docstring(body)
    if not rest:
        return True, "empty_body"

    if len(rest) == 1:
        s0 = rest[0]
        if isinstance(s0, ast.Pass):
            return True, "pass_only"
        if isinstance(s0, ast.Expr) and isinstance(s0.value, ast.Constant):
            if s0.value.value is ...:
                return True, "ellipsis_only"
        if isinstance(s0, ast.Return):
            ret = s0.value
            if ret is None:
                return True, "returns_none_explicit"
            if isinstance(ret, ast.Constant) and ret.value is None:
                return True, "returns_none_explicit"
        if _is_not_implemented_raise(s0):
            return True, "raises_not_implemented"

    if _body_is_only_pass_or_ellipsis(rest):
        return True, "only_pass_or_ellipsis"

    # Only NotImplementedError after docstring
    if all(isinstance(s, ast.Raise) and _is_not_implemented_raise(s) for s in rest):
        return True, "raises_not_implemented"

    return False, ""


def source_body_comment_or_pass_only(full_source: str, fn_node: ast.FunctionDef) -> bool:
    """
    True if every non-empty line in the function body (excluding the `def` line)
    is a comment, `pass`, or `...`.
    Uses the first body statement's lineno through end_lineno (Python 3.8+).
    """
    lines = full_source.splitlines()
    end = getattr(fn_node, "end_lineno", None)
    if end is None or not fn_node.body:
        return False
    first_body_lineno = fn_node.body[0].lineno
    # 1-based lineno -> slice [first_body_lineno - 1 : end]
    body_lines = lines[first_body_lineno - 1 : end]
    for line in body_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            continue
        if stripped in ("pass", "...", "pass  # noqa", "pass  # type: ignore"):
            continue
        # allow inline end-of-line comment after pass
        if stripped.split("#", 1)[0].strip() in ("pass", "..."):
            continue
        return False
    return True


def is_incomplete_function(
    full_source: str, fn_node: ast.FunctionDef
) -> tuple[bool, str]:
    """
    Combine AST and source-line heuristics for incomplete implementations.
    """
    inc, reason = ast_body_incomplete(fn_node)
    if inc:
        return True, reason
    if source_body_comment_or_pass_only(full_source, fn_node):
        return True, "comment_or_pass_only_lines"
    return False, ""
