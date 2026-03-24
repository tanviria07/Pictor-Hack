function cls(d: string) {
  const x = d.toLowerCase();
  if (x === "easy")
    return "border-emerald-500/30 bg-emerald-950/20 text-emerald-400/90";
  if (x === "medium")
    return "border-amber-500/25 bg-amber-950/15 text-amber-300/90";
  if (x === "hard") return "border-rose-500/30 bg-rose-950/20 text-rose-400/90";
  return "border-zinc-600/40 bg-zinc-900/40 text-zinc-400";
}

const letter: Record<string, string> = {
  easy: "E",
  medium: "M",
  hard: "H",
};

export function DifficultyBadge({
  difficulty,
  compact,
}: {
  difficulty: string;
  compact?: boolean;
}) {
  const x = difficulty.toLowerCase();
  if (compact) {
    const L = letter[x] ?? difficulty.slice(0, 1).toUpperCase();
    return (
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] font-semibold tabular-nums leading-none ${cls(difficulty)}`}
        title={difficulty}
      >
        {L}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide transition-colors ${cls(difficulty)}`}
    >
      {difficulty}
    </span>
  );
}
