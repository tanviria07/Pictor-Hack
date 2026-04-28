import { deriveCategoriesFromProblems } from "./catalog";
export const BLIND_75_IDS = [
    "contains-duplicate",
    "valid-anagram",
    "two-sum",
    "group-anagrams",
    "top-k-frequent-elements",
    "product-of-array-except-self",
    "valid-sudoku",
    "encode-and-decode-strings",
    "longest-consecutive-sequence",
    "valid-palindrome",
    "two-sum-ii-input-array-is-sorted",
    "3sum",
    "container-with-most-water",
    "best-time-to-buy-and-sell-stock",
    "longest-substring-without-repeating-characters",
    "longest-repeating-character-replacement",
    "minimum-window-substring",
    "permutation-in-string",
    "valid-parentheses",
    "min-stack",
    "evaluate-reverse-polish-notation",
    "generate-parentheses",
    "daily-temperatures",
    "car-fleet",
    "largest-rectangle-in-histogram",
    "binary-search",
    "search-a-2d-matrix",
    "koko-eating-bananas",
    "find-minimum-in-rotated-sorted-array",
    "search-in-rotated-sorted-array",
    "reverse-linked-list",
    "merge-two-sorted-lists",
    "reorder-list",
    "remove-nth-node-from-end-of-list",
    "copy-list-with-random-pointer",
    "add-two-numbers",
    "linked-list-cycle",
    "invert-binary-tree",
    "maximum-depth-of-binary-tree",
    "diameter-of-binary-tree",
    "balanced-binary-tree",
    "same-tree",
    "subtree-of-another-tree",
    "lowest-common-ancestor-of-a-binary-search-tree",
    "binary-tree-level-order-traversal",
    "binary-tree-right-side-view",
    "count-good-nodes-in-binary-tree",
    "validate-binary-search-tree",
    "kth-smallest-element-in-a-bst",
    "construct-binary-tree-from-preorder-and-inorder-traversal",
    "binary-tree-maximum-path-sum",
    "serialize-and-deserialize-binary-tree",
    "implement-trie-prefix-tree",
    "design-add-and-search-words-data-structure",
    "find-median-from-data-stream",
    "kth-largest-element-in-an-array",
    "subsets",
    "combination-sum",
    "permutations",
    "word-search",
    "number-of-islands",
    "clone-graph",
    "max-area-of-island",
    "pacific-atlantic-water-flow",
    "course-schedule",
    "graph-valid-tree",
    "number-of-connected-components-in-an-undirected-graph",
    "redundant-connection",
    "climbing-stairs",
    "coin-change",
    "house-robber",
    "house-robber-ii",
    "longest-increasing-subsequence",
    "decode-ways",
    "word-break",
];
const BLIND_75_SET = new Set(BLIND_75_IDS);
export function isProblemInTrack(problem, trackFilter) {
    if (trackFilter === "all")
        return true;
    if (trackFilter === "blind75")
        return BLIND_75_SET.has(problem.id);
    return (problem.track_id || "dsa") === trackFilter;
}
export function filterProblemsByTrack(problems, trackFilter) {
    return problems.filter((problem) => isProblemInTrack(problem, trackFilter));
}
export function filterCategoriesByTrack(categories, problems, trackFilter) {
    const base = categories.length > 0
        ? categories
        : problems.length === 0
            ? []
            : deriveCategoriesFromProblems(problems);
    if (trackFilter === "all")
        return base;
    if (trackFilter === "blind75") {
        const subset = filterProblemsByTrack(problems, trackFilter);
        const derived = deriveCategoriesFromProblems(subset);
        const metaById = new Map(base.map((category) => [category.id, category]));
        return derived.map((category) => ({
            ...category,
            section_description: metaById.get(category.id)?.section_description ??
                category.section_description,
        }));
    }
    return base.filter((category) => (category.track_id || "dsa") === trackFilter);
}

export function problemTypeOf(problem) {
    return (problem?.problem_type || "coding").toLowerCase();
}

export function isCodingProblem(problem) {
    return problemTypeOf(problem) === "coding";
}
