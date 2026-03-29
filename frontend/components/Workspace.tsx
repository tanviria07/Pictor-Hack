"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getHint,
  getProblem,
  listCategories,
  listProblems,
  loadSession,
  runCode,
  saveSession,
} from "@/lib/api";
import { deriveCategoriesFromProblems } from "@/lib/catalog";
import { formatThrownError } from "@/lib/errors";
import {
  deriveProgress,
  loadLocalProgress,
  mergeProgress,
  setLocalProgress,
} from "@/lib/progress";
import { buildStarter } from "@/lib/starter";
import type {
  CategorySummary,
  PracticeProgress,
  ProblemDetail,
  ProblemSummary,
  RunResponse,
} from "@/lib/types";
import { DifficultyBadge } from "./DifficultyBadge";
import { ProblemExplorer } from "./ProblemExplorer";
import { StatusBadge } from "./StatusBadge";

const PythonEditor = dynamic(
  () => import("./PythonEditor").then((m) => m.PythonEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[200px] items-center justify-center bg-surface-code text-xs text-zinc-500">
        Loading editorâ€¦
      </div>
    ),
  },
);

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-2xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
      {children}
    </h3>
  );
}

export function Workspace() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState("");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [hintHistory, setHintHistory] = useState<string[]>([]);
  const [progressById, setProgressById] = useState<
    Record<string, PracticeProgress>
  >({});
  const [loading, setLoading] = useState<"idle" | "run" | "hint" | "load">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setProgressById(loadLocalProgress());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCatalogLoading(true);
        let plist: ProblemSummary[] = [];
        try {
          plist = await listProblems();
        } catch (e) {
          if (!cancelled) {
            setProblems([]);
            setCategories([]);
            setErr(formatThrownError(e));
          }
          return;
        }
        if (cancelled) return;

        setProblems(plist);

        let cats: CategorySummary[] = [];
        try {
          const c = await listCategories();
          cats = Array.isArray(c) ? c : [];
        } catch {
          cats = [];
        }
        if (cats.length === 0 && plist.length > 0) {
          cats = deriveCategoriesFromProblems(plist);
        }
        setCategories(cats);
        setProblemId((prev) => prev ?? plist[0]?.id ?? null);
        setErr(null);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!problemId) return;
    (async () => {
      try {
        setLoading("load");
        const d = await getProblem(problemId);
        setDetail(d);
        setRun(null);
        setErr(null);
        const starter = buildStarter(d);
        const sess = await loadSession(problemId);
        if (sess?.code) {
          setCode(sess.code);
          setHintHistory(sess.hint_history || []);
        } else {
          setCode(starter);
          setHintHistory([]);
        }
        const merged = mergeProgress(
          loadLocalProgress()[problemId] ?? "not_started",
          sess?.practice_status ?? null,
        );
        setProgressById((prev) => ({ ...prev, [problemId]: merged }));
      } catch (e) {
        setErr(formatThrownError(e));
      } finally {
        setLoading("idle");
      }
    })();
  }, [problemId]);

  const starterForCompare = useMemo(
    () => (detail ? buildStarter(detail) : ""),
    [detail],
  );

  const persist = useCallback(
    async (
      nextCode: string,
      nextHints: string[],
      explicitStatus?: PracticeProgress,
    ) => {
      if (!problemId) return;
      const st =
        explicitStatus ??
        deriveProgress(run, nextCode, starterForCompare, nextHints.length > 0);
      setProgressById((prev) => ({ ...prev, [problemId]: st }));
      setLocalProgress(problemId, st);
      try {
        await saveSession({
          problem_id: problemId,
          code: nextCode,
          hint_history: nextHints,
          practice_status: st,
        });
      } catch {
        /* non-fatal */
      }
    },
    [problemId, run, starterForCompare],
  );

  const onRun = useCallback(async () => {
    if (!problemId || !detail) return;
    setLoading("run");
    setErr(null);
    try {
      const res = await runCode({
        problem_id: problemId,
        language: "python",
        code,
      });
      setRun(res);
      const st = deriveProgress(
        res,
        code,
        starterForCompare,
        hintHistory.length > 0,
      );
      await persist(code, hintHistory, st);
    } catch (e) {
      setErr(formatThrownError(e));
    } finally {
      setLoading("idle");
    }
  }, [code, detail, hintHistory, persist, problemId, starterForCompare]);

  const onHint = useCallback(async () => {
    if (!problemId || !run) {
      setErr("Run your code first so hints can use the latest evaluation.");
      return;
    }
    setLoading("hint");
    setErr(null);
    try {
      const h = await getHint({
        problem_id: problemId,
        code,
        evaluation: run.evaluation,
      });
      const next = [
        ...hintHistory,
        `[L${h.hint_level}] Feedback: ${h.feedback}\nHint: ${h.hint}\nNext: ${h.next_focus}`,
      ];
      setHintHistory(next);
      await persist(code, next, "in_progress");
    } catch (e) {
      setErr(formatThrownError(e));
    } finally {
      setLoading("idle");
    }
  }, [code, hintHistory, persist, problemId, run]);

  const onReset = useCallback(() => {
    if (!detail) return;
    const s = buildStarter(detail);
    setCode(s);
    setRun(null);
    setHintHistory([]);
    void persist(s, [], "not_started");
  }, [detail, persist]);

  const title = useMemo(() => detail?.title ?? "Practice", [detail]);
  const signature = useMemo(() => {
    if (!detail) return "";
    if (detail.execution_mode === "class") {
      return `class ${detail.class_name || detail.function_name}`;
    }
    return `def ${detail.function_name}(${detail.parameters
      .map((x) => x.name)
      .join(", ")}) -> ${detail.expected_return_type}`;
  }, [detail]);

  return (
    <div className="flex h-screen flex-col bg-surface-base text-zinc-200">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-zinc-100">
              Pictor Hack
            </span>
            <span className="hidden text-2xs text-zinc-600 sm:inline">
              NeetCode-style
            </span>
          </div>
          <p className="mt-0.5 text-2xs text-zinc-500">
            You write the solution; we run tests and give structured feedback.
          </p>
        </div>
        {detail && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <DifficultyBadge difficulty={detail.difficulty} />
            <span className="text-2xs text-zinc-600">{detail.category_title}</span>
          </div>
        )}
      </header>

      {err && (
        <div
          className="shrink-0 border-b border-rose-900/40 bg-rose-950/25 px-4 py-2 text-xs text-rose-200/90"
          role="alert"
        >
          {err}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ProblemExplorer
          categories={categories}
          problems={problems}
          progress={progressById}
          selectedId={problemId}
          onSelectProblem={setProblemId}
          loading={catalogLoading}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:flex-row">
          <aside className="flex w-full shrink-0 flex-col border-b border-border xl:w-[min(100%,26rem)] xl:border-b-0 xl:border-r xl:max-w-[28rem]">
            <div className="border-b border-border bg-surface-raised/50 px-4 py-2">
              <h1 className="text-base font-semibold leading-snug text-zinc-100 transition-opacity">
                {loading === "load" && !detail ? "Loadingâ€¦" : title}
              </h1>
              {detail && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DifficultyBadge difficulty={detail.difficulty} />
                  <code className="break-all font-mono text-2xs text-zinc-500">
                    {signature}
                  </code>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {detail && (
                <>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                    {detail.description}
                  </div>
                  <SectionTitle>Examples</SectionTitle>
                  <ul className="space-y-2">
                    {detail.examples.map((ex, i) => (
                      <li
                        key={i}
                        className="rounded border border-border bg-surface-panel/80 p-3 font-mono text-xs leading-relaxed text-zinc-300"
                      >
                        <div className="text-zinc-500">Input</div>
                        <div className="text-zinc-200">{ex.input}</div>
                        <div className="mt-2 text-zinc-500">Output</div>
                        <div className="text-zinc-200">{ex.output}</div>
                        {ex.explanation && (
                          <div className="mt-2 border-t border-border pt-2 text-zinc-500">
                            {ex.explanation}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <SectionTitle>Constraints</SectionTitle>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-400">
                    {detail.constraints.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
              {loading === "load" && !detail && (
                <p className="text-sm text-zinc-500">Loading problemâ€¦</p>
              )}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface-raised/30 px-3 py-2">
              <button
                type="button"
                onClick={() => void onRun()}
                disabled={loading !== "idle" || !problemId}
                className="rounded border border-accent bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading === "run" ? "Runningâ€¦" : "Run Code"}
              </button>
              <button
                type="button"
                onClick={() => void onHint()}
                disabled={loading !== "idle" || !run}
                className="rounded border border-border bg-surface-panel px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading === "hint" ? "Requestingâ€¦" : "Get Hint"}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={!detail}
                className="rounded px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 disabled:opacity-40"
              >
                Reset
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(260px,1fr)_minmax(200px,38%)] border-t border-border/50">
              <div className="flex min-h-0 flex-col border-b border-border bg-surface-code">
                <div className="flex shrink-0 items-center justify-between border-b border-border/80 px-3 py-1.5">
                  <span className="text-2xs font-medium uppercase tracking-wider text-zinc-500">
                    Code
                  </span>
                  <span className="font-mono text-2xs text-zinc-600">Python</span>
                </div>
                <div className="min-h-0 flex-1">
                  <PythonEditor
                    value={code}
                    onChange={setCode}
                    disabled={loading === "run" || loading === "hint"}
                  />
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden bg-surface-raised/25">
                <div className="shrink-0 border-b border-border px-3 py-1.5">
                  <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Evaluation
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                  {!run && (
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Run your code to execute visible tests, hidden checks, and
                      receive interviewer notes. Evaluation is deterministic from
                      the runner â€” not from the language model.
                    </p>
                  )}
                  {run && (
                    <div className="space-y-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={run.status} />
                        <span className="text-2xs tabular-nums text-zinc-500">
                          Visible {run.evaluation.passed_visible_tests}/
                          {run.evaluation.total_visible_tests}
                          <span className="mx-1.5 text-zinc-700">Â·</span>
                          Hidden {run.evaluation.passed_hidden_tests}/
                          {run.evaluation.total_hidden_tests}
                          <span className="ml-1 text-zinc-600">
                            (inputs withheld)
                          </span>
                        </span>
                      </div>

                      <div>
                        <SectionTitle>Visible tests</SectionTitle>
                        <div className="overflow-hidden rounded border border-border">
                          <table className="w-full text-left font-mono text-2xs">
                            <thead>
                              <tr className="border-b border-border bg-surface-panel/60 text-zinc-500">
                                <th className="px-2 py-1.5 font-medium">Case</th>
                                <th className="px-2 py-1.5 font-medium">Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.visible_test_results.map((t) => (
                                <tr
                                  key={t.index}
                                  className="border-b border-border/60 last:border-0"
                                >
                                  <td className="px-2 py-1.5 text-zinc-400">
                                    {t.label ?? `#${t.index + 1}`}
                                  </td>
                                  <td
                                    className={
                                      t.passed
                                        ? "px-2 py-1.5 text-emerald-400/95"
                                        : "px-2 py-1.5 text-rose-400/95"
                                    }
                                  >
                                    {t.passed ? "Pass" : "Fail"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {(run.evaluation.error_type ||
                        run.evaluation.error_message) && (
                        <div>
                          <SectionTitle>Execution</SectionTitle>
                          <div className="rounded border border-orange-900/40 bg-orange-950/20 p-2.5 font-mono text-2xs text-orange-100/90">
                            <div className="font-medium text-orange-200/95">
                              {run.evaluation.error_type}
                            </div>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-orange-100/75">
                              {run.evaluation.error_message}
                            </pre>
                          </div>
                        </div>
                      )}

                      {run.evaluation.failing_case_summary && (
                        <div>
                          <SectionTitle>Case note</SectionTitle>
                          <p className="text-xs leading-relaxed text-zinc-400">
                            {run.evaluation.failing_case_summary}
                          </p>
                        </div>
                      )}

                      <div>
                        <SectionTitle>Interviewer notes</SectionTitle>
                        <p className="text-xs leading-relaxed text-zinc-300">
                          {run.interviewer_feedback}
                        </p>
                      </div>

                      {run.evaluation.feedback_targets.length > 0 && (
                        <div>
                          <SectionTitle>Focus areas</SectionTitle>
                          <ul className="list-disc space-y-1 pl-4 text-xs text-zinc-400">
                            {run.evaluation.feedback_targets.map((t, i) => (
                              <li key={i}>{t}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="border-t border-border pt-4">
                        <SectionTitle>Hint history</SectionTitle>
                        {hintHistory.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            After a run, request hints. Each step builds on prior
                            hints (levels 1â€“4).
                          </p>
                        ) : (
                          <ol className="space-y-3">
                            {hintHistory.map((h, i) => (
                              <li
                                key={i}
                                className="border-l-2 border-zinc-700 pl-3 font-mono text-2xs leading-relaxed text-zinc-400"
                              >
                                <span className="text-zinc-600">{i + 1}.</span>{" "}
                                <span className="whitespace-pre-wrap text-zinc-300">
                                  {h}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
