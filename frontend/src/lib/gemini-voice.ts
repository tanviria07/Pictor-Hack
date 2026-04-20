import { SUGGESTIONS_PROMPT, SYSTEM_PROMPT } from "./coach-prompts";

const DEFAULT_TIMEOUT_MS = 20000;

function apiBase(): string {
  const raw = process.env.API_BASE;
  const env = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
  return env || "";
}

async function postProxy<TBody, TRes>(
  path: string,
  body: TBody,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<TRes> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error(
        "Jose took too long to respond. Check your network and try again.",
      );
    }
    throw new Error(
      `Could not reach the server: ${(err as Error).message || "network error"}.`,
    );
  } finally {
    window.clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new Error(`Server returned a non-text response (${response.status}).`);
  }

  if (!response.ok) {
    let reason = `${response.status}`;
    try {
      const parsed = JSON.parse(text || "{}") as {
        message?: string;
        details?: { reason?: string };
      };
      if (parsed?.message) reason = parsed.message;
      else if (parsed?.details?.reason) reason = parsed.details.reason;
    } catch {
      if (text) reason = text;
    }
    throw new Error(`Jose request failed: ${reason}`);
  }

  try {
    return JSON.parse(text) as TRes;
  } catch {
    throw new Error(`Server returned invalid JSON (${response.status}).`);
  }
}

// ---- Text coach turn ------------------------------------------------------

interface TextTurnRequest {
  context: string;
  transcript: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Text-only coach turn: user transcript in, Jose reply out. Proxies through
 * the Go API at POST /api/voice/turn, so the Gemini key never reaches the
 * browser.
 */
export async function requestGeminiCoachReply({
  context,
  transcript,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: TextTurnRequest): Promise<string> {
  const data = await postProxy<
    { context: string; transcript: string },
    { reply: string; transcript?: string }
  >(
    "/api/voice/turn",
    { context, transcript },
    signal,
    timeoutMs,
  );
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) throw new Error("Jose returned an empty response.");
  return reply;
}

// ---- Audio coach turn -----------------------------------------------------

interface AudioTurnRequest {
  context: string;
  audioBase64: string;
  audioMime: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GeminiAudioTurn {
  transcript: string;
  reply: string;
}

export async function requestGeminiVoiceTurn({
  context,
  audioBase64,
  audioMime,
  signal,
  timeoutMs = 30000,
}: AudioTurnRequest): Promise<GeminiAudioTurn> {
  const data = await postProxy<
    { context: string; audio_base64: string; audio_mime: string },
    { transcript?: string; reply?: string }
  >(
    "/api/voice/turn",
    {
      context,
      audio_base64: audioBase64,
      audio_mime: audioMime,
    },
    signal,
    timeoutMs,
  );
  const transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
  const reply = typeof data.reply === "string" ? data.reply.trim() : "";
  if (!reply) throw new Error("Jose returned an empty response.");
  return { transcript, reply };
}

// ---- Follow-up question suggestions --------------------------------------

interface SuggestRequestInput {
  context: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function requestSuggestedQuestions({
  context,
  signal,
  timeoutMs = 12000,
}: SuggestRequestInput): Promise<string[]> {
  try {
    const data = await postProxy<
      { context: string },
      { questions?: unknown }
    >(
      "/api/voice/suggest",
      { context },
      signal,
      timeoutMs,
    );
    const qs = Array.isArray(data.questions) ? data.questions : [];
    return qs
      .map((q) => (typeof q === "string" ? q.trim() : ""))
      .filter((q) => q.length > 0 && q.length <= 80)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// Keep the prompt constants exported for any callers that still reference
// them (tests, debug views, etc). The prompts themselves are also held
// server-side; the browser copy is purely for display.
export { SUGGESTIONS_PROMPT, SYSTEM_PROMPT };
