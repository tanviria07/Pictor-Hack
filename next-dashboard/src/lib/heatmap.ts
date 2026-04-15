import type { ActivityDay, HeatmapCell } from "./types";

const MS_PER_DAY = 86_400_000;

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Maps API day list to a Map keyed by YYYY-MM-DD.
 */
export function activityListToMap(days: ActivityDay[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of days) {
    m.set(row.date, row.count);
  }
  return m;
}

/**
 * GitHub-style grid: columns = weeks (Sun start), rows = weekday 0–6.
 * Includes trailing days in the current week after today as future (muted).
 */
export function buildGithubGrid(
  todayInput: Date,
  activity: Map<string, number>,
): { cells: HeatmapCell[]; weekCount: number; gridStart: Date } {
  const today = stripTime(todayInput);
  const end = new Date(today);

  const start = new Date(end);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  const gridEnd = new Date(end);
  gridEnd.setDate(gridEnd.getDate() + (6 - end.getDay()));

  const cells: HeatmapCell[] = [];
  const cursor = new Date(start);

  while (cursor <= gridEnd) {
    const key = formatDateKey(cursor);
    const isFuture = cursor > end;
    const count = isFuture ? 0 : activity.get(key) ?? 0;
    const weekIndex = Math.floor(
      (cursor.getTime() - start.getTime()) / (7 * MS_PER_DAY),
    );
    cells.push({
      date: isFuture ? null : key,
      count,
      weekIndex,
      dayOfWeek: cursor.getDay(),
      isFuture,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  let weekCount = 0;
  for (const c of cells) {
    weekCount = Math.max(weekCount, c.weekIndex + 1);
  }

  return { cells, weekCount, gridStart: start };
}

export function groupCellsIntoWeeks(
  cells: HeatmapCell[],
  weekCount: number,
): (HeatmapCell | null)[][] {
  const weeks: (HeatmapCell | null)[][] = Array.from({ length: weekCount }, () =>
    Array.from({ length: 7 }, () => null),
  );
  for (const c of cells) {
    if (c.weekIndex >= 0 && c.weekIndex < weekCount) {
      weeks[c.weekIndex][c.dayOfWeek] = c;
    }
  }
  return weeks;
}

/** One label per week column (first column of each month shows the month name). */
export function monthLabelsPerWeek(gridStart: Date, weekCount: number): (string | null)[] {
  const labels: (string | null)[] = [];
  let lastMonth = -1;
  for (let wi = 0; wi < weekCount; wi++) {
    const sunday = new Date(gridStart);
    sunday.setDate(sunday.getDate() + wi * 7);
    const m = sunday.getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      labels.push(MONTHS_SHORT[m]);
    } else {
      labels.push(null);
    }
  }
  return labels;
}

/** Tailwind classes per spec (dark GitHub-style shell). */
export function intensityClass(count: number, isFuture: boolean): string {
  if (isFuture) {
    return "bg-gray-800/40";
  }
  if (count === 0) {
    return "bg-gray-800";
  }
  if (count <= 2) {
    return "bg-green-200";
  }
  if (count <= 5) {
    return "bg-green-400";
  }
  return "bg-green-600";
}
