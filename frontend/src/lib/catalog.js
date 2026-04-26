/**
 * Matches backend `AllCategories` order so the sidebar stays curriculum-ordered
 * when the client falls back to deriving categories from `/api/problems` alone.
 */
export const CURRICULUM_CATEGORY_ORDER = [
    "precode-python-basics",
    "precode-control-flow",
    "precode-core-data-structures",
    "precode-strings-lists",
    "precode-dicts-sets",
    "precode-problem-solving",
    "precode-recursion",
    "precode-oop-foundations",
    "precode-oop-practice",
    "precode-debugging",
    "arrays-hashing",
    "two-pointers",
    "sliding-window",
    "stack",
    "binary-search",
    "linked-list",
    "trees",
    "tries",
    "heap-priority-queue",
    "backtracking",
    "graphs",
    "advanced-graphs",
    "dp-1d",
    "dp-2d",
    "greedy",
    "intervals",
    "math-geometry",
    "bit-manipulation",
];
function curriculumIndex(id) {
    const i = CURRICULUM_CATEGORY_ORDER.indexOf(id);
    return i === -1 ? 10_000 : i;
}
/** Build category rows from problem summaries when GET /api/categories is unavailable. */
export function deriveCategoriesFromProblems(problems) {
    const map = new Map();
    for (const p of problems) {
        const id = p.category || "uncategorized";
        const title = p.category_title || id;
        const cur = map.get(id);
        if (cur) {
            cur.count += 1;
        }
        else {
            map.set(id, {
                title,
                count: 1,
                trackId: p.track_id,
                trackTitle: p.track_title,
            });
        }
    }
    return Array.from(map.entries())
        .map(([id, v]) => ({
        id,
        title: v.title,
        problem_count: v.count,
        track_id: v.trackId,
        track_title: v.trackTitle,
    }))
        .sort((a, b) => {
        const oa = curriculumIndex(a.id);
        const ob = curriculumIndex(b.id);
        if (oa !== ob)
            return oa - ob;
        return a.title.localeCompare(b.title);
    });
}
