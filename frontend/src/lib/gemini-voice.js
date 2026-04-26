import { SUGGESTIONS_PROMPT, SYSTEM_PROMPT } from "./coach-prompts";
const DEFAULT_TIMEOUT_MS = 20000;
function endpoint(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}
const SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
];
async function postJSON(url, body, signal, timeoutMs) {
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted)
            controller.abort();
        else
            signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify(body),
        });
    }
    catch (err) {
        if (err.name === "AbortError") {
            throw new Error("Jose took too long to respond. Check your network and try again.");
        }
        throw new Error(`Could not reach Gemini: ${err.message || "network error"}.`);
    }
    finally {
        window.clearTimeout(timeout);
        if (signal)
            signal.removeEventListener("abort", onExternalAbort);
    }
    let data;
    try {
        data = (await response.json());
    }
    catch {
        throw new Error(`Gemini returned a non-JSON response (${response.status}).`);
    }
    if (!response.ok) {
        const reason = data.error?.message || data.error?.status || `${response.status}`;
        throw new Error(`Gemini request failed: ${reason}`);
    }
    if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}). Try rephrasing.`);
    }
    return data;
}
function extractText(data) {
    const text = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();
    if (!text)
        throw new Error("Gemini returned an empty response.");
    return text;
}
/**
 * Text-only coach turn: user transcript in, Jose reply out.
 */
export async function requestGeminiCoachReply({ apiKey, model, context, transcript, signal, timeoutMs = DEFAULT_TIMEOUT_MS, }) {
    if (!apiKey) {
        throw new Error("Gemini API key is missing. Set VITE_GEMINI_API_KEY in frontend/.env.");
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
export async function requestGeminiVoiceTurn({ apiKey, model, context, audioBase64, audioMime, signal, timeoutMs = 30000, }) {
    if (!apiKey) {
        throw new Error("Gemini API key is missing. Set VITE_GEMINI_API_KEY in frontend/.env.");
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
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        // If the model slipped and returned plain prose, treat it as the reply
        // with an empty transcript so the conversation still flows.
        return { transcript: "", reply: raw };
    }
    const obj = (parsed || {});
    const transcript = typeof obj.transcript === "string" ? obj.transcript.trim() : "";
    const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
    if (!reply) {
        throw new Error("Gemini returned an empty voice coach reply.");
    }
    return { transcript, reply };
}
function stripCodeFences(text) {
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
/**
 * Ask Gemini for 3 short follow-up questions the user might want to ask next.
 * Returns an empty array on any failure so the UI can gracefully fall back.
 */
export async function requestSuggestedQuestions({ apiKey, model, context, signal, timeoutMs = 12000, }) {
    if (!apiKey)
        return [];
    const body = {
        contents: [
            {
                role: "user",
                parts: [
                    { text: SUGGESTIONS_PROMPT },
                    { text: `Snapshot:\n${context}` },
                ],
            },
        ],
        generationConfig: {
            temperature: 0.95,
            maxOutputTokens: 180,
            topP: 0.95,
            responseMimeType: "application/json",
        },
        safetySettings: SAFETY_SETTINGS,
    };
    let data;
    try {
        data = await postJSON(endpoint(model, apiKey), body, signal, timeoutMs);
    }
    catch {
        return [];
    }
    let raw;
    try {
        raw = extractText(data);
    }
    catch {
        return [];
    }
    try {
        const parsed = JSON.parse(stripCodeFences(raw));
        const qs = Array.isArray(parsed.questions) ? parsed.questions : [];
        return qs
            .map((q) => (typeof q === "string" ? q.trim() : ""))
            .filter((q) => q.length > 0 && q.length <= 80)
            .slice(0, 3);
    }
    catch {
        return [];
    }
}
