import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestDeepSeekCoachReply } from "./deepseek";
import { buildCoachContext } from "./context";

const QUICK_ACTIONS = [
  {
    label: "Give me a hint",
    prompt:
      "Give me one small conceptual hint for my current code. Do not reveal the full solution.",
  },
  {
    label: "Explain my bug",
    prompt:
      "Use the latest runner evaluation and my current code to explain the most likely bug. Do not decide correctness yourself.",
  },
  {
    label: "Find an edge case",
    prompt:
      "Suggest one edge case I should think through for this problem and explain why it matters.",
  },
  {
    label: "Ask me like an interviewer",
    prompt:
      "Ask me one interview-style question about my approach. Do not answer it for me.",
  },
];

let nextTurnId = 1;
function makeTurn(role, text) {
  return { id: nextTurnId++, role, text };
}

function describeRunnerResult(run, stepwise) {
  if (run?.evaluation) {
    return run.evaluation.status || run.status || "evaluated";
  }
  if (stepwise) {
    if (stepwise.is_full_solution) return "stepwise full solution";
    return `stepwise ${stepwise.correct_count}/${stepwise.total}`;
  }
  return "not run yet";
}

export function VoiceCoach({
  problemId,
  problemDetail,
  code,
  role,
  hints,
  run,
  stepwise,
  rubricFeedback,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState(null);
  const threadRef = useRef(null);
  const abortRef = useRef(null);

  const context = useMemo(
    () => buildCoachContext(problemDetail, code, hints, run?.evaluation, stepwise, rubricFeedback, role),
    [code, hints, problemDetail, run?.evaluation, stepwise, rubricFeedback, role],
  );
  const status = describeRunnerResult(run, stepwise);
  const disabled = !problemId || isThinking;

  const submitCoachTurn = useCallback(
    async (text, source = "user") => {
      const trimmed = text.trim();
      if (!trimmed || !problemId) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setCollapsed(false);
      setError(null);
      setIsThinking(true);
      setTurns((prev) => [...prev, makeTurn("user", trimmed)]);

      try {
        const reply = await requestDeepSeekCoachReply({
          context,
          role,
          transcript:
            source === "quick"
              ? `Quick action request: ${trimmed}`
              : trimmed,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setTurns((prev) => [...prev, makeTurn("coach", reply)]);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Jose Interview Coach could not respond.",
          );
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsThinking(false);
      }
    },
    [context, problemId, role],
  );

  const onSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const text = draft;
      setDraft("");
      void submitCoachTurn(text);
    },
    [draft, submitCoachTurn],
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turns, isThinking, error, collapsed]);

  return (
    <section
      className={`coach-panel${collapsed ? " coach-panel--collapsed" : ""}`}
      aria-label="Jose Interview Coach"
    >
      <div className="coach-panel-head">
        <div className="coach-panel-title-wrap">
          <span className="coach-panel-title">Jose Interview Coach</span>
          <span className="coach-panel-sub">
            {problemDetail?.title || "Select a problem"} · runner: {status}
          </span>
        </div>
        <div className="coach-panel-actions">
          <button
            type="button"
            className="coach-icon-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand coach panel" : "Collapse coach panel"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            <ChevronIcon collapsed={collapsed} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="coach-quick-actions" role="group" aria-label="Coach actions">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                className="coach-chip"
                onClick={() => void submitCoachTurn(action.prompt, "quick")}
                disabled={disabled}
              >
                {action.label}
              </button>
            ))}
          </div>

          <div ref={threadRef} className="coach-thread" aria-live="polite">
            {!problemId && (
              <p className="coach-note">Select a problem to start coaching.</p>
            )}
            {problemId && turns.length === 0 && !error && (
              <p className="coach-note">
                Ask for text coaching grounded in this problem, your code, and the
                latest runner result. Jose can coach, but the Python runner remains
                the only correctness source.
              </p>
            )}
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`coach-turn coach-turn--${turn.role}`}
              >
                <span className="coach-turn-label">
                  {turn.role === "user" ? "You" : "Jose"}
                </span>
                <p>{turn.text}</p>
              </div>
            ))}
            {isThinking && (
              <div className="coach-turn coach-turn--coach">
                <span className="coach-turn-label">Jose</span>
                <p>Thinking...</p>
              </div>
            )}
            {error && <p className="coach-error">{error}</p>}
          </div>

          <form className="coach-compose" onSubmit={onSubmit}>
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={!problemId || isThinking}
              placeholder="Ask about your approach, bug, edge case, or complexity"
            />
            <button type="submit" disabled={disabled || draft.trim() === ""}>
              Send
            </button>
          </form>
        </>
      )}
    </section>
  );
}

function ChevronIcon({ collapsed }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={collapsed ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
