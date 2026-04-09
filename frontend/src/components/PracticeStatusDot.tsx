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
  const cls =
    status === "solved"
      ? "pr-dot--solved"
      : status === "in_progress"
        ? "pr-dot--progress"
        : "pr-dot--new";
  if (minimal) {
    return (
      <span
        className={`pr-dot ${cls}`}
        title={labels[status]}
        aria-label={labels[status]}
      />
    );
  }
  return (
    <span className="pr-inline" title={labels[status]}>
      <span className={`pr-dot ${cls}`} />
      <span className="pr-label">{labels[status]}</span>
    </span>
  );
}
