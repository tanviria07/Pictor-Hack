import type { CategorySummary, ProblemSummary } from "./types";

/** Build category rows from problem summaries when GET /api/categories is unavailable. */
export function deriveCategoriesFromProblems(
  problems: ProblemSummary[],
): CategorySummary[] {
  const map = new Map<
    string,
    {
      title: string;
      count: number;
      trackId?: string;
      trackTitle?: string;
    }
  >();
  for (const p of problems) {
    const id = p.category || "uncategorized";
    const title = p.category_title || id;
    const cur = map.get(id);
    if (cur) {
      cur.count += 1;
    } else {
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
      const ap = a.track_id === "precode100" ? 0 : 1;
      const bp = b.track_id === "precode100" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.title.localeCompare(b.title);
    });
}
