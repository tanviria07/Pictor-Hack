// Parcel 2 inlines `process.env.*` at build time from `frontend/.env`.
// We keep the `VITE_` prefix for compatibility with the existing .env and
// any future migration; nothing here actually requires Vite.
export const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    "";
export const GEMINI_MODEL = process.env.VITE_GEMINI_MODEL ||
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";
if (typeof window !== "undefined" && !GEMINI_API_KEY) {
    // Non-fatal: the voice coach will simply render nothing.
    console.warn("[Jose] GEMINI_API_KEY is not set; voice coach is disabled. " +
        "Add VITE_GEMINI_API_KEY to frontend/.env and restart the dev server.");
}
