"""
MVP safety checks before executing user code.

Production-grade sandboxing would require:
- OS-level isolation (containers, gVisor, Firecracker, or dedicated judge VMs)
- seccomp / AppArmor profiles blocking syscalls
- Resource limits (CPU, memory, file descriptors, process count)
- Network egress disabled
- Read-only filesystem except a controlled temp workspace
- Per-submission UID separation
"""

from __future__ import annotations

import ast
from typing import FrozenSet

# MVP: block obvious foot-guns; not a complete security boundary.
DISALLOWED_IMPORTS: FrozenSet[str] = frozenset(
    {
        "os",
        "subprocess",
        "sys",
        "shutil",
        "socket",
        "multiprocessing",
        "ctypes",
        "importlib",
        "pty",
        "signal",
        "pickle",
        "marshal",
        "threading",
        "asyncio",
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
                if root in DISALLOWED_IMPORTS:
                    raise SafetyError(f"Import '{alias.name}' is not allowed in the MVP sandbox.")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                root = node.module.split(".")[0]
                if root in DISALLOWED_IMPORTS:
                    raise SafetyError(f"Import from '{node.module}' is not allowed.")


def build_restricted_builtins() -> dict:
    import builtins as bi

    safe = {name: getattr(bi, name) for name in dir(bi) if not name.startswith("_")}
    for name in DISALLOWED_BUILTINS:
        safe.pop(name, None)
    # Keep essentials
    safe["__build_class__"] = getattr(bi, "__build_class__")
    safe["__name__"] = "__user__"
    return safe
