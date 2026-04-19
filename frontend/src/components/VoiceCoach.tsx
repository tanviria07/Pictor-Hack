import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  requestGeminiCoachReply,
  requestGeminiVoiceTurn,
} from "@/lib/gemini-voice";
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
    maxAlternatives?: number;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
    onstart: (() => void) | null;
  }

  interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList;
    resultIndex: number;
  }

  interface SpeechRecognitionErrorEvent {
    error: string;
    message?: string;
  }
}

interface VoiceCoachProps {
  problemDetail: ProblemDetail | null;
  code: string;
  hints: string[];
}

const MAX_RECORDING_MS = 20000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.015; // RMS 0..1

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferred = [
    "Google UK English Male",
    "Google US English",
    "Microsoft Guy Online (Natural) - English (United States)",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Microsoft David - English (United States)",
    "Samantha",
    "Alex",
  ];
  for (const name of preferred) {
    const found = voices.find((v) => v.name === name);
    if (found) return found;
  }
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith("en-us")) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
    voices[0] ||
    null
  );
}

function friendlySpeechError(code: string): string {
  switch (code) {
    case "no-speech":
      return "I didn't catch anything. Tap the mic and try again.";
    case "audio-capture":
      return "No microphone was found. Check your system audio input.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Enable mic permission for this site.";
    case "network":
      return "The browser's speech service is unreachable. Switching to Gemini audio mode.";
    case "aborted":
      return "";
    default:
      return `Speech recognition error: ${code}`;
  }
}

// Choose a MediaRecorder mime type the browser actually supports.
function pickRecorderMime(): { mime: string; geminiMime: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates: Array<{ mime: string; geminiMime: string }> = [
    { mime: "audio/webm;codecs=opus", geminiMime: "audio/webm" },
    { mime: "audio/webm", geminiMime: "audio/webm" },
    { mime: "audio/ogg;codecs=opus", geminiMime: "audio/ogg" },
    { mime: "audio/ogg", geminiMime: "audio/ogg" },
    { mime: "audio/mp4", geminiMime: "audio/mp4" },
    { mime: "audio/mpeg", geminiMime: "audio/mpeg" },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c.mime)) return c;
  }
  // Default browser format — Gemini supports webm/ogg widely.
  return { mime: "", geminiMime: "audio/webm" };
}

async function blobToBase64(blob: Blob): Promise<string> {
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

export function VoiceCoach({ problemDetail, code, hints }: VoiceCoachProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef<{ mime: string; geminiMime: string } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const maxStopTimerRef = useRef<number | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  // Whether we've decided to use SpeechRecognition as a fallback this session.
  const [useSRFallback, setUseSRFallback] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");

  const speechRecognitionCtor = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : window.SpeechRecognition || window.webkitSpeechRecognition || null,
    [],
  );

  const hasRecorder =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;

  const hasSynthesis =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const supported = Boolean(
    GEMINI_API_KEY && hasSynthesis && (hasRecorder || speechRecognitionCtor),
  );

  // Preload TTS voices.
  useEffect(() => {
    if (!hasSynthesis) return;
    const refresh = () => {
      voiceRef.current = pickBestVoice();
    };
    refresh();
    window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", refresh);
    };
  }, [hasSynthesis]);

  const stopSpeaking = useCallback(() => {
    if (!hasSynthesis) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [hasSynthesis]);

  const speakReply = useCallback(
    (text: string) => {
      if (!hasSynthesis || !text.trim()) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voiceRef.current || pickBestVoice();
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || "en-US";
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = 1.02;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => {
        setIsSpeaking(true);
        setError(null);
      };
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (ev) => {
        setIsSpeaking(false);
        const kind = (ev as SpeechSynthesisErrorEvent).error;
        if (kind && kind !== "interrupted" && kind !== "canceled") {
          setError("Jose could not play audio in this browser session.");
        }
      };
      window.speechSynthesis.speak(utterance);
    },
    [hasSynthesis],
  );

  // ---- Shared cleanup for a recording session. ----
  const teardownRecording = useCallback(() => {
    if (vadRafRef.current !== null) {
      cancelAnimationFrame(vadRafRef.current);
      vadRafRef.current = null;
    }
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxStopTimerRef.current !== null) {
      window.clearTimeout(maxStopTimerRef.current);
      maxStopTimerRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {
      /* noop */
    }
    audioCtxRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  const stopRecorder = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    } else {
      teardownRecording();
    }
    setIsListening(false);
  }, [teardownRecording]);

  // ---- Gemini-only audio pipeline (preferred). ----
  const submitAudioBlob = useCallback(
    async (blob: Blob) => {
      if (!blob.size) {
        setError("No audio was captured. Try again.");
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsThinking(true);
      setError(null);
      try {
        const base64 = await blobToBase64(blob);
        const context = buildCoachContext(problemDetail, code, hints);
        const result = await requestGeminiVoiceTurn({
          apiKey: GEMINI_API_KEY,
          model: GEMINI_MODEL,
          context,
          audioBase64: base64,
          audioMime: recorderMimeRef.current?.geminiMime || "audio/webm",
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.transcript) setTranscript(result.transcript);
        setReply(result.reply);
        speakReply(result.reply);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Voice coach request failed.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsThinking(false);
      }
    },
    [code, hints, problemDetail, speakReply],
  );

  const startRecording = useCallback(async () => {
    if (!hasRecorder) return false;

    stopSpeaking();
    setError(null);
    setReply("");
    setTranscript("");
    transcriptRef.current = "";
    setIsOpen(true);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      setError(
        (err as Error)?.name === "NotAllowedError"
          ? "Microphone access was blocked. Enable mic permission for this site."
          : "Could not access microphone.",
      );
      return false;
    }
    streamRef.current = stream;

    const mime = pickRecorderMime();
    recorderMimeRef.current = mime;

    let recorder: MediaRecorder;
    try {
      recorder = mime?.mime
        ? new MediaRecorder(stream, { mimeType: mime.mime })
        : new MediaRecorder(stream);
    } catch (err) {
      setError(
        `Could not start recorder: ${(err as Error).message || "unknown error"}.`,
      );
      teardownRecording();
      return false;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      setError("Recording failed. Try again.");
      setIsListening(false);
      teardownRecording();
    };

    recorder.onstop = () => {
      setIsListening(false);
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || mime?.mime || "audio/webm",
      });
      chunksRef.current = [];
      teardownRecording();
      if (blob.size > 512) {
        void submitAudioBlob(blob);
      } else {
        setError("I didn't catch anything. Try again.");
      }
    };

    // Simple voice-activity detection: stop ~1.5s after user goes quiet.
    try {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtor) {
        const ctx = new AudioCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          if (rms > SILENCE_THRESHOLD) {
            if (silenceTimerRef.current !== null) {
              window.clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (silenceTimerRef.current === null) {
            silenceTimerRef.current = window.setTimeout(() => {
              stopRecorder();
            }, SILENCE_STOP_MS);
          }
          vadRafRef.current = requestAnimationFrame(tick);
        };
        vadRafRef.current = requestAnimationFrame(tick);
      }
    } catch {
      // VAD is best-effort; fall back to the hard max-duration timer.
    }

    maxStopTimerRef.current = window.setTimeout(() => {
      stopRecorder();
    }, MAX_RECORDING_MS);

    try {
      recorder.start(250);
      setIsListening(true);
      return true;
    } catch (err) {
      setError(
        `Could not start recorder: ${(err as Error).message || "unknown error"}.`,
      );
      teardownRecording();
      return false;
    }
  }, [hasRecorder, stopSpeaking, submitAudioBlob, teardownRecording, stopRecorder]);

  // ---- SpeechRecognition fallback (only used if MediaRecorder not available). ----
  const submitTranscript = useCallback(
    async (spokenText: string) => {
      if (!spokenText.trim()) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsThinking(true);
      setError(null);
      try {
        const context = buildCoachContext(problemDetail, code, hints);
        const nextReply = await requestGeminiCoachReply({
          apiKey: GEMINI_API_KEY,
          model: GEMINI_MODEL,
          context,
          transcript: spokenText,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setReply(nextReply);
        speakReply(nextReply);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Voice coach request failed.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsThinking(false);
      }
    },
    [code, hints, problemDetail, speakReply],
  );

  const startSpeechRecognition = useCallback(async () => {
    if (!speechRecognitionCtor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      /* noop */
    }

    stopSpeaking();
    setError(null);
    setReply("");
    setTranscript("");
    transcriptRef.current = "";
    setIsOpen(true);

    const recognition = new speechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    if ("maxAlternatives" in recognition) {
      recognition.maxAlternatives = 1;
    }

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      transcriptRef.current = text;
      setTranscript(text);
    };
    recognition.onerror = (event) => {
      const msg = friendlySpeechError(event.error);
      if (msg) setError(msg);
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
      const finalTranscript = transcriptRef.current.trim();
      if (finalTranscript) void submitTranscript(finalTranscript);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      setIsListening(false);
      setError(
        `Could not start speech recognition: ${(err as Error).message || "unknown error"}`,
      );
    }
  }, [speechRecognitionCtor, stopSpeaking, submitTranscript]);

  // ---- Unified entry point ----
  const startListening = useCallback(async () => {
    if (hasRecorder && !useSRFallback) {
      const ok = await startRecording();
      if (!ok && speechRecognitionCtor) {
        setUseSRFallback(true);
        await startSpeechRecognition();
      }
    } else if (speechRecognitionCtor) {
      await startSpeechRecognition();
    } else {
      setError("No microphone input method is available in this browser.");
    }
  }, [
    hasRecorder,
    speechRecognitionCtor,
    startRecording,
    startSpeechRecognition,
    useSRFallback,
  ]);

  const stopListening = useCallback(() => {
    if (recorderRef.current) stopRecorder();
    else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      setIsListening(false);
    }
  }, [stopRecorder]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else void startListening();
  }, [isListening, startListening, stopListening]);

  // Global shortcut: Ctrl+Shift+V.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey && event.shiftKey && event.code === "KeyV")) return;
      event.preventDefault();
      if (!supported) return;
      toggleListening();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [supported, toggleListening]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* noop */
      }
      teardownRecording();
      abortRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [teardownRecording]);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [transcript, reply, error, isThinking]);

  if (!GEMINI_API_KEY) return null;

  const micLabel = isThinking
    ? "..."
    : isListening
      ? "Mic"
      : isSpeaking
        ? "Spk"
        : "VC";

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
                stopSpeaking();
                abortRef.current?.abort();
                setIsOpen(false);
              }}
              aria-label="Close voice coach"
            >
              x
            </button>
          </div>

          <div ref={bodyRef} className="voice-coach-panel-body">
            {!supported && (
              <p className="voice-coach-copy">
                Jose needs a microphone, speech synthesis, and a Gemini API
                key. Try the latest Chrome or Edge over HTTPS (or localhost).
              </p>
            )}
            {supported &&
              !transcript &&
              !reply &&
              !error &&
              !isListening &&
              !isThinking && (
                <p className="voice-coach-copy">
                  Tap the mic and ask Jose about your approach, complexity, or
                  what hint to try next. Recording stops automatically after a
                  short silence.
                </p>
              )}
            {isListening && !transcript && (
              <p className="voice-coach-copy">Listening... speak now.</p>
            )}
            {transcript && (
              <div className="voice-coach-bubble voice-coach-bubble--user">
                <span className="voice-coach-label">You</span>
                <p>{transcript}</p>
              </div>
            )}
            {isThinking && (
              <p className="voice-coach-copy">Jose is thinking...</p>
            )}
            {reply && (
              <div className="voice-coach-bubble voice-coach-bubble--coach">
                <span className="voice-coach-label">Jose</span>
                <p>{reply}</p>
              </div>
            )}
            {error && <p className="voice-coach-error-text">{error}</p>}
          </div>

          <div className="voice-coach-panel-actions">
            <button
              type="button"
              className="voice-coach-action"
              onClick={toggleListening}
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
              onClick={() => {
                if (isSpeaking) stopSpeaking();
                else speakReply(reply);
              }}
              disabled={!reply || isListening || isThinking}
            >
              {isSpeaking ? "Stop" : "Replay"}
            </button>
            <span className="voice-coach-hint">Ctrl+Shift+V</span>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`voice-coach-widget${isListening ? " voice-coach-listening" : ""}${isThinking ? " voice-coach-processing" : ""}`}
        onClick={() => {
          if (!isOpen) {
            setIsOpen(true);
            if (!isListening && !isThinking) void startListening();
          } else {
            toggleListening();
          }
        }}
        aria-label={isListening ? "Stop listening" : "Open Jose"}
        title={
          isListening
            ? "Stop listening (Ctrl+Shift+V)"
            : "Open Jose (Ctrl+Shift+V)"
        }
      >
        <span className="voice-coach-icon">{micLabel}</span>
      </button>
    </div>
  );
}
