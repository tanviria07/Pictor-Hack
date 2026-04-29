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
        credentials: "include",
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
export async function getCoachReply(body, signal) {
    return j("/api/coach", { method: "POST", body: JSON.stringify(body), signal });
}
export async function saveSession(body) {
    return j("/api/session/save", { method: "POST", body: JSON.stringify(body) });
}
/** Session load is optional; failures must not block the editor. */
export async function loadSession(problemId) {
    try {
        const url = `${base()}/api/session/${encodeURIComponent(problemId)}`;
        const r = await fetch(url, { signal: withTimeout(undefined, 25_000), credentials: "include" });
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

export async function signup(body) {
    return j("/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
}
export async function login(body) {
    return j("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
}
export async function logout() {
    return j("/api/auth/logout", { method: "POST" });
}
export async function getMe() {
    try {
        return await j("/api/auth/me");
    }
    catch {
        return null;
    }
}
export async function getMyDashboard() {
    return j("/api/me/dashboard");
}
export async function getMyProgress() {
    try {
        return await j("/api/me/progress");
    }
    catch {
        return null;
    }
}
export async function saveMySession(body) {
    return j("/api/me/session/save", { method: "POST", body: JSON.stringify(body) });
}
export async function loadMySession(problemId) {
    try {
        const url = `${base()}/api/me/session/${encodeURIComponent(problemId)}`;
        const r = await fetch(url, { signal: withTimeout(undefined, 25_000), credentials: "include" });
        if (r.status === 404 || r.status === 401)
            return null;
        if (!r.ok)
            return null;
        return r.json();
    }
    catch {
        return null;
    }
}
export async function exportMyProgress() {
    return j("/api/me/export");
}
export async function resetMyProgress() {
    return j("/api/me/reset-progress", { method: "POST" });
}
export async function deleteMyAccount() {
    return j("/api/me/account", { method: "DELETE" });
}
