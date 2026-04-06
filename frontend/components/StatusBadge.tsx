"use client";

import type { ProblemStatus } from "@/lib/types";

/** Labels match product copy and stay technical, not playful. */
const styles: Record<
  ProblemStatus,
  { label: string; className: string }
> = {
  syntax_error: {
    label: "Syntax Error",
    className:
      "border border-rose-800/70 bg-rose-950/50 text-rose-200/95",
  },
  runtime_error: {
    label: "Runtime Error",
    className:
      "border border-orange-800/60 bg-orange-950/40 text-orange-200/95",
  },
  internal_error: {
    label: "Platform Error",
    className:
      "border border-amber-800/55 bg-amber-950/35 text-amber-100/95",
  },
  incomplete: {
    label: "Incomplete",
    className:
      "border border-amber-800/50 bg-amber-950/35 text-amber-100/90",
  },
  partial: {
    label: "Partial",
    className:
      "border border-sky-800/45 bg-sky-950/30 text-sky-100/90",
  },
  wrong: {
    label: "Wrong",
    className:
      "border border-violet-800/45 bg-violet-950/35 text-violet-100/90",
  },
  correct: {
    label: "Correct",
    className:
      "border border-emerald-800/50 bg-emerald-950/35 text-emerald-100/90",
  },
};

export function StatusBadge({ status }: { status: ProblemStatus }) {
  const badge = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}
