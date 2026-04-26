import { useCallback, useEffect, useMemo, useRef, useState, } from "react";
import { requestGeminiCoachReply, requestGeminiVoiceTurn, requestSuggestedQuestions, } from "../lib/gemini-voice";
import { GEMINI_API_KEY, GEMINI_MODEL } from "../lib/config";
import { buildCoachContext } from "../lib/voice-context";
const MAX_RECORDING_MS = 20000;
const SILENCE_STOP_MS = 1500;
const SILENCE_THRESHOLD = 0.015; // RMS 0..1
const LEVEL_BAR_COUNT = 5;
const DEFAULT_SUGGESTIONS_GENERAL = [
    "Where should I start?",
    "Explain the brute force",
    "What data structure fits?",
];
const DEFAULT_SUGGESTIONS_PROBLEM = [
    "What approach should I try?",
    "What's the time complexity?",
    "Am I on the right track?",
];
const DEFAULT_SUGGESTIONS_POST_REPLY = [
    "Can you give me a hint?",
    "What's an edge case I'm missing?",
    "How would I optimize this?",
];
function pickBestVoice() {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
        return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length)
        return null;
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
        if (found)
            return found;
    }
    return (voices.find((v) => v.lang?.toLowerCase().startsWith("en-us")) ||
        voices.find((v) => v.lang?.toLowerCase().startsWith("en")) ||
        voices[0] ||
        null);
}
function friendlySpeechError(code) {
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
function pickRecorderMime() {
    if (typeof MediaRecorder === "undefined")
        return null;
    const candidates = [
        { mime: "audio/webm;codecs=opus", geminiMime: "audio/webm" },
        { mime: "audio/webm", geminiMime: "audio/webm" },
        { mime: "audio/ogg;codecs=opus", geminiMime: "audio/ogg" },
        { mime: "audio/ogg", geminiMime: "audio/ogg" },
        { mime: "audio/mp4", geminiMime: "audio/mp4" },
        { mime: "audio/mpeg", geminiMime: "audio/mpeg" },
    ];
    for (const c of candidates) {
        if (MediaRecorder.isTypeSupported?.(c.mime))
            return c;
    }
    return { mime: "", geminiMime: "audio/webm" };
}
async function blobToBase64(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
    }
    return window.btoa(binary);
}
let nextTurnId = 1;
function makeTurn(role, text) {
    return { id: nextTurnId++, role, text };
}
export function VoiceCoach({ problemDetail, code, hints }) {
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const recorderMimeRef = useRef(null);
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const silenceTimerRef = useRef(null);
    const maxStopTimerRef = useRef(null);
    const vadRafRef = useRef(null);
    const levelWriteTsRef = useRef(0);
    const recognitionRef = useRef(null);
    const abortRef = useRef(null);
    const suggestAbortRef = useRef(null);
    const panelRef = useRef(null);
    const threadRef = useRef(null);
    const transcriptRef = useRef("");
    const voiceRef = useRef(null);
    const [useSRFallback, setUseSRFallback] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [error, setError] = useState(null);
    const [turns, setTurns] = useState([]);
    const [levels, setLevels] = useState(() => new Array(LEVEL_BAR_COUNT).fill(0));
    const [suggestions, setSuggestions] = useState([]);
    const speechRecognitionCtor = useMemo(() => typeof window === "undefined"
        ? null
        : window.SpeechRecognition || window.webkitSpeechRecognition || null, []);
    const hasRecorder = typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia;
    const hasSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;
    const supported = Boolean(GEMINI_API_KEY && hasSynthesis && (hasRecorder || speechRecognitionCtor));
    // Seed starter suggestions based on current problem.
    useEffect(() => {
        if (turns.length > 0)
            return;
        setSuggestions((problemDetail
            ? DEFAULT_SUGGESTIONS_PROBLEM
            : DEFAULT_SUGGESTIONS_GENERAL).slice());
    }, [problemDetail, turns.length]);
    // Preload TTS voices.
    useEffect(() => {
        if (!hasSynthesis)
            return;
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
        if (!hasSynthesis)
            return;
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
    }, [hasSynthesis]);
    const speakReply = useCallback((text) => {
        if (!hasSynthesis || !text.trim())
            return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = voiceRef.current || pickBestVoice();
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang || "en-US";
        }
        else {
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
            const kind = ev.error;
            if (kind && kind !== "interrupted" && kind !== "canceled") {
                setError("Jose could not play audio in this browser session.");
            }
        };
        window.speechSynthesis.speak(utterance);
    }, [hasSynthesis]);
    // Fetch contextual follow-up suggestions (non-blocking).
    const refreshSuggestions = useCallback(() => {
        if (!GEMINI_API_KEY)
            return;
        suggestAbortRef.current?.abort();
        const controller = new AbortController();
        suggestAbortRef.current = controller;
        const context = buildCoachContext(problemDetail, code, hints);
        void (async () => {
            const fetched = await requestSuggestedQuestions({
                apiKey: GEMINI_API_KEY,
                model: GEMINI_MODEL,
                context,
                signal: controller.signal,
            });
            if (controller.signal.aborted)
                return;
            if (fetched.length > 0) {
                setSuggestions(fetched);
            }
            else {
                setSuggestions(DEFAULT_SUGGESTIONS_POST_REPLY.slice());
            }
        })();
    }, [code, hints, problemDetail]);
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
        }
        catch {
            /* noop */
        }
        audioCtxRef.current = null;
        analyserRef.current = null;
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        recorderRef.current = null;
        setLevels(new Array(LEVEL_BAR_COUNT).fill(0));
    }, []);
    const stopRecorder = useCallback(() => {
        const rec = recorderRef.current;
        if (rec && rec.state !== "inactive") {
            try {
                rec.stop();
            }
            catch {
                /* noop */
            }
        }
        else {
            teardownRecording();
        }
        setIsListening(false);
    }, [teardownRecording]);
    const submitAudioBlob = useCallback(async (blob) => {
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
            if (controller.signal.aborted)
                return;
            setTurns((prev) => {
                const next = [...prev];
                if (result.transcript)
                    next.push(makeTurn("user", result.transcript));
                next.push(makeTurn("coach", result.reply));
                return next;
            });
            speakReply(result.reply);
            refreshSuggestions();
        }
        catch (err) {
            if (controller.signal.aborted)
                return;
            setError(err instanceof Error ? err.message : "Voice coach request failed.");
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
            setIsThinking(false);
        }
    }, [code, hints, problemDetail, refreshSuggestions, speakReply]);
    const startRecording = useCallback(async () => {
        if (!hasRecorder)
            return false;
        stopSpeaking();
        setError(null);
        transcriptRef.current = "";
        setIsOpen(true);
        chunksRef.current = [];
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
        }
        catch (err) {
            setError(err?.name === "NotAllowedError"
                ? "Microphone access was blocked. Enable mic permission for this site."
                : "Could not access microphone.");
            return false;
        }
        streamRef.current = stream;
        const mime = pickRecorderMime();
        recorderMimeRef.current = mime;
        let recorder;
        try {
            recorder = mime?.mime
                ? new MediaRecorder(stream, { mimeType: mime.mime })
                : new MediaRecorder(stream);
        }
        catch (err) {
            setError(`Could not start recorder: ${err.message || "unknown error"}.`);
            teardownRecording();
            return false;
        }
        recorderRef.current = recorder;
        recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0)
                chunksRef.current.push(e.data);
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
            }
            else {
                setError("I didn't catch anything. Try again.");
            }
        };
        try {
            const AudioCtor = window.AudioContext ||
                window
                    .webkitAudioContext;
            if (AudioCtor) {
                const ctx = new AudioCtor();
                audioCtxRef.current = ctx;
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                analyserRef.current = analyser;
                const timeBuf = new Float32Array(analyser.fftSize);
                const freqBuf = new Uint8Array(analyser.frequencyBinCount);
                const LEVEL_WRITE_MS = 70;
                const tick = () => {
                    // Voice-activity detection (RMS on time domain).
                    analyser.getFloatTimeDomainData(timeBuf);
                    let sum = 0;
                    for (let i = 0; i < timeBuf.length; i++) {
                        sum += timeBuf[i] * timeBuf[i];
                    }
                    const rms = Math.sqrt(sum / timeBuf.length);
                    if (rms > SILENCE_THRESHOLD) {
                        if (silenceTimerRef.current !== null) {
                            window.clearTimeout(silenceTimerRef.current);
                            silenceTimerRef.current = null;
                        }
                    }
                    else if (silenceTimerRef.current === null) {
                        silenceTimerRef.current = window.setTimeout(() => {
                            stopRecorder();
                        }, SILENCE_STOP_MS);
                    }
                    // Throttle visualization updates so we don't thrash React.
                    const now = performance.now();
                    if (now - levelWriteTsRef.current > LEVEL_WRITE_MS) {
                        levelWriteTsRef.current = now;
                        analyser.getByteFrequencyData(freqBuf);
                        const bars = [];
                        const bandSize = Math.floor(freqBuf.length / LEVEL_BAR_COUNT);
                        for (let b = 0; b < LEVEL_BAR_COUNT; b++) {
                            let acc = 0;
                            const start = b * bandSize;
                            const end = Math.min(freqBuf.length, start + bandSize);
                            for (let i = start; i < end; i++)
                                acc += freqBuf[i];
                            const avg = acc / Math.max(1, end - start);
                            // Normalize and boost responsiveness.
                            bars.push(Math.min(1, (avg / 255) * 1.8));
                        }
                        setLevels(bars);
                    }
                    vadRafRef.current = requestAnimationFrame(tick);
                };
                vadRafRef.current = requestAnimationFrame(tick);
            }
        }
        catch {
            /* VAD + meter are best-effort; the max-duration timer still stops us. */
        }
        maxStopTimerRef.current = window.setTimeout(() => {
            stopRecorder();
        }, MAX_RECORDING_MS);
        try {
            recorder.start(250);
            setIsListening(true);
            return true;
        }
        catch (err) {
            setError(`Could not start recorder: ${err.message || "unknown error"}.`);
            teardownRecording();
            return false;
        }
    }, [hasRecorder, stopSpeaking, submitAudioBlob, teardownRecording, stopRecorder]);
    // ---- SpeechRecognition fallback (only if MediaRecorder is unavailable). ----
    const submitTranscript = useCallback(async (spokenText) => {
        if (!spokenText.trim())
            return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsThinking(true);
        setError(null);
        setTurns((prev) => [...prev, makeTurn("user", spokenText)]);
        try {
            const context = buildCoachContext(problemDetail, code, hints);
            const nextReply = await requestGeminiCoachReply({
                apiKey: GEMINI_API_KEY,
                model: GEMINI_MODEL,
                context,
                transcript: spokenText,
                signal: controller.signal,
            });
            if (controller.signal.aborted)
                return;
            setTurns((prev) => [...prev, makeTurn("coach", nextReply)]);
            speakReply(nextReply);
            refreshSuggestions();
        }
        catch (err) {
            if (controller.signal.aborted)
                return;
            setError(err instanceof Error ? err.message : "Voice coach request failed.");
        }
        finally {
            if (abortRef.current === controller)
                abortRef.current = null;
            setIsThinking(false);
        }
    }, [code, hints, problemDetail, refreshSuggestions, speakReply]);
    const startSpeechRecognition = useCallback(async () => {
        if (!speechRecognitionCtor) {
            setError("Speech recognition is not supported in this browser.");
            return;
        }
        try {
            recognitionRef.current?.abort();
        }
        catch {
            /* noop */
        }
        stopSpeaking();
        setError(null);
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
        };
        recognition.onerror = (event) => {
            const msg = friendlySpeechError(event.error);
            if (msg)
                setError(msg);
            setIsListening(false);
        };
        recognition.onend = () => {
            setIsListening(false);
            const finalTranscript = transcriptRef.current.trim();
            if (finalTranscript)
                void submitTranscript(finalTranscript);
        };
        recognitionRef.current = recognition;
        try {
            recognition.start();
        }
        catch (err) {
            setIsListening(false);
            setError(`Could not start speech recognition: ${err.message || "unknown error"}`);
        }
    }, [speechRecognitionCtor, stopSpeaking, submitTranscript]);
    const startListening = useCallback(async () => {
        if (hasRecorder && !useSRFallback) {
            const ok = await startRecording();
            if (!ok && speechRecognitionCtor) {
                setUseSRFallback(true);
                await startSpeechRecognition();
            }
        }
        else if (speechRecognitionCtor) {
            await startSpeechRecognition();
        }
        else {
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
        if (recorderRef.current)
            stopRecorder();
        else if (recognitionRef.current) {
            try {
                recognitionRef.current.stop();
            }
            catch {
                /* noop */
            }
            setIsListening(false);
        }
    }, [stopRecorder]);
    const toggleListening = useCallback(() => {
        if (isListening)
            stopListening();
        else
            void startListening();
    }, [isListening, startListening, stopListening]);
    const askSuggestion = useCallback((text) => {
        if (!text || isListening || isThinking)
            return;
        stopSpeaking();
        setIsOpen(true);
        void submitTranscript(text);
    }, [isListening, isThinking, stopSpeaking, submitTranscript]);
    const resetConversation = useCallback(() => {
        stopListening();
        stopSpeaking();
        abortRef.current?.abort();
        suggestAbortRef.current?.abort();
        setTurns([]);
        setError(null);
        setSuggestions((problemDetail
            ? DEFAULT_SUGGESTIONS_PROBLEM
            : DEFAULT_SUGGESTIONS_GENERAL).slice());
    }, [problemDetail, stopListening, stopSpeaking]);
    const replayLast = useCallback(() => {
        const last = [...turns].reverse().find((t) => t.role === "coach");
        if (last) {
            if (isSpeaking)
                stopSpeaking();
            else
                speakReply(last.text);
        }
    }, [isSpeaking, speakReply, stopSpeaking, turns]);
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (!(event.ctrlKey && event.shiftKey && event.code === "KeyV"))
                return;
            event.preventDefault();
            if (!supported)
                return;
            if (!isOpen)
                setIsOpen(true);
            toggleListening();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, supported, toggleListening]);
    useEffect(() => {
        return () => {
            try {
                recognitionRef.current?.abort();
            }
            catch {
                /* noop */
            }
            teardownRecording();
            abortRef.current?.abort();
            suggestAbortRef.current?.abort();
            if (typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, [teardownRecording]);
    useEffect(() => {
        if (!isOpen)
            return;
        panelRef.current?.focus();
    }, [isOpen]);
    useEffect(() => {
        if (!threadRef.current)
            return;
        threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }, [turns, isThinking, error]);
    if (!GEMINI_API_KEY)
        return null;
    const stage = isListening
        ? "listening"
        : isThinking
            ? "thinking"
            : isSpeaking
                ? "speaking"
                : "idle";
    const statusText = {
        idle: turns.length === 0 ? "Tap to start talking to Jose" : "Tap to ask again",
        listening: "Listening… speak now",
        thinking: "Jose is thinking…",
        speaking: "Jose is speaking",
    };
    const hasLastCoachReply = turns.some((t) => t.role === "coach");
    return (<div className="voice-coach-shell">
      {isOpen && (<div ref={panelRef} className={`voice-coach-panel voice-coach-panel--${stage}`} tabIndex={-1} aria-live="polite">
          <div className="voice-coach-panel-head">
            <div className="voice-coach-panel-heading">
              <p className="voice-coach-panel-title">Jose</p>
              <p className="voice-coach-panel-sub">
                {problemDetail?.title ?? "General coding coach"}
              </p>
            </div>
            <div className="voice-coach-panel-head-actions">
              <button type="button" className="voice-coach-icon-btn" onClick={resetConversation} disabled={turns.length === 0 && !error} aria-label="Start a new conversation" title="New chat">
                <NewChatIcon />
              </button>
              <button type="button" className="voice-coach-icon-btn" onClick={() => {
                stopListening();
                stopSpeaking();
                abortRef.current?.abort();
                setIsOpen(false);
            }} aria-label="Close voice coach" title="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="voice-coach-stage" data-stage={stage}>
            <button type="button" className={`voice-coach-orb voice-coach-orb--${stage}`} onClick={() => {
                if (!supported)
                    return;
                toggleListening();
            }} disabled={!supported || isThinking} aria-label={isListening
                ? "Stop listening"
                : isThinking
                    ? "Jose is thinking"
                    : "Start listening"} title={isListening
                ? "Tap to stop"
                : isThinking
                    ? "Thinking…"
                    : "Tap to talk"}>
              <span className="voice-coach-orb-rings" aria-hidden="true">
                <span className="voice-coach-orb-ring"/>
                <span className="voice-coach-orb-ring"/>
                <span className="voice-coach-orb-ring"/>
              </span>
              <span className="voice-coach-orb-core" aria-hidden="true">
                {stage === "thinking" ? (<ThinkingDots />) : stage === "speaking" ? (<SpeakerWave />) : (<MicIcon />)}
              </span>
            </button>

            <div className="voice-coach-stage-status">
              <p className="voice-coach-status-text">{statusText[stage]}</p>
              {stage === "listening" && (<div className="voice-coach-level" aria-hidden="true">
                  {levels.map((v, i) => (<span key={i} className="voice-coach-level-bar" style={{
                        ["--level"]: Math.max(0.08, v),
                    }}/>))}
                </div>)}
            </div>
          </div>

          <div ref={threadRef} className="voice-coach-thread">
            {!supported && (<p className="voice-coach-copy">
                Jose needs a microphone, speech synthesis, and a Gemini API
                key. Try the latest Chrome or Edge over HTTPS (or localhost).
              </p>)}
            {supported && turns.length === 0 && !error && !isThinking && (<p className="voice-coach-copy">
                Ask about your approach, complexity, edge cases, or what hint
                to try next. Recording auto-stops after a short pause.
              </p>)}
            {turns.map((t) => (<div key={t.id} className={`voice-coach-bubble voice-coach-bubble--${t.role}`}>
                <span className="voice-coach-bubble-avatar" aria-hidden="true">
                  {t.role === "user" ? "You" : "J"}
                </span>
                <div className="voice-coach-bubble-body">
                  <span className="voice-coach-label">
                    {t.role === "user" ? "You" : "Jose"}
                  </span>
                  <p>{t.text}</p>
                </div>
              </div>))}
            {isThinking && (<div className="voice-coach-bubble voice-coach-bubble--coach voice-coach-bubble--thinking">
                <span className="voice-coach-bubble-avatar" aria-hidden="true">
                  J
                </span>
                <div className="voice-coach-bubble-body">
                  <span className="voice-coach-label">Jose</span>
                  <ThinkingDots />
                </div>
              </div>)}
            {error && <p className="voice-coach-error-text">{error}</p>}
          </div>

          {supported && suggestions.length > 0 && (<div className="voice-coach-suggestions" role="group" aria-label="Suggested questions">
              <span className="voice-coach-suggestions-label">Try asking</span>
              <div className="voice-coach-suggestions-row">
                {suggestions.map((s, i) => (<button key={`${s}-${i}`} type="button" className="voice-coach-chip" onClick={() => askSuggestion(s)} disabled={isListening || isThinking}>
                    {s}
                  </button>))}
              </div>
            </div>)}

          <div className="voice-coach-footer">
            <button type="button" className="voice-coach-footer-btn" onClick={replayLast} disabled={!hasLastCoachReply || isListening || isThinking} aria-label={isSpeaking ? "Stop playback" : "Replay last reply"} title={isSpeaking ? "Stop" : "Replay"}>
              {isSpeaking ? <StopIcon /> : <ReplayIcon />}
              <span>{isSpeaking ? "Stop" : "Replay"}</span>
            </button>
            <span className="voice-coach-kbd" title="Global shortcut">
              Ctrl+Shift+V
            </span>
          </div>
        </div>)}

      <button type="button" className={`voice-coach-widget voice-coach-widget--${stage}`} onClick={() => {
            if (!isOpen) {
                setIsOpen(true);
                if (!isListening && !isThinking)
                    void startListening();
            }
            else {
                toggleListening();
            }
        }} aria-label={isListening ? "Stop listening" : "Open Jose"} title={isListening
            ? "Stop listening (Ctrl+Shift+V)"
            : "Open Jose (Ctrl+Shift+V)"}>
        <span className="voice-coach-widget-ring" aria-hidden="true"/>
        <span className="voice-coach-widget-icon">
          {stage === "thinking" ? (<ThinkingDots />) : stage === "speaking" ? (<SpeakerWave />) : (<MicIcon />)}
        </span>
      </button>
    </div>);
}
// ---- SVG icons (no dependencies) ----
function MicIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.2"/>
      <path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>);
}
function ThinkingDots() {
    return (<span className="voice-coach-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>);
}
function SpeakerWave() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 10v4h3l5 4V6L7 10H4z" fill="currentColor" fillOpacity="0.85"/>
      <path d="M16 8c1.5 1.2 2.5 2.6 2.5 4s-1 2.8-2.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M19 5c2.2 1.8 3.5 4.2 3.5 7s-1.3 5.2-3.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
    </svg>);
}
function ReplayIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12a8 8 0 108-8v3m0 0L9 4m3 3L9 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
function StopIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
    </svg>);
}
function NewChatIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19l2-5a8 8 0 116 3l-8 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>);
}
function CloseIcon() {
    return (<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>);
}
