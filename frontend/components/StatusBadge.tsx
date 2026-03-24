"use client";

import type { ProblemStatus } from "@/lib/types";

const styles: Record<
  ProblemStatus,
  { label: string; className: string }
> = {
  syntax_error: {
    label: "Syntax error",
    className: "bg-rose-950/80 text-rose-200 border border-rose-700/60",
  },
  runtime_error: {
    label: "Runtime error",
    className: "bg-orange-950/80 text-orange-200 border border-orange-700/60",
  },
  incomplete: {
    label: "Incomplete",
    className: "bg-amber-950/80 text-amber-200 border border-amber-700/60",
  },
  partial: {
    label: "Partial",
    className: "bg-sky-950/80 text-sky-200 border border-sky-700/60",
  },
  wrong: {
    label: "Wrong",
    className: "bg-fuchsia-950/80 text-fuchsia-200 border border-fuchsia-700/60",
  },
  correct: {
    label: "Correct",
    className: "bg-emerald-950/80 text-emerald-200 border border-emerald-700/60",
  },
};

export function StatusBadge({ status }: { status: ProblemStatus }) {
  const s = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium tracking-wide ${s.className}`}
    >
      {s.label}
    </span>
  );
}
