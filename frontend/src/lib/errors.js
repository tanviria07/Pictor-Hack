/** Turn proxy/HTML/API failures into short, actionable messages for the UI. */
function tryParseJsonError(raw) {
    const t = raw.trim();
    if (!t.startsWith("{"))
        return null;
    try {
        const j = JSON.parse(t);
        if (j && typeof j.message === "string") {
            const out = {
                code: typeof j.code === "string" ? j.code : undefined,
                message: j.message,
            };
            if (j.details && typeof j.details === "object" && j.details !== null) {
                const d = {};
                for (const [k, v] of Object.entries(j.details)) {
                    if (typeof v === "string")
                        d[k] = v;
                }
                if (Object.keys(d).length)
                    out.details = d;
            }
            return out;
        }
    }
    catch {
        /* ignore */
    }
    return null;
}
function humanizeFromCode(code, message, status) {
    switch (code) {
        case "runner_unavailable":
            return "The code runner is not reachable. Start runner-python on port 8001 and ensure the Go API can reach it.";
        case "service_unavailable":
            return "A required service is temporarily unavailable. Retry in a moment or check the local backend services.";
        case "database_error":
            return "We could not save or load your session on the server. Your work is still in the editor; try again later.";
        case "hint_unavailable":
            return "Hints could not be generated right now. Check your connection and API configuration, then try again.";
        case "unsupported_language":
            return message || "Only Python solutions are supported in this environment.";
        case "bad_request":
            return message || "The request was invalid.";
        case "not_found":
            return message || "That resource was not found.";
        case "internal_error":
            if (status && status >= 500) {
                return "Something went wrong on the server. Try again or check that all backend services are running.";
            }
            return message || "Something went wrong.";
        default:
            break;
    }
    if (status === 502 || status === 503) {
        return "A backend service is down or overloaded. Confirm the API and runner are running.";
    }
    return message;
}
export function formatApiErrorMessage(raw, status) {
    const t = raw.trim();
    if (!t) {
        if (status === 502 || status === 503) {
            return humanizeFromCode(undefined, "", status);
        }
        return "Request failed.";
    }
    const parsed = tryParseJsonError(t);
    if (parsed) {
        return humanizeFromCode(parsed.code, parsed.message, status);
    }
    if (t.includes("<!DOCTYPE") ||
        t.includes("<html") ||
        t.includes("<HTML") ||
        t.includes("<body")) {
        return "Cannot reach the API. Start the Go backend on :8080 (or set API_BASE if the API is elsewhere).";
    }
    const lower = t.toLowerCase();
    if (lower.includes("internal server error") ||
        lower.includes("bad gateway") ||
        lower.includes("service unavailable") ||
        lower.includes("econnrefused")) {
        return "API unavailable or error. Start the Go server (default :8080) and ensure the dev proxy in .proxyrc.json targets your API.";
    }
    if (lower.includes("syntax") && lower.includes("error")) {
        return "Python reported a syntax error. Fix parsing issues in the editor, then run again.";
    }
    if (t.length > 280)
        return `${t.slice(0, 277)}…`;
    return t;
}
export function formatThrownError(e) {
    const m = e instanceof Error ? e.message : String(e);
    return formatApiErrorMessage(m);
}
