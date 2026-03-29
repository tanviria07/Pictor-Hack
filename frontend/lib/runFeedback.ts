import type { RunResponse } from "./types";

/** Extra coaching copy for the evaluation panel (runner returned 200 with a status). */
export function friendlyEvaluationBanner(run: RunResponse): string | null {
  switch (run.status) {
    case "syntax_error":
      return "Python could not parse your code. Check brackets, colons, indentation, and invalid tokens, then run again.";
    case "runtime_error":
      return "Your code ran but raised an error or timed out. Read the error type and message below, then adjust logic or edge cases.";
    case "incomplete":
      return "The solution skeleton or body is not complete enough to grade. Replace placeholders and implement the required behavior.";
    default:
      return null;
  }
}
