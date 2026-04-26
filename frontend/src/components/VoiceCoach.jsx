import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requestGeminiCoachReply,
  requestGeminiVoiceTurn,
} from "../lib/gemini-voice";
import {
  ENABLE_VOICE_COACH,
  GEMINI_API_KEY,
  GEMINI_MODEL,
} from "../lib/config";
import { buildCoachContext } from "../lib/voice-context";

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

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return window.btoa(binary);
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    { mime: "audio/webm;codecs=opus", geminiMime: "audio/webm" },
    { mime: "audio/webm", geminiMime: "audio/webm" },
    { mime: "audio/ogg;codecs=opus", geminiMime: "audio/ogg" },
    { mime: "audio/ogg", geminiMime: "audio/ogg" },
    { mime: "audio/mp4", geminiMime: "audio/mp4" },
  ];
  return (
    candidates.find((candidate) =>
      MediaRecorder.isTypeSupported?.(candidate.mime),
    ) || { mime: "", geminiMime: "audio/webm" }
  );
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
  hints,
  run,
  stepwise,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const threadRef = useRef(null);
  const abortRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recorderMimeRef = useRef(null);

  const hasRecorder =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
  const voiceEnabled = ENABLE_VOICE_COACH && hasRecorder;
  const context = useMemo(
    () => buildCoachContext(problemDetail, code, hints, run?.evaluation, stepwise),
    [code, hints, problemDetail, run?.evaluation, stepwise],
  );
  const status = describeRunnerResult(run, stepwise);
  const disabled = !GEMINI_API_KEY || !problemId || isThinking || isListening;

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
        const reply = await requestGeminiCoachReply({
          apiKey: GEMINI_API_KEY,
          model: GEMINI_MODEL,
          context,
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
    [context, problemId],
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

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!voiceEnabled || disabled) return;
    setError(null);
    setIsListening(true);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const mime = pickRecorderMime();
      recorderMimeRef.current = mime;
      const recorder = mime?.mime
        ? new MediaRecorder(stream, { mimeType: mime.mime })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Microphone recording failed.");
        setIsListening(false);
      };
      recorder.onstop = async () => {
        setIsListening(false);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || mime?.mime || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size < 512) {
          setError("I did not catch enough audio. Try the text box instead.");
          return;
        }

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsThinking(true);
        try {
          const result = await requestGeminiVoiceTurn({
            apiKey: GEMINI_API_KEY,
            model: GEMINI_MODEL,
            context,
            audioBase64: await blobToBase64(blob),
            audioMime: recorderMimeRef.current?.geminiMime || "audio/webm",
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setTurns((prev) => {
            const next = [...prev];
            if (result.transcript) next.push(makeTurn("user", result.transcript));
            next.push(makeTurn("coach", result.reply));
            return next;
          });
        } catch (err) {
          if (!controller.signal.aborted) {
            setError(
              err instanceof Error ? err.message : "Voice coach request failed.",
            );
          }
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
          setIsThinking(false);
        }
      };
      recorder.start();
    } catch (err) {
      setIsListening(false);
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked."
          : "Could not start the microphone.",
      );
    }
  }, [context, disabled, voiceEnabled]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      try {
        recorderRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
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
          {voiceEnabled && (
            <button
              type="button"
              className={`coach-icon-btn${isListening ? " coach-icon-btn--hot" : ""}`}
              onClick={isListening ? stopRecording : startRecording}
              disabled={!GEMINI_API_KEY || !problemId || isThinking}
              aria-label={isListening ? "Stop microphone" : "Use microphone"}
              title={isListening ? "Stop microphone" : "Use microphone"}
            >
              {isListening ? <StopIcon /> : <MicIcon />}
            </button>
          )}
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
            {!GEMINI_API_KEY && (
              <p className="coach-note">
                Add VITE_GEMINI_API_KEY to frontend/.env to enable text coaching.
              </p>
            )}
            {GEMINI_API_KEY && !problemId && (
              <p className="coach-note">Select a problem to start coaching.</p>
            )}
            {GEMINI_API_KEY && problemId && turns.length === 0 && !error && (
              <p className="coach-note">
                Ask for interview help grounded in this problem, your code, and the
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
              disabled={!GEMINI_API_KEY || !problemId || isThinking}
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

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="6"
        height="12"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M5 11a7 7 0 0014 0M12 18v3M8 21h8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
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
