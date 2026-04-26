// Parcel 2 inlines `process.env.*` at build time from `frontend/.env`.
// We keep the `VITE_` prefix for compatibility with the existing .env and
// any future migration; nothing here actually requires Vite.
export const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";
export const GEMINI_MODEL = process.env.VITE_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";
export const ENABLE_VOICE_COACH = String(process.env.ENABLE_VOICE_COACH ||
    process.env.VITE_ENABLE_VOICE_COACH ||
    "false").toLowerCase() === "true";
if (typeof window !== "undefined" && ENABLE_VOICE_COACH && !GEMINI_API_KEY) {
    // Non-fatal: the optional coach panel stays disabled until configured.
    console.warn("[Jose] GEMINI_API_KEY is not set; interview coach is disabled. " +
        "Add VITE_GEMINI_API_KEY to frontend/.env and restart the dev server.");
}
