import { SYSTEM_PROMPT } from "./coach-prompts";

interface GeminiTextRequest {
  apiKey: string;
  model: string;
  context: string;
  transcript: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface GeminiAudioRequest {
  apiKey: string;
  model: string;
  context: string;
  audioBase64: string;
  audioMime: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
    status?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 20000;

function endpoint(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
];

async function postJSON<TBody>(
  url: string,
  body: TBody,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<GeminiGenerateResponse> {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
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
      `Could not reach Gemini: ${(err as Error).message || "network error"}.`,
    );
  } finally {
    window.clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }

  let data: GeminiGenerateResponse;
  try {
    data = (await response.json()) as GeminiGenerateResponse;
  } catch {
    throw new Error(`Gemini returned a non-JSON response (${response.status}).`);
  }

  if (!response.ok) {
    const reason = data.error?.message || data.error?.status || `${response.status}`;
    throw new Error(`Gemini request failed: ${reason}`);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini blocked the request (${data.promptFeedback.blockReason}). Try rephrasing.`,
    );
  }

  return data;
}

function extractText(data: GeminiGenerateResponse): string {
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

/**
 * Text-only coach turn: user transcript in, Jose reply out.
 */
export async function requestGeminiCoachReply({
  apiKey,
  model,
  context,
  transcript,
  signal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: GeminiTextRequest): Promise<string> {
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. Set VITE_GEMINI_API_KEY in frontend/.env.",
    );
  }

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `${context}\n\nUser said: ${transcript}` }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 220,
      topP: 0.9,
    },
    safetySettings: SAFETY_SETTINGS,
  };

  const data = await postJSON(endpoint(model, apiKey), body, signal, timeoutMs);
  return extractText(data);
}

/**
 * Audio coach turn: we send the raw audio recording directly to Gemini, which
 * transcribes it AND writes a Jose-style reply in one call. This removes the
 * dependency on the browser's (often flaky) Web Speech API.
 *
 * Gemini returns a JSON object like:
 *   { "transcript": "what the user said", "reply": "Jose's answer" }
 */
export interface GeminiAudioTurn {
  transcript: string;
  reply: string;
}

export async function requestGeminiVoiceTurn({
  apiKey,
  model,
  context,
  audioBase64,
  audioMime,
  signal,
  timeoutMs = 30000,
}: GeminiAudioRequest): Promise<GeminiAudioTurn> {
  if (!apiKey) {
    throw new Error(
      "Gemini API key is missing. Set VITE_GEMINI_API_KEY in frontend/.env.",
    );
  }

  const instruction = [
    SYSTEM_PROMPT,
    "",
    "The user will send a short audio clip of their question. Do two things:",
    "1) Transcribe exactly what they said (verbatim, English).",
    '2) Write your Jose reply, obeying every rule above (spoken, 1-3 short sentences, no markdown, no code blocks).',
    "",
    'Respond ONLY with a single JSON object on one line, no prose and no markdown fences:',
    '{"transcript":"...","reply":"..."}',
    "If the audio is silent or unintelligible, return:",
    '{"transcript":"","reply":"I couldn\'t hear you clearly. Try again?"}',
  ].join("\n");

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: instruction },
          { text: `Context for your reply:\n${context}` },
          { inline_data: { mime_type: audioMime, data: audioBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 400,
      topP: 0.9,
      responseMimeType: "application/json",
    },
    safetySettings: SAFETY_SETTINGS,
  };

  const data = await postJSON(endpoint(model, apiKey), body, signal, timeoutMs);
  const raw = extractText(data);

  // Gemini should honor responseMimeType=application/json, but be defensive.
  const jsonText = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // If the model slipped and returned plain prose, treat it as the reply
    // with an empty transcript so the conversation still flows.
    return { transcript: "", reply: raw };
  }

  const obj = (parsed || {}) as Partial<GeminiAudioTurn>;
  const transcript = typeof obj.transcript === "string" ? obj.transcript.trim() : "";
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  if (!reply) {
    throw new Error("Gemini returned an empty voice coach reply.");
  }
  return { transcript, reply };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    // Strip ```json ... ``` or ``` ... ```
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  return trimmed;
}
