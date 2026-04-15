"use client";

import { useMemo, useState } from "react";

import type { ActivityDay } from "@/lib/types";
import {
  activityListToMap,
  buildGithubGrid,
  groupCellsIntoWeeks,
  intensityClass,
  monthLabelsPerWeek,
} from "@/lib/heatmap";

export type ActivityHeatmapProps = {
  /** Dense list from GET /activity/{user_id} (one row per day, count may be 0). */
  days: ActivityDay[];
  /** Optional stats (e.g. from GET /activity/{user_id}/summary). */
  totalThisYear?: number;
  currentStreak?: number;
  longestStreak?: number;
  isLoading?: boolean;
  className?: string;
};

function tooltipText(cell: {
  date: string | null;
  count: number;
  isFuture: boolean;
}): string {
  if (cell.isFuture || !cell.date) {
    return "No activity";
  }
  const n = cell.count;
  const noun = n === 1 ? "problem" : "problems";
  return `${n} ${noun} solved on ${cell.date}`;
}

export function ActivityHeatmap({
  days,
  totalThisYear,
  currentStreak,
  longestStreak,
  isLoading,
  className = "",
}: ActivityHeatmapProps) {
  const today = useMemo(() => new Date(), []);
  const [hover, setHover] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const { weeks, monthLabels, weekCount } = useMemo(() => {
    const map = activityListToMap(days);
    const { cells, weekCount: wc, gridStart } = buildGithubGrid(today, map);
    const w = groupCellsIntoWeeks(cells, wc);
    const ml = monthLabelsPerWeek(gridStart, wc);
    return { weeks: w, monthLabels: ml, weekCount: wc };
  }, [days, today]);

  if (isLoading) {
    return (
      <div
        className={`animate-pulse rounded-xl border border-gray-800 bg-gray-950 p-4 ${className}`}
      >
        <div className="h-4 w-48 rounded bg-gray-800" />
        <div className="mt-4 h-28 rounded bg-gray-800" />
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl border border-gray-800 bg-gray-950 p-4 text-gray-100 ${className}`}
    >
      {(totalThisYear !== undefined ||
        currentStreak !== undefined ||
        longestStreak !== undefined) && (
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          {totalThisYear !== undefined && (
            <div>
              <span className="text-gray-500">This year</span>{" "}
              <span className="font-semibold tabular-nums text-gray-100">
                {totalThisYear}
              </span>{" "}
              <span className="text-gray-500">problems</span>
            </div>
          )}
          {currentStreak !== undefined && (
            <div className="flex items-center gap-1">
              <span aria-hidden>🔥</span>
              <span className="text-gray-500">Current streak</span>{" "}
              <span className="font-semibold tabular-nums text-green-400">
                {currentStreak}
              </span>
              <span className="text-gray-500">days</span>
            </div>
          )}
          {longestStreak !== undefined && (
            <div>
              <span className="text-gray-500">Longest</span>{" "}
              <span className="font-semibold tabular-nums text-gray-200">
                {longestStreak}
              </span>{" "}
              <span className="text-gray-500">days</span>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1">
          {weeks.map((column, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              <div
                className="mb-1 h-3 w-3 text-left text-[10px] leading-none text-gray-500"
                aria-hidden
              >
                {monthLabels[wi] ?? ""}
              </div>
              {column.map((cell, di) => {
                if (!cell) {
                  return (
                    <div
                      key={`e-${wi}-${di}`}
                      className="h-3 w-3 rounded-sm bg-transparent"
                    />
                  );
                }
                const cls = intensityClass(cell.count, cell.isFuture);
                const tip = tooltipText(cell);
                return (
                  <div
                    key={cell.date ?? `f-${wi}-${di}`}
                    className="relative h-3 w-3"
                    onMouseEnter={(e) => {
                      setHover({
                        text: tip,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                    onMouseMove={(e) => {
                      setHover((h) =>
                        h ? { ...h, x: e.clientX, y: e.clientY } : h,
                      );
                    }}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      title={tip}
                      className={`h-3 w-3 rounded-sm transition will-change-transform ${cls} hover:z-10 hover:scale-110 hover:brightness-125 motion-safe:duration-200 motion-safe:ease-out`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          <span className="h-3 w-3 rounded-sm bg-gray-800" />
          <span className="h-3 w-3 rounded-sm bg-green-200" />
          <span className="h-3 w-3 rounded-sm bg-green-400" />
          <span className="h-3 w-3 rounded-sm bg-green-600" />
        </div>
        <span>More</span>
        <span className="ml-2 text-gray-600">
          {weekCount} weeks · last 365 days
        </span>
      </div>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100 shadow-lg"
          style={{
            left: hover.x + 12,
            top: hover.y + 12,
          }}
        >
          {hover.text}
        </div>
      )}
    </div>
  );
}
