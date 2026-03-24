import type { PracticeProgress, RunResponse } from "./types";

const STORAGE_KEY = "josemorinho.practice.v1";

const rank: Record<PracticeProgress, number> = {
  not_started: 0,
  in_progress: 1,
  solved: 2,
};

export function loadLocalProgress(): Record<string, PracticeProgress> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, PracticeProgress> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === "not_started" || v === "in_progress" || v === "solved") {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function setLocalProgress(id: string, status: PracticeProgress) {
  if (typeof window === "undefined") return;
  const m = loadLocalProgress();
  m[id] = status;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
}

export function mergeProgress(
  local: PracticeProgress,
  remote?: PracticeProgress | null,
): PracticeProgress {
  if (!remote) return local;
  return rank[local] >= rank[remote] ? local : remote;
}

export function deriveProgress(
  run: RunResponse | null,
  code: string,
  starter: string,
  hasHints: boolean,
): PracticeProgress {
  if (run?.status === "correct") return "solved";
  if (run || hasHints) return "in_progress";
  if (code.trim() !== starter.trim()) return "in_progress";
  return "not_started";
}
