"""Problem-specific argument coercion for structures (ListNode, TreeNode) from JSON."""

from __future__ import annotations

from collections import deque
from typing import Any


def build_linked_list(LN: type, values: list[Any]) -> Any:
    if not values:
        return None
    head = LN(values[0])
    cur = head
    for v in values[1:]:
        cur.next = LN(v)
        cur = cur.next
    return head


def linked_list_to_list(head: Any) -> list[Any]:
    out: list[Any] = []
    while head is not None:
        out.append(head.val)
        head = head.next
    return out


def build_tree(TN: type, values: list[Any]) -> Any:
    if not values or values[0] is None:
        return None
    root = TN(values[0])
    q: deque[Any] = deque([root])
    i = 1
    while q and i < len(values):
        node = q.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TN(values[i])
            q.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TN(values[i])
            q.append(node.right)
        i += 1
    return root


def prepare_args(problem_id: str, args: list[Any], g: dict[str, Any]) -> list[Any]:
    if problem_id == "reverse-linked-list":
        ln = g.get("ListNode")
        if ln is None:
            raise RuntimeError("Define class ListNode before reverse_list.")
        return [build_linked_list(ln, list(args[0]))]
    if problem_id == "same-tree":
        tn = g.get("TreeNode")
        if tn is None:
            raise RuntimeError("Define class TreeNode before same_tree.")
        return [build_tree(tn, list(args[0])), build_tree(tn, list(args[1]))]
    return args


def postprocess_result(problem_id: str, got: Any) -> Any:
    if problem_id == "reverse-linked-list":
        return linked_list_to_list(got) if got is not None else []
    return got
