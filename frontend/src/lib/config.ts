// Parcel 2 inlines `process.env.*` at build time from `frontend/.env`.
// The frontend no longer ships a Gemini API key — all Gemini calls are
// proxied through the Go API at /api/voice/*. A single boolean toggle lets
// an operator hide the voice coach widget if they don't want to expose it.
//
// The default is "enabled" so a normal Cloudflare Pages deploy needs zero
// client-side configuration for Jose to work; the key lives only on Fly.
const rawFlag =
  process.env.VOICE_COACH_ENABLED ??
  process.env.VITE_VOICE_COACH_ENABLED ??
  "";

export const VOICE_COACH_ENABLED = !/^(0|false|no|off)$/i.test(String(rawFlag));
