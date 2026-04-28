import { SYSTEM_PROMPT, RoleSystemPrompt } from "./prompts";

const DEFAULT_TIMEOUT_MS = 20000;

function endpoint() {
    return "https://api.deepseek.com/chat/completions";
}

function extractText(data) {
    const text = data.choices?.[0]?.message?.content
        ?.trim();
    if (!text)
        throw new Error("DeepSeek returned an empty response.");
    return text;
}

/**
 * Text-only coach turn: user transcript in, Jose reply out.
 */
export async function requestDeepSeekCoachReply({ apiKey, model, context, role, transcript, signal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    if (!apiKey) {
        throw new Error("DeepSeek API key is missing. Set VITE_DEEPSEEK_API_KEY in frontend/.env.");
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted)
            controller.abort();
        else
            signal.addEventListener("abort", onExternalAbort, { once: true });
    }
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    const systemContent = RoleSystemPrompt(SYSTEM_PROMPT, role);

    const body = {
        model: model || "deepseek-chat",
        messages: [
            {
                role: "system",
                content: systemContent,
            },
            {
                role: "user",
                content: `${context}\n\nUser said: ${transcript}`,
            },
        ],
        temperature: 0.7,
        max_tokens: 220,
        top_p: 0.9,
    };
    let response;
    try {
        response = await fetch(endpoint(), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            signal: controller.signal,
            body: JSON.stringify(body),
        });
    }
    catch (err) {
        if (err.name === "AbortError") {
            throw new Error("Jose took too long to respond. Check your network and try again.");
        }
        throw new Error(`Could not reach DeepSeek: ${err.message || "network error"}.`);
    }
    finally {
        window.clearTimeout(timeout);
        if (signal)
            signal.removeEventListener("abort", onExternalAbort);
    }

    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new Error(`DeepSeek returned a non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
        const reason = data.error?.message || `${response.status}`;
        throw new Error(`DeepSeek request failed: ${reason}`);
    }

    return extractText(data);
}
