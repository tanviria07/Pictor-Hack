import { formatApiErrorMessage } from "./errors";
import type {
  CategorySummary,
  HintResponse,
  ProblemDetail,
  ProblemSummary,
  RunJobPollResponse,
  RunResponse,
  SessionPayload,
} from "./types";

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([t, signal]) : t;
}

const base = () => {
  const env = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "");
  if (env) return env;
  return "";
};

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, {
    ...init,
    signal: withTimeout(init?.signal, 25_000),
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(formatApiErrorMessage(t || r.statusText, r.status));
  }
  return r.json() as Promise<T>;
}

export async function listCategories(): Promise<CategorySummary[]> {
  return j("/api/categories");
}

export async function listProblems(filters?: {
  category?: string;
  difficulty?: string;
}): Promise<ProblemSummary[]> {
  const q = new URLSearchParams();
  if (filters?.category) q.set("category", filters.category);
  if (filters?.difficulty) q.set("difficulty", filters.difficulty);
  const qs = q.toString();
  return j(`/api/problems${qs ? `?${qs}` : ""}`);
}

export async function getProblem(id: string): Promise<ProblemDetail> {
  return j(`/api/problems/${encodeURIComponent(id)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Async path: Redis queue + worker (Docker / scaled deploy). */
async function runCodeViaQueue(body: {
  problem_id: string;
  language: "python";
  code: string;
}): Promise<RunResponse> {
  const url = `${base()}/api/run/jobs`;
  const submit = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: withTimeout(undefined, 15_000),
  });
  if (submit.status === 503 || submit.status === 404) {
    throw new Error("__ASYNC_RUN_UNAVAILABLE__");
  }
  if (!submit.ok) {
    const t = await submit.text();
    throw new Error(formatApiErrorMessage(t || submit.statusText, submit.status));
  }
  const created = (await submit.json()) as { job_id: string; status: string };
  const jobId = created.job_id;
  if (!jobId) {
    throw new Error("Invalid async run response: missing job_id");
  }

  const maxPolls = 360;
  for (let i = 0; i < maxPolls; i++) {
    await sleep(500);
    const pollUrl = `${base()}/api/run/jobs/${encodeURIComponent(jobId)}`;
    const pr = await fetch(pollUrl, {
      signal: withTimeout(undefined, 15_000),
    });
    if (!pr.ok) {
      const t = await pr.text();
      throw new Error(formatApiErrorMessage(t || pr.statusText, pr.status));
    }
    const data = (await pr.json()) as RunJobPollResponse;
    if (data.status === "failed") {
      throw new Error(data.error || "Run failed");
    }
    if (data.status === "completed" && data.result) {
      return data.result;
    }
  }
  throw new Error("Run timed out waiting for the worker");
}

export async function runCode(body: {
  problem_id: string;
  language: "python";
  code: string;
}): Promise<RunResponse> {
  const useAsync = process.env.NEXT_PUBLIC_ASYNC_RUN === "1";
  if (useAsync) {
    try {
      return await runCodeViaQueue(body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "__ASYNC_RUN_UNAVAILABLE__") {
        return j("/api/run", { method: "POST", body: JSON.stringify(body) });
      }
      throw e;
    }
  }
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

export async function saveSession(body: SessionPayload): Promise<{ ok: boolean }> {
  return j("/api/session/save", { method: "POST", body: JSON.stringify(body) });
}

/** Session load is optional; failures must not block the editor. */
export async function loadSession(problemId: string) {
  try {
    const url = `${base()}/api/session/${encodeURIComponent(problemId)}`;
    const r = await fetch(url, { signal: withTimeout(undefined, 25_000) });
    if (r.status === 404) return null;
    if (!r.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[api] session GET failed", r.status, problemId);
      }
      return null;
    }
    return r.json() as Promise<{
      problem_id: string;
      code: string;
      hint_history: string[];
      practice_status?: import("./types").PracticeProgress;
      updated_at: string;
    }>;
  } catch {
    return null;
  }
}
