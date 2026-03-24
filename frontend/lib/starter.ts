import type { ProblemDetail } from "./types";

/** Signature-only scaffold — never a full solution. */
export function buildStarter(p: ProblemDetail): string {
  const params = p.parameters.map((x) => x.name).join(", ");
  return `def ${p.function_name}(${params}):\n    pass\n`;
}
