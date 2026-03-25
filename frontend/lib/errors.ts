/** Turn proxy/HTML API failures into short, actionable messages for the UI. */
export function formatApiErrorMessage(raw: string): string {
  const t = raw.trim();
  if (!t) return "Request failed.";
  if (
    t.includes("<!DOCTYPE") ||
    t.includes("<html") ||
    t.includes("<HTML") ||
    t.includes("<body")
  ) {
    return "Cannot reach the API. Start the Go backend on :8080 (or set NEXT_PUBLIC_API_BASE if the API is elsewhere).";
  }
  const lower = t.toLowerCase();
  if (
    lower.includes("internal server error") ||
    lower.includes("bad gateway") ||
    lower.includes("service unavailable") ||
    lower.includes("econnrefused")
  ) {
    return "API unavailable or error. Start the Go server (default :8080) and ensure BACKEND_URL in Next matches.";
  }
  if (t.length > 280) return `${t.slice(0, 277)}…`;
  return t;
}

export function formatThrownError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return formatApiErrorMessage(m);
}
