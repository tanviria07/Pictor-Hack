"use client";

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
      className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform duration-200 ease-out ${
        open ? "rotate-0" : "-rotate-90"
      }`}
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
        trackTitle: c.track_title || (tid === "precode100" ? "PreCode 100" : "NeetCode 150"),
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
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-[#0a0a0c] shadow-sm md:w-[min(100%,19rem)] lg:w-[20.5rem]">
      <div className="shrink-0 space-y-2 border-b border-border/60 bg-surface-panel/20 px-4 py-4">
        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <input
          id="problem-search"
          type="search"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-border/60 bg-zinc-950/80 px-3 py-2 text-[13px] leading-snug text-zinc-200 placeholder:text-zinc-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition-colors focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
        />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="problem-difficulty">
            Difficulty
          </label>
          <select
            id="problem-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="min-w-0 flex-1 cursor-pointer rounded-lg border border-border/60 bg-zinc-950/80 py-2 pl-2.5 pr-8 text-[13px] leading-snug text-zinc-300 transition-colors focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
          >
            <option value="">All levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]">
        {loading && (
          <p className="px-4 py-6 text-center text-[13px] text-zinc-500">
            Loading...
          </p>
        )}
        {!loading && problems.length === 0 && (
          <div className="px-4 py-8 text-center text-[13px] leading-relaxed text-zinc-500">
            <p>No problems loaded.</p>
            <p className="mt-2 text-[12px] text-zinc-600">
              Start the Go API on port 8080, then refresh this page.
            </p>
          </div>
        )}
        {!loading && problems.length > 0 && (
          <div className="divide-y divide-border/40 pb-3">
            {trackGroups.map((group) => {
              const catIds = group.categories.map((c) => c.id);
              const { solved, total } = trackSolvedCount(
                filteredProblems,
                progress,
                catIds,
              );
              return (
                <div key={group.trackId} className="px-0 pt-0">
                  <div className="border-b border-border/30 bg-zinc-950/40 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/95">
                      {group.trackTitle}
                    </p>
                    {group.trackDescription && (
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        {group.trackDescription}
                      </p>
                    )}
                    <p className="mt-2 text-[11px] tabular-nums text-zinc-600">
                      Progress in view:{" "}
                      <span className="text-zinc-400">
                        {solved}/{total} solved
                      </span>
                    </p>
                  </div>
                  {group.categories.map((category) => {
                    const items = problemsByCategory.get(category.id) ?? [];
                    const open = expanded[category.id] !== false;
                    return (
                      <section key={category.id} className="min-w-0">
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() =>
                            setExpanded((current) => ({
                              ...current,
                              [category.id]: !open,
                            }))
                          }
                          className="group flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                        >
                          <Chevron open={open} />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug tracking-tight text-zinc-100">
                            {category.title}
                          </span>
                          <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">
                            {items.length}
                            <span className="text-zinc-600">/</span>
                            {category.problem_count}
                          </span>
                        </button>
                        {category.section_description &&
                          group.trackId === "precode100" && (
                            <p className="px-4 pb-2 text-[11px] leading-relaxed text-zinc-600">
                              {category.section_description}
                            </p>
                          )}

                        <div
                          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                          }`}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <ul className="space-y-px px-3 pb-3 pt-1">
                              {items.length === 0 && (
                                <li className="px-2 py-3 text-center text-[12px] text-zinc-500">
                                  No matches
                                </li>
                              )}
                              {items.map((problem) => {
                                const isSelected = selectedId === problem.id;
                                const progressState =
                                  progress[problem.id] ?? "not_started";
                                return (
                                  <li key={problem.id}>
                                    <button
                                      type="button"
                                      data-testid={`problem-item-${problem.id}`}
                                      onClick={() =>
                                        onSelectProblem(problem.id)
                                      }
                                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
                                        isSelected
                                          ? "bg-zinc-800/70 shadow-sm ring-1 ring-inset ring-zinc-600/50"
                                          : "hover:bg-white/[0.04]"
                                      } `}
                                    >
                                      <PracticeStatusDot
                                        status={progressState}
                                        minimal
                                      />
                                      <span
                                        className={`min-w-0 flex-1 text-[13px] leading-snug ${
                                          isSelected
                                            ? "font-medium text-zinc-50"
                                            : "font-normal text-zinc-300"
                                        }`}
                                      >
                                        {problem.title}
                                      </span>
                                      <DifficultyBadge
                                        difficulty={problem.difficulty}
                                        compact
                                      />
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
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
