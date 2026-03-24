import type { PracticeProgress } from "@/lib/types";

const labels: Record<PracticeProgress, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  solved: "Solved",
};

export function PracticeStatusDot({
  status,
  minimal,
}: {
  status: PracticeProgress;
  minimal?: boolean;
}) {
  const color =
    status === "solved"
      ? "bg-emerald-500"
      : status === "in_progress"
        ? "bg-amber-400"
        : "bg-zinc-500/60";
  if (minimal) {
    return (
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`}
        title={labels[status]}
        aria-label={labels[status]}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={labels[status]}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
      <span className="text-2xs text-zinc-500">{labels[status]}</span>
    </span>
  );
}
