export const DEEPSEEK_API_KEY = process.env.VITE_DEEPSEEK_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    "";
export const DEEPSEEK_MODEL = process.env.VITE_DEEPSEEK_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek-chat";

export const ENABLE_VOICE_COACH = String(process.env.ENABLE_VOICE_COACH ||
    process.env.VITE_ENABLE_VOICE_COACH ||
    "true").toLowerCase() === "true";

export const COACH_API_KEY = DEEPSEEK_API_KEY;

if (typeof window !== "undefined" && ENABLE_VOICE_COACH && !COACH_API_KEY) {
    // Non-fatal: the optional coach panel stays disabled until configured.
    console.warn("[Jose] DEEPSEEK_API_KEY is not set; interview coach is disabled. " +
        "Add VITE_DEEPSEEK_API_KEY to frontend/.env and restart the dev server.");
}
