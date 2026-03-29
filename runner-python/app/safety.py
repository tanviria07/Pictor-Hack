"""
Static checks before executing user code: allowlisted imports only, restricted builtins.

Docker + OS isolation are the primary boundary; this layer blocks obvious abuse in-process.
"""

from __future__ import annotations

import ast
from typing import FrozenSet

# Top-level module names users may import (stdlib-style, no I/O or process primitives).
ALLOWED_IMPORT_ROOTS: FrozenSet[str] = frozenset(
    {
        "typing",
        "collections",
        "itertools",
        "functools",
        "operator",
        "heapq",
        "bisect",
        "math",
        "string",
        "re",
        "copy",
        "enum",
        "random",
        "decimal",
        "fractions",
        "json",
        "queue",
        "statistics",
        "dataclasses",
        "abc",
        "contextlib",
        "types",
    }
)

DISALLOWED_BUILTINS: FrozenSet[str] = frozenset(
    {
        "open",
        "exec",
        "eval",
        "compile",
        "__import__",
        "globals",
        "locals",
        "getattr",
        "setattr",
        "delattr",
        "input",
    }
)


class SafetyError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def assert_code_imports_safe(source: str) -> None:
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in ALLOWED_IMPORT_ROOTS:
                    raise SafetyError(
                        f"Import '{alias.name}' is not allowed. Only a fixed set of standard modules may be used."
                    )
        elif isinstance(node, ast.ImportFrom):
            if node.level != 0:
                raise SafetyError("Relative imports are not allowed.")
            if not node.module:
                raise SafetyError("Invalid import statement.")
            root = node.module.split(".")[0]
            if root not in ALLOWED_IMPORT_ROOTS:
                raise SafetyError(
                    f"Import from '{node.module}' is not allowed. Only a fixed set of standard modules may be used."
                )


def build_restricted_builtins() -> dict:
    import builtins as bi

    safe = {name: getattr(bi, name) for name in dir(bi) if not name.startswith("_")}
    for name in DISALLOWED_BUILTINS:
        safe.pop(name, None)
    safe["__build_class__"] = getattr(bi, "__build_class__")
    safe["__name__"] = "__user__"
    return safe
