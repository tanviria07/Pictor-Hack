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
import { friendlyEvaluationBanner } from "@/lib/runFeedback";
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
import { PythonEditor } from "./PythonEditor";
import { StatusBadge } from "./StatusBadge";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="sec-title">{children}</h3>;
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
        let problemList: ProblemSummary[] = [];
        try {
          problemList = await listProblems();
        } catch (e) {
          if (!cancelled) {
            setProblems([]);
            setCategories([]);
            setProblemId(null);
            setErr(formatThrownError(e));
          }
          return;
        }
        if (cancelled) return;

        setProblems(problemList);

        let categoryList: CategorySummary[] = [];
        try {
          const categoriesResponse = await listCategories();
          categoryList = Array.isArray(categoriesResponse)
            ? categoriesResponse
            : [];
        } catch {
          categoryList = [];
        }
        if (categoryList.length === 0 && problemList.length > 0) {
          categoryList = deriveCategoriesFromProblems(problemList);
        }
        setCategories(categoryList);
        setProblemId((prev) => prev ?? problemList[0]?.id ?? null);
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
        const problemDetail = await getProblem(problemId);
        setDetail(problemDetail);
        setRun(null);
        setErr(null);

        const starter = buildStarter(problemDetail);
        const session = await loadSession(problemId);
        if (session?.code) {
          setCode(session.code);
          setHintHistory(session.hint_history || []);
        } else {
          setCode(starter);
          setHintHistory([]);
        }

        const mergedProgress = mergeProgress(
          loadLocalProgress()[problemId] ?? "not_started",
          session?.practice_status ?? null,
        );
        setProgressById((prev) => ({ ...prev, [problemId]: mergedProgress }));
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
      const nextStatus =
        explicitStatus ??
        deriveProgress(run, nextCode, starterForCompare, nextHints.length > 0);
      setProgressById((prev) => ({ ...prev, [problemId]: nextStatus }));
      setLocalProgress(problemId, nextStatus);
      try {
        await saveSession({
          problem_id: problemId,
          code: nextCode,
          hint_history: nextHints,
          practice_status: nextStatus,
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
      const response = await runCode({
        problem_id: problemId,
        language: "python",
        code,
      });
      setRun(response);
      const derivedStatus = deriveProgress(
        response,
        code,
        starterForCompare,
        hintHistory.length > 0,
      );
      await persist(code, hintHistory, derivedStatus);
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
      const hintResponse = await getHint({
        problem_id: problemId,
        code,
        evaluation: run.evaluation,
      });
      const nextHints = [
        ...hintHistory,
        `[L${hintResponse.hint_level}] Feedback: ${hintResponse.feedback}\nHint: ${hintResponse.hint}\nNext: ${hintResponse.next_focus}`,
      ];
      setHintHistory(nextHints);
      await persist(code, nextHints, "in_progress");
    } catch (e) {
      setErr(formatThrownError(e));
    } finally {
      setLoading("idle");
    }
  }, [code, hintHistory, persist, problemId, run]);

  const onReset = useCallback(() => {
    if (!detail) return;
    const starter = buildStarter(detail);
    setCode(starter);
    setRun(null);
    setHintHistory([]);
    void persist(starter, [], "not_started");
  }, [detail, persist]);

  const evaluationBanner = useMemo(
    () => (run ? friendlyEvaluationBanner(run) : null),
    [run],
  );

  const title = useMemo(() => detail?.title ?? "Practice", [detail]);
  const signature = useMemo(() => {
    if (!detail) return "";
    if (detail.execution_mode === "class") {
      return `class ${detail.class_name || detail.function_name}`;
    }
    return `def ${detail.function_name}(${detail.parameters
      .map((parameter) => parameter.name)
      .join(", ")}) -> ${detail.expected_return_type}`;
  }, [detail]);

  return (
    <div className="ws">
      <header className="ws-header">
        <div style={{ minWidth: 0 }}>
          <div className="ws-header-row">
            <span className="ws-header-title">Pictor Hack</span>
            <span className="ws-header-sub">
              {detail?.track_id === "precode100"
                ? "PreCode foundations"
                : "NeetCode-style"}
            </span>
          </div>
          <p className="ws-header-desc">
            {detail?.track_id === "precode100"
              ? "Foundations-first practice: small steps, clear tests, and hints that teach."
              : "You write the solution; we run tests and give structured feedback."}
          </p>
        </div>
        {detail && (
          <div className="ws-header-meta">
            <div className="ws-meta-row">
              {detail.track_title && (
                <span className="track-pill">{detail.track_title}</span>
              )}
              <DifficultyBadge
                difficulty={detail.difficulty}
                trackId={detail.track_id}
              />
            </div>
            <span className="ws-meta-cat">{detail.category_title}</span>
          </div>
        )}
      </header>

      {err && (
        <div className="ws-alert" role="alert">
          {err}
        </div>
      )}

      <div className="ws-body">
        <ProblemExplorer
          categories={categories}
          problems={problems}
          progress={progressById}
          selectedId={problemId}
          onSelectProblem={setProblemId}
          loading={catalogLoading}
        />

        <div className="ws-center">
          <aside className="pp">
            <div className="pp-head">
              <h1 className="pp-title">
                {loading === "load" && !detail ? "Loading..." : title}
              </h1>
              {detail && (
                <div style={{ marginTop: "0.5rem" }}>
                  <div className="pp-meta">
                    {detail.track_title && (
                      <span className="track-pill">{detail.track_title}</span>
                    )}
                    <DifficultyBadge
                      difficulty={detail.difficulty}
                      trackId={detail.track_id}
                    />
                    <code className="pp-sig">{signature}</code>
                  </div>
                  {detail.skill_tags && detail.skill_tags.length > 0 && (
                    <div className="pp-tags">
                      {detail.skill_tags.map((tag) => (
                        <span key={tag} className="pp-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="pp-body">
              {detail && (
                <>
                  <p className="pp-block pp-desc">{detail.description}</p>
                  <div className="pp-block">
                    <SectionTitle>Examples</SectionTitle>
                    <ul className="pp-examples">
                      {detail.examples.map((example, index) => (
                        <li key={index} className="pp-example">
                          <div className="pp-example-label">Input</div>
                          <div>{example.input}</div>
                          <div className="pp-example-out pp-example-label">
                            Output
                          </div>
                          <div>{example.output}</div>
                          {example.explanation && (
                            <div className="pp-example-exp">
                              {example.explanation}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="pp-block">
                    <SectionTitle>Constraints</SectionTitle>
                    <ul className="pp-constraints">
                      {detail.constraints.map((constraint, index) => (
                        <li key={index}>{constraint}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
              {loading === "load" && !detail && (
                <p className="pp-loading">Loading problem...</p>
              )}
            </div>
          </aside>

          <main className="main-col">
            <div className="main-toolbar">
              <button
                type="button"
                data-testid="run-code-button"
                onClick={() => void onRun()}
                disabled={loading !== "idle" || !problemId}
                className="btn-run"
              >
                {loading === "run" ? "Running..." : "Run Code"}
              </button>
              <button
                type="button"
                onClick={() => void onHint()}
                disabled={loading !== "idle" || !run}
                className="btn-hint"
              >
                {loading === "hint" ? "Requesting..." : "Get Hint"}
              </button>
              <button
                type="button"
                onClick={onReset}
                disabled={!detail}
                className="btn-reset"
              >
                Reset
              </button>
            </div>

            <div className="main-grid">
              <div className="code-panel">
                <div className="code-panel-head">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span className="code-panel-label">Code</span>
                    <span
                      className="code-panel-badge"
                      title="Plain text editor (Python)"
                    >
                      Text
                    </span>
                  </div>
                  <span className="code-panel-lang">Python 3</span>
                </div>
                <div className="code-panel-body">
                  <PythonEditor
                    value={code}
                    onChange={setCode}
                    disabled={loading === "run" || loading === "hint"}
                    onRun={
                      loading === "idle" && problemId
                        ? () => {
                            void onRun();
                          }
                        : undefined
                    }
                  />
                </div>
              </div>

              <div className="eval-panel">
                <div className="eval-panel-head">
                  <SectionTitle>Evaluation</SectionTitle>
                </div>
                <div className="eval-scroll">
                  {!run && (
                    <p className="eval-placeholder">
                      Run your code to execute visible tests, hidden checks, and
                      receive interviewer notes. Evaluation is deterministic from
                      the runner, not from the language model.
                    </p>
                  )}
                  {run && (
                    <div>
                      {evaluationBanner ? (
                        <p
                          className="eval-banner"
                          data-testid="evaluation-banner"
                        >
                          {evaluationBanner}
                        </p>
                      ) : null}
                      <div className="eval-row">
                        <StatusBadge status={run.status} />
                        <span className="eval-stats">
                          Visible {run.evaluation.passed_visible_tests}/
                          {run.evaluation.total_visible_tests}
                          <span className="eval-stats-muted">|</span>
                          Hidden {run.evaluation.passed_hidden_tests}/
                          {run.evaluation.total_hidden_tests}
                          <span style={{ marginLeft: "0.25rem", color: "#52525b" }}>
                            (inputs withheld)
                          </span>
                        </span>
                      </div>

                      <div style={{ marginBottom: "1.25rem" }}>
                        <SectionTitle>Visible tests</SectionTitle>
                        <div className="table-wrap">
                          <table className="eval-table">
                            <thead>
                              <tr>
                                <th>Case</th>
                                <th>Result</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.visible_test_results.map((testResult) => (
                                <tr key={testResult.index}>
                                  <td style={{ color: "#a1a1aa" }}>
                                    {testResult.label ?? `#${testResult.index + 1}`}
                                  </td>
                                  <td
                                    className={
                                      testResult.passed ? "eval-pass" : "eval-fail"
                                    }
                                  >
                                    {testResult.passed ? "Pass" : "Fail"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {(run.evaluation.error_type ||
                        run.evaluation.error_message) && (
                        <div style={{ marginBottom: "1.25rem" }}>
                          <SectionTitle>
                            {run.status === "internal_error"
                              ? "Platform"
                              : "Execution"}
                          </SectionTitle>
                          <div
                            className={
                              run.status === "internal_error"
                                ? "err-block err-block--internal"
                                : "err-block err-block--exec"
                            }
                          >
                            <div className="err-type">
                              {run.evaluation.error_type}
                            </div>
                            <pre className="err-pre">
                              {run.evaluation.error_message}
                            </pre>
                          </div>
                        </div>
                      )}

                      {run.evaluation.failing_case_summary && (
                        <div style={{ marginBottom: "1.25rem" }}>
                          <SectionTitle>Case note</SectionTitle>
                          <p className="case-note">
                            {run.evaluation.failing_case_summary}
                          </p>
                        </div>
                      )}

                      <div style={{ marginBottom: "1.25rem" }}>
                        <SectionTitle>Interviewer notes</SectionTitle>
                        <p className="feedback">{run.interviewer_feedback}</p>
                      </div>

                      {run.evaluation.feedback_targets.length > 0 && (
                        <div style={{ marginBottom: "1.25rem" }}>
                          <SectionTitle>Focus areas</SectionTitle>
                          <ul className="focus-list">
                            {run.evaluation.feedback_targets.map(
                              (feedbackTarget, index) => (
                                <li key={index}>{feedbackTarget}</li>
                              ),
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="hint-block">
                        <SectionTitle>Hint history</SectionTitle>
                        {hintHistory.length === 0 ? (
                          <p className="hint-empty">
                            After a run, request hints. Each step builds on prior
                            hints (levels 1-4).
                          </p>
                        ) : (
                          <ol className="hint-ol">
                            {hintHistory.map((hint, index) => (
                              <li key={index} className="hint-li">
                                <span className="hint-num">{index + 1}. </span>
                                <span className="hint-text">{hint}</span>
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
