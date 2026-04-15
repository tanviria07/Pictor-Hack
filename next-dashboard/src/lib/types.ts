/** API: GET /activity/{user_id} */
export type ActivityDay = {
  date: string;
  count: number;
};

/** API: GET /activity/{user_id}/summary */
export type ActivitySummary = {
  days: ActivityDay[];
  total_this_year: number;
  current_streak: number;
  longest_streak: number;
};

export type HeatmapCell = {
  date: string | null;
  count: number;
  weekIndex: number;
  dayOfWeek: number;
  isFuture: boolean;
};
