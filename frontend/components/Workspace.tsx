"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getHint,
  getProblem,
  listProblems,
  loadSession,
  runCode,
  saveSession,
} from "@/lib/api";
import { buildStarter } from "@/lib/starter";
import type { ProblemDetail, ProblemSummary, RunResponse } from "@/lib/types";
import { PythonEditor } from "./PythonEditor";
import { StatusBadge } from "./StatusBadge";

export function Workspace() {
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState("");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [hintHistory, setHintHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState<"idle" | "run" | "hint" | "load">(
    "idle",
  );
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading("load");
        const list = await listProblems();
        setProblems(list);
        if (list[0]) setProblemId(list[0].id);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load problems");
      } finally {
        setLoading("idle");
      }
    })();
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
        const sess = await loadSession(problemId);
        if (sess?.code) {
          setCode(sess.code);
          setHintHistory(sess.hint_history || []);
        } else {
          setCode(buildStarter(d));
          setHintHistory([]);
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load problem");
      } finally {
        setLoading("idle");
      }
    })();
  }, [problemId]);

  const persist = useCallback(
    async (nextCode: string, nextHints: string[]) => {
      if (!problemId) return;
      try {
        await saveSession({
          problem_id: problemId,
          code: nextCode,
          hint_history: nextHints,
        });
      } catch {
        /* non-fatal */
      }
    },
    [problemId],
  );

  const onRun = useCallback(async () => {
    if (!problemId) return;
    setLoading("run");
    setErr(null);
    try {
      const res = await runCode({
        problem_id: problemId,
        language: "python",
        code,
      });
      setRun(res);
      await persist(code, hintHistory);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Run failed");
    } finally {
      setLoading("idle");
    }
  }, [code, hintHistory, persist, problemId]);

  const onHint = useCallback(async () => {
    if (!problemId || !run) {
      setErr("Run your code first so we can ground hints in evaluation.");
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
      await persist(code, next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Hint failed");
    } finally {
      setLoading("idle");
    }
  }, [code, hintHistory, persist, problemId, run]);

  const onReset = useCallback(() => {
    if (!detail) return;
    setCode(buildStarter(detail));
    setRun(null);
    setHintHistory([]);
    void persist(buildStarter(detail), []);
  }, [detail, persist]);

  const title = useMemo(() => detail?.title ?? "Jose-Morinho AI", [detail]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-panel/95 px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="text-xs text-muted">
            Mock interview — you write Python; we evaluate and coach.
          </p>
        </div>
        <select
          className="rounded border border-border bg-[#0b0f14] px-3 py-1.5 text-sm text-slate-200"
          value={problemId ?? ""}
          onChange={(e) => setProblemId(e.target.value)}
        >
          {problems.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.difficulty})
            </option>
          ))}
        </select>
      </header>

      {err && (
        <div className="border-b border-rose-900/60 bg-rose-950/40 px-4 py-2 text-sm text-rose-200">
          {err}
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
        <section className="flex min-h-[50vh] flex-col border-b border-border lg:min-h-0 lg:border-b-0">
          <div className="flex-1 overflow-y-auto p-4 text-sm leading-relaxed text-slate-300">
            {detail && (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs uppercase text-slate-400">
                    {detail.difficulty}
                  </span>
                  <code className="text-xs text-slate-400">
                    def {detail.function_name}(
                    {detail.parameters.map((x) => x.name).join(", ")}) -&gt;{" "}
                    {detail.expected_return_type}
                  </code>
                </div>
                <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
                  {detail.description}
                </div>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
                  Examples
                </h3>
                <ul className="mt-2 space-y-3">
                  {detail.examples.map((ex, i) => (
                    <li
                      key={i}
                      className="rounded border border-border bg-[#0b0f14] p-3 font-mono text-xs"
                    >
                      <div className="text-slate-400">Input: {ex.input}</div>
                      <div className="mt-1 text-slate-200">Output: {ex.output}</div>
                      {ex.explanation && (
                        <div className="mt-2 text-slate-500">{ex.explanation}</div>
                      )}
                    </li>
                  ))}
                </ul>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted">
                  Constraints
                </h3>
                <ul className="mt-2 list-disc pl-5 text-xs text-slate-400">
                  {detail.constraints.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
            {loading === "load" && !detail && (
              <p className="text-muted">Loading problem…</p>
            )}
          </div>
        </section>

        <section className="flex min-h-[50vh] flex-col lg:min-h-0">
          <div className="flex flex-wrap gap-2 border-b border-border bg-panel/50 px-3 py-2">
            <button
              type="button"
              onClick={() => void onRun()}
              disabled={loading !== "idle" || !problemId}
              className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              {loading === "run" ? "Running…" : "Run Code"}
            </button>
            <button
              type="button"
              onClick={() => void onHint()}
              disabled={loading !== "idle" || !run}
              className="rounded border border-border bg-[#0b0f14] px-4 py-1.5 text-sm text-slate-200 hover:bg-slate-900 disabled:opacity-50"
            >
              {loading === "hint" ? "Hint…" : "Get Hint"}
            </button>
            <button
              type="button"
              onClick={onReset}
              disabled={!detail}
              className="rounded border border-border px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-900"
            >
              Reset
            </button>
          </div>
          <div className="min-h-[220px] flex-1">
            <PythonEditor value={code} onChange={setCode} disabled={loading !== "idle"} />
          </div>

          <div className="max-h-[55vh] overflow-y-auto border-t border-border bg-[#080b0f] p-4 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Results
            </h3>
            {!run && (
              <p className="mt-2 text-slate-500">
                Run the visible checks to see syntax, runtime, and test outcomes.
              </p>
            )}
            {run && (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={run.status} />
                  <span className="text-xs text-slate-500">
                    Visible {run.evaluation.passed_visible_tests}/
                    {run.evaluation.total_visible_tests} · Hidden{" "}
                    {run.evaluation.passed_hidden_tests}/
                    {run.evaluation.total_hidden_tests} (inputs not shown)
                  </span>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted">Visible tests</h4>
                  <ul className="mt-1 space-y-1 font-mono text-xs">
                    {run.visible_test_results.map((t) => (
                      <li
                        key={t.index}
                        className={
                          t.passed ? "text-emerald-300/90" : "text-rose-300/90"
                        }
                      >
                        {t.label ?? `Test ${t.index + 1}`}:{" "}
                        {t.passed ? "pass" : "fail"}
                      </li>
                    ))}
                  </ul>
                </div>
                {(run.evaluation.error_type || run.evaluation.error_message) && (
                  <div className="rounded border border-orange-900/50 bg-orange-950/30 p-3 text-xs">
                    <div className="font-medium text-orange-200">
                      {run.evaluation.error_type}
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap text-orange-100/80">
                      {run.evaluation.error_message}
                    </pre>
                  </div>
                )}
                {run.evaluation.failing_case_summary && (
                  <div className="text-xs text-slate-400">
                    <span className="text-muted">Note: </span>
                    {run.evaluation.failing_case_summary}
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-medium text-muted">
                    Interviewer notes
                  </h4>
                  <p className="mt-1 text-slate-300">{run.interviewer_feedback}</p>
                </div>
                {run.evaluation.feedback_targets.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted">Targets</h4>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-400">
                      {run.evaluation.feedback_targets.map((t, i) => (
                        <li key={i}>{t}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <h3 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted">
              Hint history
            </h3>
            {hintHistory.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">
                Hints are progressive — run first, then request a hint.
              </p>
            ) : (
              <ol className="mt-2 list-decimal space-y-2 pl-5 text-xs text-slate-400">
                {hintHistory.map((h, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {h}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
