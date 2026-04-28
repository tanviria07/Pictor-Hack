import { formatApiErrorMessage } from "./errors";
function withTimeout(signal, ms) {
    const t = AbortSignal.timeout(ms);
    return signal ? AbortSignal.any([t, signal]) : t;
}
const base = () => {
    const raw = process.env.API_BASE;
    const env = typeof raw === "string" ? raw.replace(/\/$/, "") : "";
    if (env)
        return env;
    return "";
};
async function j(path, init) {
    const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
    const hasBody = init?.body != null && init.body !== "";
    const headers = new Headers(init?.headers);
    if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const r = await fetch(url, {
        ...init,
        signal: withTimeout(init?.signal, 25_000),
        headers,
    });
    if (!r.ok) {
        const t = await r.text();
        throw new Error(formatApiErrorMessage(t || r.statusText, r.status));
    }
    return r.json();
}
export async function listCategories() {
    return j("/api/categories");
}
export async function listProblems(filters) {
    const q = new URLSearchParams();
    if (filters?.category)
        q.set("category", filters.category);
    if (filters?.difficulty)
        q.set("difficulty", filters.difficulty);
    const qs = q.toString();
    return j(`/api/problems${qs ? `?${qs}` : ""}`);
}
export async function getProblem(id) {
    return j(`/api/problems/${encodeURIComponent(id)}`);
}
export async function runCode(body) {
    return j("/api/run", { method: "POST", body: JSON.stringify(body) });
}
export async function validateStepwise(body) {
    return j("/api/validate", { method: "POST", body: JSON.stringify(body) });
}
export async function getHint(body) {
    return j("/api/hint", { method: "POST", body: JSON.stringify(body) });
}
export async function getInlineHint(body) {
    return j("/api/inline-hint", { method: "POST", body: JSON.stringify(body) });
}
export async function getTrace(body) {
    return j("/api/trace", { method: "POST", body: JSON.stringify(body) });
}
export async function saveSession(body) {
    return j("/api/session/save", { method: "POST", body: JSON.stringify(body) });
}
/** Session load is optional; failures must not block the editor. */
export async function loadSession(problemId) {
    try {
        const url = `${base()}/api/session/${encodeURIComponent(problemId)}`;
        const r = await fetch(url, { signal: withTimeout(undefined, 25_000) });
        if (r.status === 404)
            return null;
        if (!r.ok) {
            return null;
        }
        return r.json();
    }
    catch {
        return null;
    }
}
