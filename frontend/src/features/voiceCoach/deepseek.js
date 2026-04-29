import { SYSTEM_PROMPT, RoleSystemPrompt } from "./prompts";
import { getCoachReply } from "../../lib/api";

const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Text-only coach turn: user transcript in, Jose reply out.
 * The browser calls Kitkode's backend; DeepSeek credentials stay server-side.
 */
export async function requestDeepSeekCoachReply({ context, role, transcript, signal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
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
    try {
        const response = await getCoachReply({
            system_prompt: systemContent,
            context,
            role,
            transcript,
        }, controller.signal);
        const text = response.reply?.trim();
        if (!text)
            throw new Error("Jose returned an empty response.");
        return text;
    }
    catch (err) {
        if (err.name === "AbortError") {
            throw new Error("Jose took too long to respond. Check your network and try again.");
        }
        throw err;
    }
    finally {
        window.clearTimeout(timeout);
        if (signal)
            signal.removeEventListener("abort", onExternalAbort);
    }
}
