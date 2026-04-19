export const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY || "";
export const GEMINI_MODEL = process.env.VITE_GEMINI_MODEL || "gemini-2.0-flash";

if (!GEMINI_API_KEY) {
  console.warn('VITE_GEMINI_API_KEY not set - voice coach disabled');
}
