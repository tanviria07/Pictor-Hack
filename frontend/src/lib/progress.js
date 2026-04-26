const STORAGE_KEY = "pictorhack.practice.v1";
const rank = {
    not_started: 0,
    in_progress: 1,
    solved: 2,
};
export function loadLocalProgress() {
    if (typeof window === "undefined")
        return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const o = JSON.parse(raw);
        const out = {};
        for (const [k, v] of Object.entries(o)) {
            if (v === "not_started" || v === "in_progress" || v === "solved") {
                out[k] = v;
            }
        }
        return out;
    }
    catch {
        return {};
    }
}
export function setLocalProgress(id, status) {
    if (typeof window === "undefined")
        return;
    const m = loadLocalProgress();
    m[id] = status;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}
export function mergeProgress(local, remote) {
    if (!remote)
        return local;
    return rank[local] >= rank[remote] ? local : remote;
}
export function deriveProgress(run, code, starter, hasHints) {
    if (run?.status === "correct")
        return "solved";
    if (run || hasHints)
        return "in_progress";
    if (code.trim() !== starter.trim())
        return "in_progress";
    return "not_started";
}
