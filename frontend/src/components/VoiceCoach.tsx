import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestGeminiCoachReply } from "@/lib/gemini-voice";
import { GEMINI_API_KEY, GEMINI_MODEL } from "@/lib/config";
import { buildCoachContext } from "@/lib/voice-context";
import type { ProblemDetail } from "@/lib/types";

type SpeechRecognitionCtor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
  }

  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
  }
}

interface VoiceCoachProps {
  problemDetail: ProblemDetail | null;
  code: string;
  hints: string[];
}

export function VoiceCoach({ problemDetail, code, hints }: VoiceCoachProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef("");
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");

  const speechRecognitionCtor = useMemo(
    () => window.SpeechRecognition || window.webkitSpeechRecognition || null,
    [],
  );

  const supported = Boolean(
    GEMINI_API_KEY &&
      speechRecognitionCtor &&
      "speechSynthesis" in window &&
      "mediaDevices" in navigator,
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speakReply = useCallback((text: string) => {
    if (!("speechSynthesis" in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setError(null);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setError("Jose could not play audio in this browser session.");
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const submitTranscript = useCallback(
    async (spokenText: string) => {
      if (!spokenText.trim()) return;
      setIsThinking(true);
      setError(null);
      try {
        const context = buildCoachContext(problemDetail, code, hints);
        const nextReply = await requestGeminiCoachReply({
          apiKey: GEMINI_API_KEY,
          model: GEMINI_MODEL,
          context,
          transcript: spokenText,
        });
        setReply(nextReply);
        speakReply(nextReply);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Voice coach request failed.";
        setError(message);
      } finally {
        setIsThinking(false);
      }
    },
    [code, hints, problemDetail, speakReply],
  );

  const startListening = useCallback(() => {
    if (!speechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    setError(null);
    setReply("");
    setTranscript("");
    transcriptRef.current = "";
    setIsOpen(true);

    const recognition = new speechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      transcriptRef.current = text;
      setTranscript(text);
    };

    recognition.onerror = (event) => {
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      const finalTranscript = transcriptRef.current.trim();
      setIsListening(false);
      if (finalTranscript) {
        void submitTranscript(finalTranscript);
      }
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, [speechRecognitionCtor, submitTranscript, transcript]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.code === "KeyV")) return;
      event.preventDefault();
      if (!supported) return;
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isListening, startListening, stopListening, supported]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  if (!GEMINI_API_KEY) return null;

  return (
    <div className="voice-coach-shell">
      {isOpen && (
        <div
          ref={panelRef}
          className="voice-coach-panel"
          tabIndex={-1}
          aria-live="polite"
        >
          <div className="voice-coach-panel-head">
            <div>
              <p className="voice-coach-panel-title">Jose</p>
              <p className="voice-coach-panel-sub">
                {problemDetail?.title ?? "General coding coach"}
              </p>
            </div>
            <button
              type="button"
              className="voice-coach-close"
              onClick={() => {
                stopListening();
                setIsOpen(false);
              }}
              aria-label="Close voice coach"
            >
              x
            </button>
          </div>

          <div className="voice-coach-panel-body">
            {!supported && (
              <p className="voice-coach-copy">
                Jose needs browser speech recognition and speech
                synthesis support.
              </p>
            )}
            {transcript && (
              <div className="voice-coach-bubble voice-coach-bubble--user">
                <span className="voice-coach-label">You</span>
                <p>{transcript}</p>
              </div>
            )}
            {reply && (
              <div className="voice-coach-bubble voice-coach-bubble--coach">
                <span className="voice-coach-label">Coach</span>
                <p>{reply}</p>
              </div>
            )}
            {!transcript && !reply && !error && (
              <p className="voice-coach-copy">
                Ask Jose about your current approach, complexity, or what hint to try
                next.
              </p>
            )}
            {error && <p className="voice-coach-error-text">{error}</p>}
          </div>

          <div className="voice-coach-panel-actions">
            <button
              type="button"
              className="voice-coach-action"
              onClick={() => {
                if (isListening) {
                  stopListening();
                } else {
                  startListening();
                }
              }}
              disabled={!supported || isThinking}
            >
              {isListening
                ? "Stop Listening"
                : isThinking
                  ? "Thinking..."
                  : "Start Listening"}
            </button>
            <button
              type="button"
              className="voice-coach-action voice-coach-action--secondary"
              onClick={() => speakReply(reply)}
              disabled={!reply || isListening || isThinking}
            >
              {isSpeaking ? "Speaking..." : "Replay Reply"}
            </button>
            <span className="voice-coach-hint">Ctrl+Shift+V</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`voice-coach-widget${isListening ? " voice-coach-listening" : ""}${isThinking ? " voice-coach-processing" : ""}`}
        onClick={() => {
          setIsOpen(true);
          if (!isListening && !isThinking) startListening();
        }}
        aria-label="Open Jose"
        title="Open Jose"
      >
        <span className="voice-coach-icon">
          {isThinking ? "..." : isListening ? "Mic" : "VC"}
        </span>
      </button>
    </div>
  );
}
