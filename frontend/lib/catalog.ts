import type { CategorySummary, ProblemSummary } from "./types";

/** Build category rows from problem summaries when GET /api/categories is unavailable. */
export function deriveCategoriesFromProblems(
  problems: ProblemSummary[],
): CategorySummary[] {
  const map = new Map<string, { title: string; count: number }>();
  for (const p of problems) {
    const id = p.category || "uncategorized";
    const title = p.category_title || id;
    const cur = map.get(id);
    if (cur) {
      cur.count += 1;
    } else {
      map.set(id, { title, count: 1 });
    }
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({
      id,
      title: v.title,
      problem_count: v.count,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
