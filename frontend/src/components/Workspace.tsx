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
  validateStepwise,
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
  StepwiseValidateResponse,
} from "@/lib/types";
import { DifficultyBadge } from "./DifficultyBadge";
import { ProblemExplorer } from "./ProblemExplorer";
import { PythonEditor } from "./PythonEditor";
import { StatusBadge } from "./StatusBadge";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="sec-title">{children}</h3>;
}

type TrackFilter = "all" | "precode100" | "dsa";

export function Workspace() {
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [problems, setProblems] = useState<ProblemSummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [problemId, setProblemId] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [code, setCode] = useState("");
  const [run, setRun] = useState<RunResponse | null>(null);
  const [stepwise, setStepwise] = useState<StepwiseValidateResponse | null>(
    null,
  );
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
    if (trackFilter === "all" || problems.length === 0) return;
    const inTrack = (p: ProblemSummary) =>
      (p.track_id || "dsa") === trackFilter;
    const current = problems.find((p) => p.id === problemId);
    if (!current || !inTrack(current)) {
      const first = problems.find(inTrack);
      if (first) setProblemId(first.id);
    }
  }, [trackFilter, problems, problemId]);

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
        setStepwise(null);
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
      if (detail.stepwise_available) {
        const response = await validateStepwise({
          problem_id: problemId,
          code,
        });
        setStepwise(response);
        setRun(null);
        const hintEntry = response.is_full_solution
          ? `Full solution correct. ${response.final_explanation}`
          : response.next_hint
            ? `[${response.correct_count}/${response.total}] ${response.message} ${response.next_hint}`
            : response.message;
        const nextHints = [...hintHistory, hintEntry];
        setHintHistory(nextHints);
        const nextStatus: PracticeProgress = response.is_full_solution
          ? "solved"
          : response.correct_count > 0
            ? "in_progress"
            : hintHistory.length > 0
              ? "in_progress"
              : "not_started";
        await persist(code, nextHints, nextStatus);
        return;
      }
      const response = await runCode({
        problem_id: problemId,
        language: "python",
        code,
      });
      setRun(response);
      setStepwise(null);
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
    setStepwise(null);
    setHintHistory([]);
    void persist(starter, [], "not_started");
  }, [detail, persist]);

  const evaluationBanner = useMemo(
    () => (run ? friendlyEvaluationBanner(run) : null),
    [run],
  );

  const trackCounts = useMemo(() => {
    let precode = 0;
    let dsa = 0;
    let precodeSolved = 0;
    let dsaSolved = 0;
    for (const problem of problems) {
      const track = problem.track_id || "dsa";
      const solved = progressById[problem.id] === "solved";
      if (track === "precode100") {
        precode++;
        if (solved) precodeSolved++;
      } else {
        dsa++;
        if (solved) dsaSolved++;
      }
    }
    return {
      all: problems.length,
      allSolved: precodeSolved + dsaSolved,
      precode,
      precodeSolved,
      dsa,
      dsaSolved,
    };
  }, [problems, progressById]);

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
        <div className="ws-header-top">
          <div className="u-min-w-0">
            <div className="ws-header-row">
              <span className="ws-header-title">Pictor Hack</span>
              <span className="ws-header-sub">
                {trackFilter === "precode100"
                  ? "PreCode foundations"
                  : trackFilter === "dsa"
                    ? "NeetCode-style"
                    : "Full curriculum"}
              </span>
            </div>
            <p className="ws-header-desc">
              {trackFilter === "precode100"
                ? "Foundations-first practice: small steps, clear tests, and hints that teach."
                : trackFilter === "dsa"
                  ? "Classic DSA interview set. You write the solution; we run tests and give structured feedback."
                  : "Pick a track below, or browse everything."}
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
        </div>
        <div
          className="track-tabs"
          role="tablist"
          aria-label="Problem track"
        >
          <button
            type="button"
            role="tab"
            aria-selected={trackFilter === "precode100"}
            className={`track-tab${trackFilter === "precode100" ? " track-tab--active" : ""}`}
            onClick={() => setTrackFilter("precode100")}
          >
            <span className="track-tab-title">PreCode 100</span>
            <span className="track-tab-sub">
              Foundations &middot; {trackCounts.precodeSolved}/
              {trackCounts.precode} solved
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={trackFilter === "dsa"}
            className={`track-tab${trackFilter === "dsa" ? " track-tab--active" : ""}`}
            onClick={() => setTrackFilter("dsa")}
          >
            <span className="track-tab-title">NeetCode 150</span>
            <span className="track-tab-sub">
              DSA interviews &middot; {trackCounts.dsaSolved}/{trackCounts.dsa}{" "}
              solved
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={trackFilter === "all"}
            className={`track-tab track-tab--all${trackFilter === "all" ? " track-tab--active" : ""}`}
            onClick={() => setTrackFilter("all")}
          >
            <span className="track-tab-title">All</span>
            <span className="track-tab-sub">
              Browse both &middot; {trackCounts.allSolved}/{trackCounts.all}
            </span>
          </button>
        </div>
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
          trackFilter={trackFilter}
        />

        <div className="ws-center">
          <aside className="pp">
            <div className="pp-head">
              <h1 className="pp-title">
                {loading === "load" && !detail ? "Loading..." : title}
              </h1>
              {detail && (
                <div className="u-mt-sm">
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
                disabled={
                  loading !== "idle" || !run || !!detail?.stepwise_available
                }
                className="btn-hint"
                title={
                  detail?.stepwise_available
                    ? "This problem uses stepwise validation — hints come from Run Code."
                    : undefined
                }
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
                  <div className="flex-row-gap-sm">
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
                  {!run && !stepwise && (
                    <p className="eval-placeholder">
                      {detail?.stepwise_available
                        ? "Click Run Code to check your first sentence. You'll get feedback and a hint for the next line."
                        : "Run your code to execute visible tests, hidden checks, and receive interviewer notes. Evaluation is deterministic from the runner, not from the language model."}
                    </p>
                  )}
                  {stepwise && (
                    <div className="stepwise">
                      <p
                        className={`stepwise-banner stepwise-banner--${
                          stepwise.is_full_solution
                            ? "done"
                            : stepwise.first_failed_index !== null &&
                                stepwise.first_failed_index !== undefined
                              ? "fail"
                              : "progress"
                        }`}
                        data-testid="stepwise-banner"
                      >
                        {stepwise.is_full_solution
                          ? "Full solution correct!"
                          : stepwise.first_failed_index !== null &&
                              stepwise.first_failed_index !== undefined
                            ? stepwise.first_failed_index === 0
                              ? "Incorrect. Let's start from the beginning."
                              : `Sentence ${
                                  (stepwise.first_failed_index ?? 0) + 1
                                } is incorrect.`
                            : stepwise.correct_count === 0
                              ? "Write the first sentence of the solution."
                              : `Correct! Now write sentence ${
                                  stepwise.correct_count + 1
                                } of ${stepwise.total}.`}
                      </p>

                      <div className="stepwise-progress">
                        <div className="stepwise-progress-label">
                          Progress&nbsp;
                          <strong>
                            {stepwise.correct_count}/{stepwise.total}
                          </strong>
                        </div>
                        <div
                          className="stepwise-bar"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={stepwise.total}
                          aria-valuenow={stepwise.correct_count}
                        >
                          <div
                            className="stepwise-bar-fill"
                            style={{
                              width: `${
                                stepwise.total > 0
                                  ? (stepwise.correct_count / stepwise.total) *
                                    100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>

                      {!stepwise.is_full_solution && stepwise.next_hint && (
                        <div className="u-mb-section">
                          <SectionTitle>Next hint</SectionTitle>
                          <p className="stepwise-hint">{stepwise.next_hint}</p>
                        </div>
                      )}

                      {!stepwise.is_full_solution &&
                        stepwise.expected_sentence &&
                        stepwise.user_sentence && (
                          <div className="u-mb-section">
                            <SectionTitle>Why it didn&apos;t match</SectionTitle>
                            <div className="stepwise-diff">
                              <div className="stepwise-diff-row">
                                <span className="stepwise-diff-label">
                                  Expected
                                </span>
                                <code className="stepwise-diff-expected">
                                  {stepwise.expected_sentence}
                                </code>
                              </div>
                              <div className="stepwise-diff-row">
                                <span className="stepwise-diff-label">
                                  You wrote
                                </span>
                                <code className="stepwise-diff-actual">
                                  {stepwise.user_sentence}
                                </code>
                              </div>
                            </div>
                          </div>
                        )}

                      {stepwise.is_full_solution &&
                        stepwise.final_explanation && (
                          <div className="u-mb-section">
                            <SectionTitle>Solution explanation</SectionTitle>
                            <p className="stepwise-explanation">
                              {stepwise.final_explanation}
                            </p>
                          </div>
                        )}

                      <div className="hint-block">
                        <SectionTitle>Hint history</SectionTitle>
                        {hintHistory.length === 0 ? (
                          <p className="hint-empty">
                            Each Run Code here checks the next sentence and
                            saves its feedback below.
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
                          <span className="ml-xs text-muted">
                            (inputs withheld)
                          </span>
                        </span>
                      </div>

                      <div className="u-mb-section">
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
                                  <td className="text-secondary">
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
                        <div className="u-mb-section">
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
                        <div className="u-mb-section">
                          <SectionTitle>Case note</SectionTitle>
                          <p className="case-note">
                            {run.evaluation.failing_case_summary}
                          </p>
                        </div>
                      )}

                      <div className="u-mb-section">
                        <SectionTitle>Interviewer notes</SectionTitle>
                        <p className="feedback">{run.interviewer_feedback}</p>
                      </div>

                      {run.evaluation.feedback_targets.length > 0 && (
                        <div className="u-mb-section">
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
