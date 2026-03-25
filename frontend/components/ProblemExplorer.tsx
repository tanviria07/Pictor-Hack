"use client";

import { useEffect, useMemo, useState } from "react";
import { deriveCategoriesFromProblems } from "@/lib/catalog";
import { DifficultyBadge } from "./DifficultyBadge";
import { PracticeStatusDot } from "./PracticeStatusDot";
import type { CategorySummary, PracticeProgress, ProblemSummary } from "@/lib/types";

function matchesSearch(p: ProblemSummary, q: string) {
  if (!q.trim()) return true;
  const s = q.toLowerCase();
  return (
    p.title.toLowerCase().includes(s) ||
    p.id.toLowerCase().includes(s) ||
    p.function_name.toLowerCase().includes(s)
  );
}

function matchesDifficulty(p: ProblemSummary, d: string) {
  if (!d) return true;
  return p.difficulty.toLowerCase() === d;
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

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const c of displayCategories) {
        if (next[c.id] === undefined) next[c.id] = true;
      }
      return next;
    });
  }, [displayCategories]);

  const filtered = useMemo(() => {
    return problems.filter(
      (p) => matchesSearch(p, search) && matchesDifficulty(p, difficulty),
    );
  }, [problems, search, difficulty]);

  const byCat = useMemo(() => {
    const m = new Map<string, ProblemSummary[]>();
    for (const c of displayCategories) m.set(c.id, []);
    for (const p of filtered) {
      const arr = m.get(p.category);
      if (arr) arr.push(p);
    }
    return m;
  }, [displayCategories, filtered]);

  return (
    <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-b border-border/80 bg-[#0a0a0c] md:w-[min(100%,19rem)] md:border-b-0 md:border-r md:border-border/80 lg:w-[20.5rem]">
      {/* Filters — compact strip */}
      <div className="shrink-0 space-y-2 border-b border-border/60 px-3 py-3 sm:px-3.5">
        <label className="sr-only" htmlFor="problem-search">
          Search problems
        </label>
        <input
          id="problem-search"
          type="search"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border/60 bg-zinc-950/80 px-3 py-2 text-[13px] leading-snug text-zinc-200 placeholder:text-zinc-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] transition-colors focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
        />
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="problem-difficulty">
            Difficulty
          </label>
          <select
            id="problem-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="min-w-0 flex-1 cursor-pointer rounded-md border border-border/60 bg-zinc-950/80 py-2 pl-2.5 pr-8 text-[13px] leading-snug text-zinc-300 transition-colors focus:border-zinc-500/50 focus:outline-none focus:ring-1 focus:ring-zinc-500/30"
          >
            <option value="">All levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable]">
        {loading && (
          <p className="px-4 py-6 text-center text-[13px] text-zinc-500">
            Loading…
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
            {displayCategories.map((cat) => {
              const items = byCat.get(cat.id) ?? [];
              const open = expanded[cat.id] !== false;
              return (
                <section key={cat.id} className="min-w-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [cat.id]: !open }))
                    }
                    className="group flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03] sm:px-3.5"
                  >
                    <Chevron open={open} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug tracking-tight text-zinc-100">
                      {cat.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">
                      {items.length}
                      <span className="text-zinc-600">/</span>
                      {cat.problem_count}
                    </span>
                  </button>

                  {/* Animated height: grid 0fr → 1fr */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <ul className="space-y-px px-2 pb-2.5 pt-0.5 sm:px-2.5">
                        {items.length === 0 && (
                          <li className="px-2 py-3 text-center text-[12px] text-zinc-500">
                            No matches
                          </li>
                        )}
                        {items.map((p) => {
                          const sel = selectedId === p.id;
                          const st = progress[p.id] ?? "not_started";
                          return (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => onSelectProblem(p.id)}
                                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-2.5 text-left transition-colors duration-150 sm:px-2.5 ${
                                  sel
                                    ? "bg-zinc-800/70 ring-1 ring-inset ring-zinc-600/50"
                                    : "hover:bg-white/[0.04]"
                                } `}
                              >
                                <PracticeStatusDot status={st} minimal />
                                <span
                                  className={`min-w-0 flex-1 text-[13px] leading-snug ${
                                    sel
                                      ? "font-medium text-zinc-50"
                                      : "font-normal text-zinc-300"
                                  }`}
                                >
                                  {p.title}
                                </span>
                                <DifficultyBadge
                                  difficulty={p.difficulty}
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
        )}
      </div>
    </div>
  );
}
