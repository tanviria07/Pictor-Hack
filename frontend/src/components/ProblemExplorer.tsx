import { useEffect, useMemo, useState } from "react";
import { deriveCategoriesFromProblems } from "@/lib/catalog";
import { DifficultyBadge } from "./DifficultyBadge";
import { PracticeStatusDot } from "./PracticeStatusDot";
import type {
  CategorySummary,
  PracticeProgress,
  ProblemSummary,
} from "@/lib/types";

function matchesSearch(problem: ProblemSummary, query: string) {
  if (!query.trim()) return true;
  const normalizedQuery = query.toLowerCase();
  return (
    problem.title.toLowerCase().includes(normalizedQuery) ||
    problem.id.toLowerCase().includes(normalizedQuery) ||
    problem.function_name.toLowerCase().includes(normalizedQuery)
  );
}

function matchesDifficulty(problem: ProblemSummary, difficulty: string) {
  if (!difficulty) return true;
  return problem.difficulty.toLowerCase() === difficulty;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`ex-chevron ${open ? "ex-chevron--open" : "ex-chevron--closed"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

type TrackGroup = {
  trackId: string;
  trackTitle: string;
  trackDescription?: string;
  categories: CategorySummary[];
};

function groupCategoriesByTrack(categories: CategorySummary[]): TrackGroup[] {
  const groups: TrackGroup[] = [];
  for (const c of categories) {
    const tid = c.track_id || "dsa";
    const last = groups[groups.length - 1];
    if (last && last.trackId === tid) {
      last.categories.push(c);
    } else {
      groups.push({
        trackId: tid,
        trackTitle:
          c.track_title ||
          (tid === "precode100" ? "PreCode 100" : "NeetCode 150"),
        trackDescription:
          tid === "precode100"
            ? "Recommended path before DSA: Python fundamentals, problem-solving habits, and OOP."
            : undefined,
        categories: [c],
      });
    }
  }
  return groups;
}

function trackSolvedCount(
  problems: ProblemSummary[],
  progress: Record<string, PracticeProgress>,
  categoryIds: string[],
): { solved: number; total: number } {
  let solved = 0;
  let total = 0;
  const set = new Set(categoryIds);
  for (const p of problems) {
    if (!set.has(p.category)) continue;
    total++;
    if (progress[p.id] === "solved") solved++;
  }
  return { solved, total };
}

export function ProblemExplorer({
  categories,
  problems,
  progress,
  selectedId,
  onSelectProblem,
  loading,
}: {
  categories: CategorySummary[];
  problems: ProblemSummary[];
  progress: Record<string, PracticeProgress>;
  selectedId: string | null;
  onSelectProblem: (id: string) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const displayCategories = useMemo((): CategorySummary[] => {
    if (categories.length > 0) return categories;
    if (problems.length === 0) return [];
    return deriveCategoriesFromProblems(problems);
  }, [categories, problems]);

  const trackGroups = useMemo(
    () => groupCategoriesByTrack(displayCategories),
    [displayCategories],
  );

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const category of displayCategories) {
        if (next[category.id] === undefined) next[category.id] = true;
      }
      return next;
    });
  }, [displayCategories]);

  const filteredProblems = useMemo(() => {
    return problems.filter(
      (problem) =>
        matchesSearch(problem, search) &&
        matchesDifficulty(problem, difficulty),
    );
  }, [problems, search, difficulty]);

  const problemsByCategory = useMemo(() => {
    const categoryMap = new Map<string, ProblemSummary[]>();
    for (const category of displayCategories) categoryMap.set(category.id, []);
    for (const problem of filteredProblems) {
      const items = categoryMap.get(problem.category);
      if (items) items.push(problem);
    }
    return categoryMap;
  }, [displayCategories, filteredProblems]);

  return (
    <div className="ex">
      <div className="ex-toolbar">
        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <input
          id="problem-search"
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ex-input"
        />
        <div className="ex-row">
          <label className="sr-only" htmlFor="problem-difficulty">
            Difficulty
          </label>
          <select
            id="problem-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="ex-select"
          >
            <option value="">All levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="ex-scroll">
        {loading && (
          <p className="ex-loading">Loading...</p>
        )}
        {!loading && problems.length === 0 && (
          <div className="ex-empty">
            <p>No problems loaded.</p>
            <p className="ex-empty-hint">
              Start the Go API on port 8080, then refresh this page.
            </p>
          </div>
        )}
        {!loading && problems.length > 0 && (
          <div className="ex-tracks">
            {trackGroups.map((group) => {
              const catIds = group.categories.map((c) => c.id);
              const { solved, total } = trackSolvedCount(
                filteredProblems,
                progress,
                catIds,
              );
              return (
                <div key={group.trackId} className="ex-track">
                  <div className="ex-track-head">
                    <p className="ex-track-title">{group.trackTitle}</p>
                    {group.trackDescription && (
                      <p className="ex-track-desc">{group.trackDescription}</p>
                    )}
                    <p className="ex-track-progress">
                      Progress in view:{" "}
                      <span>
                        {solved}/{total} solved
                      </span>
                    </p>
                  </div>
                  {group.categories.map((category) => {
                    const items = problemsByCategory.get(category.id) ?? [];
                    const open = expanded[category.id] !== false;
                    return (
                      <section key={category.id}>
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [category.id]: !open,
                            }))
                          }
                          className="ex-cat-btn"
                        >
                          <Chevron open={open} />
                          <span className="ex-cat-title">{category.title}</span>
                          <span className="ex-cat-count">
                            {items.length}
                            <span style={{ color: "#52525b" }}>/</span>
                            {category.problem_count}
                          </span>
                        </button>
                        {category.section_description &&
                          group.trackId === "precode100" && (
                            <p className="ex-section-desc">
                              {category.section_description}
                            </p>
                          )}

                        {open ? (
                          <ul className="ex-list">
                            {items.length === 0 && (
                              <li className="ex-list-empty">No matches</li>
                            )}
                            {items.map((problem) => {
                              const isSelected = selectedId === problem.id;
                              const progressState =
                                progress[problem.id] ?? "not_started";
                              return (
                                <li key={problem.id} className="ex-prob">
                                  <button
                                    type="button"
                                    data-testid={`problem-item-${problem.id}`}
                                    onClick={() => onSelectProblem(problem.id)}
                                    className={`ex-prob-btn${isSelected ? " ex-prob-btn--selected" : ""}`}
                                  >
                                    <PracticeStatusDot
                                      status={progressState}
                                      minimal
                                    />
                                    <span className="ex-prob-title">
                                      {problem.title}
                                    </span>
                                    <DifficultyBadge
                                      difficulty={problem.difficulty}
                                      compact
                                      trackId={problem.track_id}
                                    />
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
