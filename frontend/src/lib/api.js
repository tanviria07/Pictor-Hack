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
const TOKEN_KEY = "kitcode_token";

export function getAuthToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
}

export function setAuthToken(token) {
    if (token) {
        localStorage.setItem(TOKEN_KEY, token);
    }
    else {
        localStorage.removeItem(TOKEN_KEY);
    }
}

async function j(path, init) {
    const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
    const hasBody = init?.body != null && init.body !== "";
    const headers = new Headers(init?.headers);
    if (hasBody && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    const token = getAuthToken();
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    let r;
    try {
        r = await fetch(url, {
            ...init,
            signal: withTimeout(init?.signal, 25_000),
            headers,
            credentials: "include",
        });
    }
    catch {
        throw new Error(`Cannot reach the Go backend at ${base() || "the dev proxy"}. Start it with npm.cmd run dev from the frontend folder.`);
    }
    if (!r.ok) {
        const t = await r.text();
        const err = new Error(formatApiErrorMessage(t || r.statusText, r.status));
        err.status = r.status;
        throw err;
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
    const url = `${base()}/api/session/${encodeURIComponent(problemId)}`;
    const r = await fetch(url, { signal: withTimeout(undefined, 25_000), credentials: "include" });
    if (r.status === 404)
        return null;
    if (!r.ok) {
        throw new Error(`Failed to load session: ${r.status} ${r.statusText}`);
    }
    return r.json();
}

function normalizeAuthBody(body) {
    return {
        ...body,
        username: typeof body?.username === "string" ? body.username.trim().toLowerCase() : body?.username,
        full_name: typeof body?.full_name === "string" ? body.full_name.trim() : body?.full_name,
    };
}

export async function signup(body) {
    return register(body);
}
export async function register(body) {
    const normalized = normalizeAuthBody(body);
    try {
        return await j("/api/auth/register", { method: "POST", body: JSON.stringify(normalized) });
    }
    catch (err) {
        if (err?.status !== 404) {
            throw err;
        }
        return j("/api/auth/signup", { method: "POST", body: JSON.stringify(normalized) });
    }
}
export async function verifyToken(body) {
    return j("/api/auth/verify", { method: "POST", body: JSON.stringify(body) });
}
export async function verifyEmail(body) {
    return j("/api/auth/verify-email", { method: "POST", body: JSON.stringify(normalizeAuthBody(body)) });
}
export async function resendOtp(body) {
    return j("/api/auth/resend-otp", { method: "POST", body: JSON.stringify(normalizeAuthBody(body)) });
}
export async function forgotPassword(body) {
    return j("/api/auth/reset-password", { method: "POST", body: JSON.stringify(normalizeAuthBody(body)) });
}
export async function resetPassword(body) {
    return j("/api/auth/confirm-reset-password", { method: "POST", body: JSON.stringify(body) });
}
export async function login(body) {
    const response = await j("/api/auth/login", { method: "POST", body: JSON.stringify(normalizeAuthBody(body)) });
    if (response?.token) {
        setAuthToken(response.token);
    }
    return response;
}
export async function logout() {
    setAuthToken("");
    try {
        return await j("/api/auth/logout", { method: "POST" });
    }
    catch {
        return { ok: true };
    }
}
export async function changePassword(body) {
    return j("/api/auth/change-password", { method: "PUT", body: JSON.stringify(body) });
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
    const url = `${base()}/api/me/session/${encodeURIComponent(problemId)}`;
    const r = await fetch(url, { signal: withTimeout(undefined, 25_000), credentials: "include" });
    if (r.status === 404 || r.status === 401)
        return null;
    if (!r.ok)
        throw new Error(`Failed to load session: ${r.status} ${r.statusText}`);
    return r.json();
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
