"""Helpers for coercing JSON inputs/outputs for ListNode and TreeNode problems."""

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


def build_random_list(Node: type, values: list[list[Any]]) -> Any:
    if not values:
        return None
    nodes = [Node(pair[0]) for pair in values]
    for i in range(len(nodes) - 1):
        nodes[i].next = nodes[i + 1]
    for i, pair in enumerate(values):
        random_index = pair[1]
        nodes[i].random = None if random_index is None else nodes[random_index]
    return nodes[0]


def random_list_to_list(head: Any) -> list[list[Any]]:
    out_nodes: list[Any] = []
    cur = head
    seen: set[int] = set()
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        out_nodes.append(cur)
        cur = getattr(cur, "next", None)
    index_by_id = {id(node): idx for idx, node in enumerate(out_nodes)}
    out: list[list[Any]] = []
    for node in out_nodes:
        random_node = getattr(node, "random", None)
        out.append([getattr(node, "val", None), index_by_id.get(id(random_node)) if random_node else None])
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


def tree_to_list(root: Any) -> list[Any]:
    if root is None:
        return []
    out: list[Any] = []
    q: deque[Any] = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
            continue
        out.append(node.val)
        q.append(getattr(node, "left", None))
        q.append(getattr(node, "right", None))
    while out and out[-1] is None:
        out.pop()
    return out


def build_graph(Node: type, adj: list[list[int]]) -> Any:
    if not adj:
        return None
    nodes = [Node(i + 1) for i in range(len(adj))]
    for i, neighbors in enumerate(adj):
        nodes[i].neighbors = [nodes[val - 1] for val in neighbors]
    return nodes[0]


def graph_to_adj_list(node: Any) -> list[list[int]]:
    if node is None:
        return []
    q: deque[Any] = deque([node])
    by_val: dict[int, Any] = {}
    while q:
        cur = q.popleft()
        val = getattr(cur, "val", None)
        if val in by_val:
            continue
        by_val[val] = cur
        for neighbor in getattr(cur, "neighbors", []) or []:
            q.append(neighbor)
    out: list[list[int]] = []
    for val in sorted(by_val):
        neighbors = getattr(by_val[val], "neighbors", []) or []
        out.append(sorted(getattr(neighbor, "val", None) for neighbor in neighbors))
    return out


def _contains(type_name: str, needle: str) -> bool:
    return needle.lower() in (type_name or "").lower()


def _prepare_value(type_name: str, value: Any, g: dict[str, Any]) -> Any:
    if _contains(type_name, "randomlistnode"):
        node = g.get("Node")
        if node is None:
            raise RuntimeError("Node helper is unavailable for random-list tests.")
        return build_random_list(node, list(value))
    if _contains(type_name, "graphnode"):
        node = g.get("Node")
        if node is None:
            raise RuntimeError("Node helper is unavailable for graph tests.")
        return build_graph(node, list(value))
    if _contains(type_name, "listnode"):
        ln = g.get("ListNode")
        if ln is None:
            raise RuntimeError("Define class ListNode before running linked-list tests.")
        return build_linked_list(ln, list(value))
    if _contains(type_name, "treenode"):
        tn = g.get("TreeNode")
        if tn is None:
            raise RuntimeError("Define class TreeNode before running tree tests.")
        return build_tree(tn, list(value))
    return value


def prepare_args(parameters: list[dict[str, Any]], args: list[Any], g: dict[str, Any]) -> list[Any]:
    out: list[Any] = []
    for idx, arg in enumerate(args):
        type_name = ""
        if idx < len(parameters):
            type_name = str(parameters[idx].get("type", ""))
        out.append(_prepare_value(type_name, arg, g))
    return out


def postprocess_value(type_name: str, got: Any) -> Any:
    if _contains(type_name, "randomlistnode"):
        return random_list_to_list(got) if got is not None else []
    if _contains(type_name, "graphnode"):
        return graph_to_adj_list(got)
    if _contains(type_name, "listnode"):
        return linked_list_to_list(got) if got is not None else []
    if _contains(type_name, "treenode"):
        return tree_to_list(got)
    return got


def postprocess_result(expected_return_type: str, got: Any) -> Any:
    return postprocess_value(expected_return_type, got)
