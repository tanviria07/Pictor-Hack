import { useMemo } from "react";
import { friendlyEvaluationBanner } from "../lib/runFeedback";
import { HintContent } from "./HintContent";
function statusPresentation(run) {
    const ev = run.evaluation;
    const total = ev.total_visible_tests + ev.total_hidden_tests;
    const passed = ev.passed_visible_tests + ev.passed_hidden_tests;
    switch (run.status) {
        case "correct":
            return {
                tone: "success",
                headline: "All tests passed",
                sub: total > 0
                    ? `${passed} of ${total} test${total === 1 ? "" : "s"} correct.`
                    : "Solution accepted.",
                icon: <CheckIcon />,
            };
        case "partial":
            return {
                tone: "warning",
                headline: "Partially correct",
                sub: `${passed} of ${total} tests pass. Keep iterating.`,
                icon: <PartialIcon />,
            };
        case "wrong":
            return {
                tone: "error",
                headline: "Not passing yet",
                sub: ev.total_visible_tests > 0
                    ? `${ev.passed_visible_tests} of ${ev.total_visible_tests} visible tests pass.`
                    : "No visible tests pass yet.",
                icon: <CrossIcon />,
            };
        case "incomplete":
            return {
                tone: "info",
                headline: "Solution incomplete",
                sub: "Replace stubs or placeholders with real logic and run again.",
                icon: <HourglassIcon />,
            };
        case "syntax_error":
            return {
                tone: "error",
                headline: "Syntax error",
                sub: "Python could not parse your code. Check brackets, colons, indentation.",
                icon: <WarningIcon />,
            };
        case "runtime_error":
            return {
                tone: "error",
                headline: "Runtime error",
                sub: "Your code ran but raised an exception or timed out.",
                icon: <WarningIcon />,
            };
        case "internal_error":
            return {
                tone: "warning",
                headline: "Platform error",
                sub: "Something went wrong while evaluating. This is not a judgement of your code.",
                icon: <WarningIcon />,
            };
        default:
            return {
                tone: "neutral",
                headline: "Evaluated",
                sub: "",
                icon: <InfoIcon />,
            };
    }
}
function ResultHero({ run }) {
    const p = statusPresentation(run);
    const ev = run.evaluation;
    const total = ev.total_visible_tests + ev.total_hidden_tests;
    const passed = ev.passed_visible_tests + ev.passed_hidden_tests;
    const pct = total > 0 ? (passed / total) * 100 : 0;
    // Prefer the specific coaching banner when available (syntax/runtime/internal/incomplete);
    // otherwise fall back to the status-derived sub.
    const sub = friendlyEvaluationBanner(run) || p.sub;
    return (<div className={`result-hero result-hero--${p.tone}`} data-testid="evaluation-banner" role="status" aria-live="polite">
      <div className="result-hero-main">
        <div className={`result-hero-icon result-hero-icon--${p.tone}`}>
          {p.icon}
        </div>
        <div className="result-hero-copy">
          <p className="result-hero-headline">{p.headline}</p>
          {sub && <p className="result-hero-sub">{sub}</p>}
        </div>
      </div>

      {total > 0 && (<div className="result-hero-metrics">
          <MetricPill label="Visible" passed={ev.passed_visible_tests} total={ev.total_visible_tests} tone={p.tone}/>
          <MetricPill label="Hidden" passed={ev.passed_hidden_tests} total={ev.total_hidden_tests} tone={p.tone} hint="Inputs withheld"/>
          <div className="result-hero-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={passed} aria-label={`${passed} of ${total} tests passing`}>
            <div className={`result-hero-bar-fill result-hero-bar-fill--${p.tone}`} style={{ width: `${pct}%` }}/>
          </div>
        </div>)}
    </div>);
}
function MetricPill({ label, passed, total, hint, }) {
    const ratio = total > 0 ? passed / total : 0;
    const pillTone = total === 0
        ? "neutral"
        : ratio === 1
            ? "success"
            : ratio === 0
                ? "error"
                : "warning";
    return (<div className={`metric-pill metric-pill--${pillTone}`}>
      <span className="metric-pill-label">{label}</span>
      <span className="metric-pill-value">
        <strong>{passed}</strong>
        <span className="metric-pill-slash">/</span>
        {total}
      </span>
      {hint && <span className="metric-pill-hint">{hint}</span>}
    </div>);
}
function VisibleTestGrid({ results }) {
    if (!results.length)
        return null;
    return (<EvalSection title="Visible tests" hint={`${results.filter((r) => r.passed).length}/${results.length} passing`}>
      <div className="test-grid">
        {results.map((r) => (<div key={r.index} className={`test-chip test-chip--${r.passed ? "pass" : "fail"}`} title={r.label ?? `Test #${r.index + 1}`}>
            <span className="test-chip-glyph">{r.passed ? "✓" : "✗"}</span>
            <span className="test-chip-label">
              {r.label ?? `#${r.index + 1}`}
            </span>
          </div>))}
      </div>
    </EvalSection>);
}
function HiddenTestStrip({ passed, total, }) {
    if (total <= 0)
        return null;
    const cells = Array.from({ length: total }, (_, i) => i < passed);
    return (<EvalSection title="Hidden tests" hint={`${passed}/${total} passing — inputs withheld`}>
      <div className="test-strip">
        {cells.map((pass, i) => (<span key={i} className={`test-cell test-cell--${pass ? "pass" : "fail"}`} aria-hidden="true"/>))}
      </div>
    </EvalSection>);
}
function ErrorSection({ status, errorType, errorMessage, }) {
    if (!errorType && !errorMessage)
        return null;
    const isInternal = status === "internal_error";
    return (<EvalSection title={isInternal ? "Platform" : "Execution error"} tone={isInternal ? "warning" : "error"}>
      <div className={`exec-error exec-error--${isInternal ? "internal" : "exec"}`}>
        {errorType && <div className="exec-error-type">{errorType}</div>}
        {errorMessage && <pre className="exec-error-pre">{errorMessage}</pre>}
      </div>
    </EvalSection>);
}
function InterviewerNotes({ text }) {
    if (!text?.trim())
        return null;
    return (<EvalSection title="Interviewer notes">
      <blockquote className="notes-quote">{text}</blockquote>
    </EvalSection>);
}
function FocusAreas({ items }) {
    if (!items.length)
        return null;
    return (<EvalSection title="Focus areas">
      <ul className="focus-chips">
        {items.map((item, i) => (<li key={i} className="focus-chip">
            {item}
          </li>))}
      </ul>
    </EvalSection>);
}
function HintHistory({ hints, onInsertSnippet, stepwise, }) {
    return (<EvalSection title="Hint history" hint={hints.length > 0 ? `${hints.length} turn${hints.length === 1 ? "" : "s"}` : undefined}>
      {hints.length === 0 ? (<p className="eval-placeholder">
          {stepwise
                ? "Each Run Code here checks the next sentence and saves its feedback below."
                : "After a run, request hints. Each step builds on prior hints (levels 1-4)."}
        </p>) : (<ol className="hint-list">
          {hints.map((hint, index) => (<li key={index} className="hint-card">
              <span className="hint-card-num">{index + 1}</span>
              <HintContent text={hint} onInsert={onInsertSnippet} className="hint-card-body"/>
            </li>))}
        </ol>)}
    </EvalSection>);
}
function EvalSection({ title, hint, tone = "neutral", children, }) {
    return (<section className={`eval-section eval-section--${tone}`}>
      <header className="eval-section-head">
        <h3 className="eval-section-title">{title}</h3>
        {hint && <span className="eval-section-hint">{hint}</span>}
      </header>
      <div className="eval-section-body">{children}</div>
    </section>);
}
// ---- Stepwise panel (sentence-by-sentence coaching) ----
function StepwisePanel({ stepwise, stepwiseCode, onInsertSnippet, }) {
    const isFail = stepwise.first_failed_index !== null &&
        stepwise.first_failed_index !== undefined;
    const tone = stepwise.is_full_solution
        ? "success"
        : isFail
            ? "error"
            : "info";
    const bannerText = stepwise.is_full_solution
        ? "Full solution correct!"
        : isFail
            ? "Incorrect. Start over."
            : "Correct! Keep going.";
    const pct = stepwise.total > 0 ? (stepwise.correct_count / stepwise.total) * 100 : 0;
    return (<div className={`result-hero result-hero--${tone}`} data-testid="stepwise-banner" role="status">
      <div className="result-hero-main">
        <div className={`result-hero-icon result-hero-icon--${tone}`}>
          {stepwise.is_full_solution ? (<CheckIcon />) : isFail ? (<CrossIcon />) : (<ArrowIcon />)}
        </div>
        <div className="result-hero-copy">
          <p className="result-hero-headline">{bannerText}</p>
          <p className="result-hero-sub">
            {stepwise.correct_count} of {stepwise.total} sentences
          </p>
        </div>
      </div>

      <div className="result-hero-metrics">
        <div className="result-hero-bar" role="progressbar" aria-valuemin={0} aria-valuemax={stepwise.total} aria-valuenow={stepwise.correct_count}>
          <div className={`result-hero-bar-fill result-hero-bar-fill--${tone}`} style={{ width: `${pct}%` }}/>
        </div>
      </div>

      {!stepwise.is_full_solution && stepwise.next_hint && (<div className="result-hero-extra">
          <HintContent text={stepwise.next_hint} onInsert={onInsertSnippet} className="stepwise-hint" testId="stepwise-hint"/>
        </div>)}

      {stepwise.is_full_solution && (<div className="result-hero-extra stepwise-success">
          {stepwise.final_explanation && (<p className="stepwise-explanation">
              {stepwise.final_explanation}
            </p>)}
          {stepwiseCode.trim() && (<pre className="stepwise-solution" aria-label="Your correct solution">
              <code>{stepwiseCode}</code>
            </pre>)}
        </div>)}
    </div>);
}
// ---- Empty / idle state ----
function IdleState({ detail, inlineHint, }) {
    if (inlineHint) {
        return (<EvalSection title="Inline hint" tone="info">
        <div className="inline-hint-content">
          <div className="inline-hint-field">
            <strong>Issue:</strong> {inlineHint.line_issue}
          </div>
          <div className="inline-hint-field">
            <strong>Next steps:</strong> {inlineHint.next_steps}
          </div>
          <div className="inline-hint-field">
            <strong>Redirect:</strong> {inlineHint.problem_redirect}
          </div>
        </div>
        <p className="eval-placeholder">Updates as you type (500ms debounce).</p>
      </EvalSection>);
    }
    return (<div className="eval-empty">
      <div className="eval-empty-icon">
        <PlayIcon />
      </div>
      <p className="eval-empty-headline">
        {detail?.stepwise_available
            ? "Ready to check your first sentence"
            : "Ready to run"}
      </p>
      <p className="eval-empty-sub">
        {detail?.stepwise_available
            ? "Click Run Code and you'll get feedback and a hint for the next line."
            : "Run your code to execute visible tests, hidden checks, and receive interviewer notes."}
      </p>
    </div>);
}
// ---- Main component ----
export function EvaluationPanel({ detail, run, stepwise, stepwiseCode, inlineHint, hintHistory, onInsertSnippet, }) {
    const showIdle = !run && !stepwise;
    const caseNote = useMemo(() => run?.evaluation.failing_case_summary?.trim()
        ? run.evaluation.failing_case_summary
        : null, [run]);
    return (<div className="eval-panel">
      <div className="eval-panel-head">
        <h3 className="sec-title">Evaluation</h3>
      </div>
      <div className="eval-scroll">
        {showIdle && <IdleState detail={detail} inlineHint={inlineHint}/>}

        {stepwise && (<>
            <StepwisePanel stepwise={stepwise} stepwiseCode={stepwiseCode} onInsertSnippet={onInsertSnippet}/>
            <HintHistory hints={hintHistory} onInsertSnippet={onInsertSnippet} stepwise/>
          </>)}

        {run && !stepwise && (<>
            <ResultHero run={run}/>
            <VisibleTestGrid results={run.visible_test_results}/>
            <HiddenTestStrip passed={run.evaluation.passed_hidden_tests} total={run.evaluation.total_hidden_tests}/>
            <ErrorSection status={run.status} errorType={run.evaluation.error_type} errorMessage={run.evaluation.error_message}/>
            {caseNote && (<EvalSection title="Case note">
                <p className="notes-body">{caseNote}</p>
              </EvalSection>)}
            <InterviewerNotes text={run.interviewer_feedback}/>
            <FocusAreas items={run.evaluation.feedback_targets}/>
            <HintHistory hints={hintHistory} onInsertSnippet={onInsertSnippet} stepwise={false}/>
          </>)}
      </div>
    </div>);
}
// ---- Inline SVG icons (no deps) ----
function CheckIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function CrossIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function PartialIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" fill="none"/>
      <path d="M12 3a9 9 0 019 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
    </svg>);
}
function WarningIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4l10 17H2L12 4z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
      <path d="M12 10v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="12" cy="17.5" r="1.1" fill="currentColor"/>
    </svg>);
}
function InfoIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" fill="none"/>
      <path d="M12 11v6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="12" cy="7.5" r="1.2" fill="currentColor"/>
    </svg>);
}
function HourglassIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h10M7 21h10M7 3v3.5a5 5 0 0010 0V3M7 21v-3.5a5 5 0 0110 0V21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function ArrowIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function PlayIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5L8 5.5z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" fill="currentColor" fillOpacity="0.15"/>
    </svg>);
}
