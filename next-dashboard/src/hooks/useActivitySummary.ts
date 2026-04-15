"use client";

import { useQuery } from "@tanstack/react-query";

import type { ActivitySummary } from "@/lib/types";

function getApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_ACTIVITY_API_URL ?? "http://127.0.0.1:8000"
  ).replace(/\/$/, "");
}

/**
 * Loads heatmap + streak stats from GET /activity/{user_id}/summary.
 */
export function useActivitySummary(userId: string) {
  return useQuery({
    queryKey: ["activity", "summary", userId],
    queryFn: async (): Promise<ActivitySummary> => {
      const base = getApiBase();
      const res = await fetch(
        `${base}/activity/${encodeURIComponent(userId)}/summary`,
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      return res.json();
    },
    enabled: userId.length > 0,
  });
}
