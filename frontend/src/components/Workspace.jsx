import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { getHint, getInlineHint, getProblem, listCategories, listProblems, loadSession, runCode, saveSession, validateStepwise, } from "../lib/api";
import { deriveCategoriesFromProblems } from "../lib/catalog";
import { formatThrownError } from "../lib/errors";
import { deriveProgress, loadLocalProgress, mergeProgress, setLocalProgress, } from "../lib/progress";
import { buildStarter } from "../lib/starter";
import { filterProblemsByTrack } from "../lib/tracks";
import { DifficultyBadge } from "./DifficultyBadge";
import { EvaluationPanel } from "./EvaluationPanel";
import { ProblemExplorer } from "./ProblemExplorer";
import { PythonEditor } from "./PythonEditor";
import { VoiceCoach } from "./VoiceCoach";
function SectionTitle({ children }) {
    return <h3 className="sec-title">{children}</h3>;
}
export function Workspace() {
    const [categories, setCategories] = useState([]);
    const [problems, setProblems] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [problemId, setProblemId] = useState(null);
    const [trackFilter, setTrackFilter] = useState("all");
    const [detail, setDetail] = useState(null);
    const [code, setCode] = useState("");
    const [run, setRun] = useState(null);
    // Snapshot of the code buffer at the time stepwise validation returned.
    // Kept separate from `code` so editing after a Full Solution banner does
    // not mutate the solution shown in the success panel.
    const [stepwiseCode, setStepwiseCode] = useState("");
    const [stepwise, setStepwise] = useState(null);
    const editorRef = useRef(null);
    const insertSnippet = useCallback((snippet) => {
        editorRef.current?.insertAtCursor(snippet);
    }, []);
    const [hintHistory, setHintHistory] = useState([]);
    const [inlineHint, setInlineHint] = useState(null);
    const [cursorLine, setCursorLine] = useState(1);
    const [cursorColumn, setCursorColumn] = useState(1);
    const debounceTimerRef = useRef(null);
    const [progressById, setProgressById] = useState({});
    const [loading, setLoading] = useState("idle");
    const [err, setErr] = useState(null);
    useEffect(() => {
        setProgressById(loadLocalProgress());
    }, []);
    useEffect(() => {
        if (trackFilter === "all" || problems.length === 0)
            return;
        const visibleProblems = filterProblemsByTrack(problems, trackFilter);
        const current = problems.find((p) => p.id === problemId);
        if (!current || !visibleProblems.some((problem) => problem.id === current.id)) {
            const first = visibleProblems[0];
            if (first)
                setProblemId(first.id);
        }
    }, [trackFilter, problems, problemId]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setCatalogLoading(true);
                let problemList = [];
                try {
                    problemList = await listProblems();
                }
                catch (e) {
                    if (!cancelled) {
                        setProblems([]);
                        setCategories([]);
                        setProblemId(null);
                        setErr(formatThrownError(e));
                    }
                    return;
                }
                if (cancelled)
                    return;
                setProblems(problemList);
                let categoryList = [];
                try {
                    const categoriesResponse = await listCategories();
                    categoryList = Array.isArray(categoriesResponse)
                        ? categoriesResponse
                        : [];
                }
                catch {
                    categoryList = [];
                }
                if (categoryList.length === 0 && problemList.length > 0) {
                    categoryList = deriveCategoriesFromProblems(problemList);
                }
                setCategories(categoryList);
                setProblemId((prev) => prev ?? problemList[0]?.id ?? null);
                setErr(null);
            }
            finally {
                if (!cancelled)
                    setCatalogLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);
    useEffect(() => {
        if (!problemId)
            return;
        (async () => {
            try {
                setLoading("load");
                const problemDetail = await getProblem(problemId);
                setDetail(problemDetail);
                setRun(null);
                setStepwise(null);
                setStepwiseCode("");
                setErr(null);
                const starter = buildStarter(problemDetail);
                const session = await loadSession(problemId);
                if (session?.code) {
                    setCode(session.code);
                    setHintHistory(session.hint_history || []);
                }
                else {
                    setCode(starter);
                    setHintHistory([]);
                }
                const mergedProgress = mergeProgress(loadLocalProgress()[problemId] ?? "not_started", session?.practice_status ?? null);
                setProgressById((prev) => ({ ...prev, [problemId]: mergedProgress }));
            }
            catch (e) {
                setErr(formatThrownError(e));
            }
            finally {
                setLoading("idle");
            }
        })();
    }, [problemId]);
    const starterForCompare = useMemo(() => (detail ? buildStarter(detail) : ""), [detail]);
    const persist = useCallback(async (nextCode, nextHints, explicitStatus) => {
        if (!problemId)
            return;
        const nextStatus = explicitStatus ??
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
        }
        catch {
            /* non-fatal */
        }
    }, [problemId, run, starterForCompare]);
    const onRun = useCallback(async () => {
        if (!problemId || !detail)
            return;
        setLoading("run");
        setErr(null);
        try {
            if (detail.stepwise_available) {
                const response = await validateStepwise({
                    problem_id: problemId,
                    code,
                });
                setStepwise(response);
                setStepwiseCode(code);
                setRun(null);
                const hintEntry = response.is_full_solution
                    ? `Full solution correct. ${response.final_explanation}`
                    : response.next_hint
                        ? `[${response.correct_count}/${response.total}] ${response.message} ${response.next_hint}`
                        : response.message;
                const nextHints = [...hintHistory, hintEntry];
                setHintHistory(nextHints);
                const nextStatus = response.is_full_solution
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
            setStepwiseCode("");
            const derivedStatus = deriveProgress(response, code, starterForCompare, hintHistory.length > 0);
            await persist(code, hintHistory, derivedStatus);
        }
        catch (e) {
            setErr(formatThrownError(e));
        }
        finally {
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
        }
        catch (e) {
            setErr(formatThrownError(e));
        }
        finally {
            setLoading("idle");
        }
    }, [code, hintHistory, persist, problemId, run]);
    // Fetch inline hint when code or cursor changes (debounced).
    useEffect(() => {
        if (!problemId || !detail || loading !== "idle")
            return;
        if (debounceTimerRef.current)
            clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
            // Don't fetch if code is empty or same as starter.
            if (code.trim() === "" || code === buildStarter(detail)) {
                setInlineHint(null);
                return;
            }
            try {
                const hint = await getInlineHint({
                    problem_id: problemId,
                    code,
                    cursor_line: cursorLine,
                    cursor_column: cursorColumn,
                });
                setInlineHint(hint);
            }
            catch {
                // Silently ignore errors for inline hints.
            }
        }, 500);
        return () => {
            if (debounceTimerRef.current)
                clearTimeout(debounceTimerRef.current);
        };
    }, [problemId, detail, code, cursorLine, cursorColumn, loading]);
    const onInlineHintRefresh = useCallback(async () => {
        if (!problemId || !detail)
            return;
        try {
            const hint = await getInlineHint({
                problem_id: problemId,
                code,
                cursor_line: cursorLine,
                cursor_column: cursorColumn,
            });
            setInlineHint(hint);
        }
        catch (e) {
            setErr(formatThrownError(e));
        }
    }, [problemId, detail, code, cursorLine, cursorColumn]);
    const onReset = useCallback(() => {
        if (!detail)
            return;
        const starter = buildStarter(detail);
        setCode(starter);
        setRun(null);
        setStepwise(null);
        setStepwiseCode("");
        setHintHistory([]);
        void persist(starter, [], "not_started");
    }, [detail, persist]);
    const trackCounts = useMemo(() => {
        let precode = 0;
        let dsa = 0;
        let blind75 = 0;
        let precodeSolved = 0;
        let dsaSolved = 0;
        let blind75Solved = 0;
        for (const problem of problems) {
            const track = problem.track_id || "dsa";
            const solved = progressById[problem.id] === "solved";
            if (track === "precode100") {
                precode++;
                if (solved)
                    precodeSolved++;
            }
            else {
                dsa++;
                if (solved)
                    dsaSolved++;
            }
            if (filterProblemsByTrack([problem], "blind75").length > 0) {
                blind75++;
                if (solved)
                    blind75Solved++;
            }
        }
        return {
            all: problems.length,
            allSolved: precodeSolved + dsaSolved,
            precode,
            precodeSolved,
            blind75,
            blind75Solved,
            dsa,
            dsaSolved,
        };
    }, [problems, progressById]);
    const title = useMemo(() => detail?.title ?? "Practice", [detail]);
    const signature = useMemo(() => {
        if (!detail)
            return "";
        if (detail.execution_mode === "class") {
            return `class ${detail.class_name || detail.function_name}`;
        }
        return `def ${detail.function_name}(${detail.parameters
            .map((parameter) => parameter.name)
            .join(", ")}) -> ${detail.expected_return_type}`;
    }, [detail]);
    return (<div className="ws">
      <header className="ws-header">
        <div className="ws-header-top">
          <div className="u-min-w-0">
            <div className="ws-header-row">
              <span className="ws-header-title">Kitkode</span>
              <span className="ws-header-sub">
                {trackFilter === "precode100"
            ? "PreCode foundations"
            : trackFilter === "blind75"
                ? "Blind 75"
                : trackFilter === "dsa"
                    ? "NeetCode-style"
                    : "Full curriculum"}
              </span>
            </div>
            <p className="ws-header-desc">
              {trackFilter === "precode100"
            ? "Foundations-first practice: small steps, clear tests, and hints that teach."
            : trackFilter === "blind75"
                ? "A focused 75-problem interview set pulled from the existing NeetCode-style catalog."
                : trackFilter === "dsa"
                    ? "Classic DSA interview set. You write the solution; we run tests and give structured feedback."
                    : "Pick a track below, or browse everything."}
            </p>
          </div>
          {detail && (<div className="ws-header-meta">
              <div className="ws-meta-row">
                {detail.track_title && (<span className="track-pill">{detail.track_title}</span>)}
                <DifficultyBadge difficulty={detail.difficulty} trackId={detail.track_id}/>
              </div>
              <span className="ws-meta-cat">{detail.category_title}</span>
            </div>)}
        </div>
        <div className="track-tabs" role="tablist" aria-label="Problem track">
          <button type="button" role="tab" aria-selected={trackFilter === "precode100"} className={`track-tab${trackFilter === "precode100" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("precode100")}>
            <span className="track-tab-title">PreCode 100</span>
            <span className="track-tab-sub">
              Foundations &middot; {trackCounts.precodeSolved}/
              {trackCounts.precode} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "blind75"} className={`track-tab${trackFilter === "blind75" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("blind75")}>
            <span className="track-tab-title">Blind 75</span>
            <span className="track-tab-sub">
              Core interview set &middot; {trackCounts.blind75Solved}/
              {trackCounts.blind75} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "dsa"} className={`track-tab${trackFilter === "dsa" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("dsa")}>
            <span className="track-tab-title">NeetCode 150</span>
            <span className="track-tab-sub">
              DSA interviews &middot; {trackCounts.dsaSolved}/{trackCounts.dsa}{" "}
              solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "all"} className={`track-tab track-tab--all${trackFilter === "all" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("all")}>
            <span className="track-tab-title">All</span>
            <span className="track-tab-sub">
              Browse both &middot; {trackCounts.allSolved}/{trackCounts.all}
            </span>
          </button>
        </div>
      </header>

      {err && (<div className="ws-alert" role="alert">
          {err}
        </div>)}

      <div className="ws-body">
        <ProblemExplorer categories={categories} problems={problems} progress={progressById} selectedId={problemId} onSelectProblem={setProblemId} loading={catalogLoading} trackFilter={trackFilter}/>

        <div className="ws-center">
          <aside className="pp">
            <div className="pp-head">
              <h1 className="pp-title">
                {loading === "load" && !detail ? "Loading..." : title}
              </h1>
              {detail && (<div className="u-mt-sm">
                  <div className="pp-meta">
                    {detail.track_title && (<span className="track-pill">{detail.track_title}</span>)}
                    <DifficultyBadge difficulty={detail.difficulty} trackId={detail.track_id}/>
                    <code className="pp-sig">{signature}</code>
                  </div>
                  {detail.skill_tags && detail.skill_tags.length > 0 && (<div className="pp-tags">
                      {detail.skill_tags.map((tag) => (<span key={tag} className="pp-tag">
                          {tag}
                        </span>))}
                    </div>)}
                </div>)}
            </div>
            <div className="pp-body">
              {detail && (<>
                  <p className="pp-block pp-desc">{detail.description}</p>
                  <div className="pp-block">
                    <SectionTitle>Examples</SectionTitle>
                    <ul className="pp-examples">
                      {detail.examples.map((example, index) => (<li key={index} className="pp-example">
                          <div className="pp-example-label">Input</div>
                          <div>{example.input}</div>
                          <div className="pp-example-out pp-example-label">
                            Output
                          </div>
                          <div>{example.output}</div>
                          {example.explanation && (<div className="pp-example-exp">
                              {example.explanation}
                            </div>)}
                        </li>))}
                    </ul>
                  </div>
                  <div className="pp-block">
                    <SectionTitle>Constraints</SectionTitle>
                    <ul className="pp-constraints">
                      {detail.constraints.map((constraint, index) => (<li key={index}>{constraint}</li>))}
                    </ul>
                  </div>
                </>)}
              {loading === "load" && !detail && (<p className="pp-loading">Loading problem...</p>)}
            </div>
          </aside>

          <main className="main-col">
            <div className="main-toolbar">
              <button type="button" data-testid="run-code-button" onClick={() => void onRun()} disabled={loading !== "idle" || !problemId} className="btn-run">
                {loading === "run" ? "Running..." : "Run Code"}
              </button>
              <button type="button" onClick={() => void onHint()} disabled={loading !== "idle" || !run || !!detail?.stepwise_available} className="btn-hint" title={detail?.stepwise_available
            ? "This problem uses stepwise validation — hints come from Run Code."
            : undefined}>
                {loading === "hint" ? "Requesting..." : "Get Hint"}
              </button>
              <button type="button" onClick={() => void onInlineHintRefresh()} disabled={loading !== "idle" || !problemId} className="btn-hint-inline" title="Refresh real‑time line‑by‑line hint">
                Refresh Inline Hint
              </button>
              <button type="button" onClick={onReset} disabled={!detail} className="btn-reset">
                Reset
              </button>
            </div>

            <div className="main-grid">
              <div className="code-panel">
                <div className="code-panel-head">
                  <div className="flex-row-gap-sm">
                    <span className="code-panel-label">Code</span>
                    <span className="code-panel-badge" title="Plain text editor (Python)">
                      Text
                    </span>
                  </div>
                  <span className="code-panel-lang">Python 3</span>
                </div>
                <div className="code-panel-body">
                  <PythonEditor ref={editorRef} value={code} onChange={setCode} disabled={loading === "run" || loading === "hint"} onRun={loading === "idle" && problemId
            ? () => {
                void onRun();
            }
            : undefined} onCursorChange={(ln, col) => {
            setCursorLine(ln);
            setCursorColumn(col);
        }}/>
                </div>
              </div>

              <EvaluationPanel detail={detail} run={run} stepwise={stepwise} stepwiseCode={stepwiseCode} inlineHint={inlineHint} hintHistory={hintHistory} onInsertSnippet={insertSnippet}/>
              <VoiceCoach problemId={problemId} problemDetail={detail} code={code} hints={hintHistory} run={run} stepwise={stepwise}/>
            </div>
          </main>
        </div>
      </div>
    </div>);
}
