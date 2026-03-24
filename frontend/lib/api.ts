import type { HintResponse, ProblemDetail, ProblemSummary, RunResponse } from "./types";

const base = () =>
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8080";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json() as Promise<T>;
}

export async function listProblems(): Promise<ProblemSummary[]> {
  return j("/api/problems");
}

export async function getProblem(id: string): Promise<ProblemDetail> {
  return j(`/api/problems/${encodeURIComponent(id)}`);
}

export async function runCode(body: {
  problem_id: string;
  language: "python";
  code: string;
}): Promise<RunResponse> {
  return j("/api/run", { method: "POST", body: JSON.stringify(body) });
}

export async function getHint(body: {
  problem_id: string;
  code: string;
  evaluation: RunResponse["evaluation"];
  hint_level_requested?: number;
}): Promise<HintResponse> {
  return j("/api/hint", { method: "POST", body: JSON.stringify(body) });
}

export async function saveSession(body: {
  problem_id: string;
  code: string;
  hint_history: string[];
}): Promise<{ ok: boolean }> {
  return j("/api/session/save", { method: "POST", body: JSON.stringify(body) });
}

export async function loadSession(problemId: string) {
  const r = await fetch(
    `${base()}/api/session/${encodeURIComponent(problemId)}`,
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    problem_id: string;
    code: string;
    hint_history: string[];
    updated_at: string;
  }>;
}
