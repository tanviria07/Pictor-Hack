"use client";

import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { useActivitySummary } from "@/hooks/useActivitySummary";
import { useState } from "react";

const DEFAULT_USER = "demo-user";

export default function DashboardPage() {
  const [userId, setUserId] = useState(DEFAULT_USER);
  const { data, isLoading, isError, error } = useActivitySummary(userId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-100">
          Activity
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          GitHub-style contributions · last 365 days
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-500" htmlFor="user-id">
            User ID
          </label>
          <input
            id="user-id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-1.5 text-sm text-gray-100 outline-none ring-0 focus:border-blue-500"
            placeholder="user id"
          />
        </div>
      </header>

      {isError && (
        <div
          className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error instanceof Error ? error.message : "Failed to load activity"}
        </div>
      )}

      <ActivityHeatmap
        days={data?.days ?? []}
        totalThisYear={data?.total_this_year}
        currentStreak={data?.current_streak}
        longestStreak={data?.longest_streak}
        isLoading={isLoading}
      />

      <p className="mt-8 text-xs text-gray-600">
        Start the FastAPI service on port 8000 and set{" "}
        <code className="rounded bg-gray-900 px-1 py-0.5 text-gray-400">
          NEXT_PUBLIC_ACTIVITY_API_URL
        </code>{" "}
        if needed. Record solves with{" "}
        <code className="rounded bg-gray-900 px-1 py-0.5 text-gray-400">
          POST /activity/&#123;user_id&#125;/solve
        </code>
        .
      </p>
    </main>
  );
}
