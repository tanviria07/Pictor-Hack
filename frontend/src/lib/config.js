export const DEEPSEEK_MODEL =
    process.env.DEEPSEEK_MODEL ||
    "deepseek-chat";

export const ENABLE_VOICE_COACH = String(process.env.ENABLE_VOICE_COACH ||
    process.env.VITE_ENABLE_VOICE_COACH ||
    "false").toLowerCase() === "true";

export const ENABLE_GOOGLE_AUTH = String(process.env.ENABLE_GOOGLE_AUTH ||
    process.env.VITE_ENABLE_GOOGLE_AUTH ||
    "false").toLowerCase() === "true";
export const ENABLE_EMAIL_VERIFICATION = String(process.env.ENABLE_EMAIL_VERIFICATION ||
    process.env.VITE_ENABLE_EMAIL_VERIFICATION ||
    "false").toLowerCase() === "true";
export const ENABLE_MAGIC_LINK = String(process.env.ENABLE_MAGIC_LINK ||
    process.env.VITE_ENABLE_MAGIC_LINK ||
    "false").toLowerCase() === "true";

// DeepSeek credentials are intentionally backend-only for the MVP.
export const COACH_API_KEY = "";
