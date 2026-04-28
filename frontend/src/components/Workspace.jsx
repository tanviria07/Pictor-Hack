import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHint, getInlineHint, getMyProgress, getProblem, listCategories, listProblems, loadMySession, loadSession, runCode, saveMySession, saveSession, validateStepwise } from "../lib/api";
import { deriveCategoriesFromProblems } from "../lib/catalog";
import { formatThrownError } from "../lib/errors";
import { deriveProgress, loadLocalProgress, mergeProgress, setLocalProgress } from "../lib/progress";
import { buildStarter } from "../lib/starter";
import { filterProblemsByTrack, isCodingProblem, problemTypeOf } from "../lib/tracks";
import { ENABLE_VOICE_COACH } from "../lib/config";
import { VoiceCoach } from "../features/voiceCoach/VoiceCoach";
import { ProblemExplorer } from "../features/problems/ProblemExplorer";
import { PythonEditor } from "../features/editor/PythonEditor";
import { DesignEditor } from "../features/editor/DesignEditor";
import { EvaluationPanel } from "../features/evaluation/EvaluationPanel";
import { DifficultyBadge } from "./DifficultyBadge";
import { RoleSelector } from "../features/role/RoleSelector";
import { DemoButton, DemoBanner } from "../features/recruiterDemo/DemoMode";
import { DEMO_STEPS, startDemo, getDemoInstructions, getDemoCode, getDemoCorrectedCode, getDemoCloudPrompt } from "../features/recruiterDemo/demoData";

function SectionTitle({ children }) {
    return <h3 className="sec-title">{children}</h3>;
}

export function Workspace({ user, onAuth, onDashboard, onLogout }) {
    const [categories, setCategories] = useState([]);
    const [problems, setProblems] = useState([]);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [problemId, setProblemId] = useState(null);
    const [trackFilter, setTrackFilter] = useState("all");
    const [detail, setDetail] = useState(null);
    const [code, setCode] = useState("");
    const [run, setRun] = useState(null);
    const [stepwiseCode, setStepwiseCode] = useState("");
    const [stepwise, setStepwise] = useState(null);
    const [role, setRole] = useState("");
    const [demo, setDemo] = useState(null);

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

    const isCoding = useMemo(() => !detail || isCodingProblem(detail), [detail]);
    const problemType = useMemo(() => problemTypeOf(detail), [detail]);

    useEffect(() => {
        setProgressById(loadLocalProgress());
    }, []);

    useEffect(() => {
        if (!user)
            return;
        let cancelled = false;
        (async () => {
            const remote = await getMyProgress();
            if (!cancelled && remote) {
                setProgressById((prev) => ({ ...prev, ...remote }));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user]);

    useEffect(() => {
        if (trackFilter === "all" || problems.length === 0 || demo)
            return;
        const visibleProblems = filterProblemsByTrack(problems, trackFilter);
        const current = problems.find((p) => p.id === problemId);
        if (!current || !visibleProblems.some((problem) => problem.id === current.id)) {
            const first = visibleProblems[0];
            if (first)
                setProblemId(first.id);
        }
    }, [trackFilter, problems, problemId, demo]);

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
                    categoryList = Array.isArray(categoriesResponse) ? categoriesResponse : [];
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

                if (demo?.problemId === problemId && demo.step === DEMO_STEPS.INITIAL) {
                  const demoCode = getDemoCode(DEMO_STEPS.LOADED);
                  setCode(demoCode);
                  setDemo(prev => ({ ...prev, step: DEMO_STEPS.LOADED }));
                  setHintHistory([]);
                } else {
                  const starter = isCodingProblem(problemDetail) ? buildStarter(problemDetail) : "";
                  const session = user ? await loadMySession(problemId) : await loadSession(problemId);
                  if (session?.code) {
                      setCode(session.code);
                      setHintHistory(session.hint_history || []);
                  }
                  else {
                      setCode(starter);
                      setHintHistory([]);
                  }
                }
                const mergedProgress = mergeProgress(loadLocalProgress()[problemId] ?? "not_started", null);
                setProgressById((prev) => ({ ...prev, [problemId]: mergedProgress }));
            }
            catch (e) {
                setErr(formatThrownError(e));
            }
            finally {
                setLoading("idle");
            }
        })();
    }, [problemId, demo?.problemId, demo?.step, user]);

    const starterForCompare = useMemo(() => (detail && isCodingProblem(detail) ? buildStarter(detail) : ""), [detail]);

    const persist = useCallback(async (nextCode, nextHints, explicitStatus) => {
        if (!problemId || demo)
            return;
        const nextStatus = explicitStatus ?? deriveProgress(run, nextCode, starterForCompare, nextHints.length > 0);
        setProgressById((prev) => ({ ...prev, [problemId]: nextStatus }));
        setLocalProgress(problemId, nextStatus);
        const payload = {
                problem_id: problemId,
                code: nextCode,
                hint_history: nextHints,
                practice_status: nextStatus,
            };
        try {
            if (user)
                await saveMySession(payload);
            else
                await saveSession(payload);
        }
        catch {
            /* non-fatal */
        }
    }, [problemId, run, starterForCompare, demo, user]);

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
                role,
            });
            setRun(response);
            setStepwise(null);
            setStepwiseCode("");
            if (demo && demo.step === DEMO_STEPS.LOADED) {
              setDemo(prev => ({ ...prev, step: DEMO_STEPS.AFTER_RUN }));
            }
            const derivedStatus = deriveProgress(response, code, starterForCompare, hintHistory.length > 0);
            await persist(code, hintHistory, derivedStatus);
        }
        catch (e) {
            setErr(formatThrownError(e));
        }
        finally {
            setLoading("idle");
        }
    }, [code, detail, hintHistory, persist, problemId, starterForCompare, role, demo]);

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
                role,
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
    }, [code, hintHistory, persist, problemId, run, role]);

    useEffect(() => {
        if (!problemId || !detail || !isCodingProblem(detail) || loading !== "idle")
            return;
        if (debounceTimerRef.current)
            clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(async () => {
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
                    role,
                });
                setInlineHint(hint);
            }
            catch {
                setInlineHint(null);
            }
        }, 500);
        return () => {
            if (debounceTimerRef.current)
                clearTimeout(debounceTimerRef.current);
        };
    }, [problemId, detail, code, cursorLine, cursorColumn, loading, role]);

    const onInlineHintRefresh = useCallback(async () => {
        if (!problemId || !detail)
            return;
        try {
            const hint = await getInlineHint({
                problem_id: problemId,
                code,
                cursor_line: cursorLine,
                cursor_column: cursorColumn,
                role,
            });
            setInlineHint(hint);
        }
        catch (e) {
            setErr(formatThrownError(e));
        }
    }, [problemId, detail, code, cursorLine, cursorColumn, role]);

    const onReset = useCallback(() => {
        if (!detail)
            return;
        const starter = isCodingProblem(detail) ? buildStarter(detail) : "";
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
        let systemDesign = 0;
        let cloud = 0;
        let precodeSolved = 0;
        let dsaSolved = 0;
        let blind75Solved = 0;
        let systemDesignSolved = 0;
        let cloudSolved = 0;
        for (const problem of problems) {
            const track = problem.track_id || "dsa";
            const solved = progressById[problem.id] === "solved";
            if (track === "precode100") {
                precode++;
                if (solved)
                    precodeSolved++;
            }
            else if (track === "system_design") {
                systemDesign++;
                if (solved)
                    systemDesignSolved++;
            }
            else if (track === "cloud-architect-prep") {
                cloud++;
                if (solved)
                    cloudSolved++;
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
            allSolved: precodeSolved + dsaSolved + systemDesignSolved + cloudSolved,
            precode,
            precodeSolved,
            blind75,
            blind75Solved,
            dsa,
            dsaSolved,
            systemDesign,
            systemDesignSolved,
            cloud,
            cloudSolved,
        };
    }, [problems, progressById]);

    const title = useMemo(() => detail?.title ?? "Practice", [detail]);
    const signature = useMemo(() => {
        if (!detail || !isCodingProblem(detail))
            return "";
        if (detail.execution_mode === "class") {
            return `class ${detail.class_name || detail.function_name}`;
        }
        return `def ${detail.function_name}(${detail.parameters
            .map((parameter) => parameter.name)
            .join(", ")}) -> ${detail.expected_return_type}`;
    }, [detail]);

    const toggleDemo = () => {
      if (demo) {
        setDemo(null);
        setRole("");
        setTrackFilter("all");
      } else {
        const d = startDemo();
        setDemo(d);
        setProblemId(d.problemId);
        setRole("swe_intern");
      }
    };

    const handleDemoAction = () => {
      if (demo.step === DEMO_STEPS.AFTER_RUN) {
        setDemo(prev => ({ ...prev, step: DEMO_STEPS.AFTER_TRACE }));
      } else if (demo.step === DEMO_STEPS.AFTER_TRACE) {
        setCode(getDemoCorrectedCode());
        setDemo(prev => ({ ...prev, step: DEMO_STEPS.CORRECTED }));
      }
    };

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
                    : trackFilter === "system_design"
                        ? "System Design Prep"
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
                    : trackFilter === "system_design"
                        ? "Intern-level system design and cloud architecture practice for SWE and Cloud Solutions Architect roles."
                        : trackFilter === "cloud-architect-prep"
                            ? "Cloud architecture, debugging, automation, and customer explanation practice for CSA internships."
                            : "Pick a track below, or browse everything."}
            </p>
          </div>
          <div className="ws-header-meta">
              <div className="ws-meta-row" style={{gap: '1rem'}}>
                <button type="button" className="btn-dashboard" onClick={onDashboard}>Dashboard</button>
                <DemoButton active={!!demo} onToggle={toggleDemo} />
                <RoleSelector value={role} onChange={setRole} disabled={loading === 'run'} />
                {user ? (<div className="user-menu"><span>{user.email}</span><button type="button" onClick={onLogout}>Log out</button></div>) : (<div className="user-menu"><button type="button" onClick={() => onAuth?.("login")}>Log in</button><button type="button" onClick={() => onAuth?.("signup")}>Sign up</button></div>)}
                {detail && (
                  <>
                    {detail.track_title && (<span className="track-pill">{detail.track_title}</span>)}
                    <DifficultyBadge difficulty={detail.difficulty} trackId={detail.track_id}/>
                  </>
                )}
              </div>
              {detail && <span className="ws-meta-cat">{detail.category_title}</span>}
            </div>
        </div>
        <div className="track-tabs" role="tablist" aria-label="Problem track">
          <button type="button" role="tab" aria-selected={trackFilter === "precode100"} className={`track-tab${trackFilter === "precode100" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("precode100")}>
            <span className="track-tab-title">PreCode 100</span>
            <span className="track-tab-sub">
              Foundations &middot; {trackCounts.precodeSolved}/{trackCounts.precode} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "blind75"} className={`track-tab${trackFilter === "blind75" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("blind75")}>
            <span className="track-tab-title">Blind 75</span>
            <span className="track-tab-sub">
              Core interview set &middot; {trackCounts.blind75Solved}/{trackCounts.blind75} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "dsa"} className={`track-tab${trackFilter === "dsa" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("dsa")}>
            <span className="track-tab-title">NeetCode 150</span>
            <span className="track-tab-sub">
              DSA interviews &middot; {trackCounts.dsaSolved}/{trackCounts.dsa} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "system_design"} className={`track-tab${trackFilter === "system_design" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("system_design")}>
            <span className="track-tab-title">System Design</span>
            <span className="track-tab-sub">
              Architecture &middot; {trackCounts.systemDesignSolved}/{trackCounts.systemDesign} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "cloud-architect-prep"} className={`track-tab${trackFilter === "cloud-architect-prep" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("cloud-architect-prep")}>
            <span className="track-tab-title">Cloud Architect Prep</span>
            <span className="track-tab-sub">
              CSA skills &middot; {trackCounts.cloudSolved}/{trackCounts.cloud} solved
            </span>
          </button>
          <button type="button" role="tab" aria-selected={trackFilter === "all"} className={`track-tab track-tab--all${trackFilter === "all" ? " track-tab--active" : ""}`} onClick={() => setTrackFilter("all")}>
            <span className="track-tab-title">All</span>
            <span className="track-tab-sub">
              Browse all &middot; {trackCounts.allSolved}/{trackCounts.all}
            </span>
          </button>
        </div>
      </header>

      {err && (<div className="ws-alert" role="alert">{err}</div>)}
      {!user && (<div className="save-notice">Log in to save progress across sessions.</div>)}

      {demo && (
        <DemoBanner
          step={demo.step}
          instructions={getDemoInstructions(demo.step)}
          onAction={demo.step !== DEMO_STEPS.LOADED && demo.step !== DEMO_STEPS.CORRECTED ? handleDemoAction : undefined}
          actionLabel={demo.step === DEMO_STEPS.AFTER_RUN ? "See AI Trace" : demo.step === DEMO_STEPS.AFTER_TRACE ? "Apply Optimized" : undefined}
          cloudPrompt={demo.step === DEMO_STEPS.CORRECTED ? getDemoCloudPrompt() : undefined}
        />
      )}

      <div className="ws-body">
        <ProblemExplorer categories={categories} problems={problems} progress={progressById} selectedId={problemId} onSelectProblem={setProblemId} loading={catalogLoading} trackFilter={trackFilter}/>

        <div className="ws-center">
          <aside className="pp">
            <div className="pp-head">
              <h1 className="pp-title">{loading === "load" && !detail ? "Loading..." : title}</h1>
              {detail && (<div className="u-mt-sm">
                  <div className="pp-meta">
                    {detail.track_title && (<span className="track-pill">{detail.track_title}</span>)}
                    <DifficultyBadge difficulty={detail.difficulty} trackId={detail.track_id}/>
                    <code className="pp-sig">{signature}</code>
                  </div>
                  {detail.skill_tags && detail.skill_tags.length > 0 && (<div className="pp-tags">
                      {detail.skill_tags.map((tag) => {
                const tagClass = tag.toLowerCase().replace(/\s+/g, "-");
                return (<span key={tag} className={`pp-tag pp-tag--${tagClass}`}>
                            {tag}
                          </span>);
            })}
                    </div>)}
                </div>)}
            </div>
            <div className="pp-body">
              {detail && (<>
                  <p className="pp-block pp-desc">{detail.description}</p>
                  {isCoding && detail.examples && detail.examples.length > 0 && (
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
                  )}
                  {detail.constraints && detail.constraints.length > 0 && (
                  <div className="pp-block">
                    <SectionTitle>Constraints</SectionTitle>
                    <ul className="pp-constraints">
                      {detail.constraints.map((constraint, index) => (<li key={index}>{constraint}</li>))}
                    </ul>
                  </div>
                  )}
                </>)}
              {loading === "load" && !detail && (<p className="pp-loading">Loading problem...</p>)}
            </div>
          </aside>

          <main className="main-col">
            <div className="main-toolbar">
              <button type="button" data-testid="run-code-button" onClick={() => void onRun()} disabled={loading !== "idle" || !problemId} className="btn-run">
                {loading === "run" ? (isCoding ? "Running..." : "Evaluating...") : (problemType === "system_design" ? "Evaluate Design" : (isCoding ? "Run Code" : "Submit Answer"))}
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

            <div className={`main-grid${ENABLE_VOICE_COACH ? " main-grid--with-coach" : ""}`}>
              <div className="workspace-left">
                <div className="code-panel">
                  <div className="code-panel-head">
                    <div className="flex-row-gap-sm">
                      <span className="code-panel-label">
                        {problemType === "system_design" ? "Design Response" : (isCoding ? "Code" : "Text Response")}
                      </span>
                      <span className="code-panel-badge" title={isCoding ? "Plain text editor (Python)" : "Rubric-scored written answer"}>
                        {isCoding ? "Text" : problemType.toUpperCase()}
                      </span>
                    </div>
                    <span className="code-panel-lang">
                      {problemType === "system_design" ? "System Design" : (isCoding ? "Python 3" : "Rubric")}
                    </span>
                  </div>
                  <div className="code-panel-body">
                    {!isCoding ? (<DesignEditor value={code} onChange={setCode} disabled={loading === "run" || loading === "hint"} onRun={loading === "idle" && problemId
                ? () => {
                    void onRun();
                }
                : undefined}/>) : (<PythonEditor ref={editorRef} value={code} onChange={setCode} disabled={loading === "run" || loading === "hint"} onRun={loading === "idle" && problemId
                ? () => {
                    void onRun();
                }
                : undefined} onCursorChange={(ln, col) => {
                setCursorLine(ln);
                setCursorColumn(col);
            }}/>)}
                  </div>
                </div>

                <EvaluationPanel detail={detail} run={run} stepwise={stepwise} stepwiseCode={stepwiseCode} inlineHint={inlineHint} hintHistory={hintHistory} rubricFeedback={null} onInsertSnippet={insertSnippet}/>
              </div>
              {ENABLE_VOICE_COACH && (<VoiceCoach problemId={problemId} problemDetail={detail} code={code} role={role} hints={hintHistory} run={run} stepwise={stepwise} rubricFeedback={null}/>)}
            </div>
          </main>
        </div>
      </div>
      <div className="ws-disclaimer" style={{fontSize: "10px", padding: "4px 1rem", color: "var(--text-muted)", textAlign: "center", borderTop: "1px solid var(--border-hairline)"}}>
        {trackFilter === "cloud-architect-prep"
            ? "Unofficial cloud interview preparation practice, designed around common CSA internship skills."
            : trackFilter === "system_design"
                ? "Unofficial intern-level system design practice focused on architecture thinking, tradeoffs, and communication."
                : "Kitkode: Local interview practice for Python and System Design."}
      </div>
    </div>);
}
