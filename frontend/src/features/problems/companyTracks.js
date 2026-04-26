export const COMPANY_TRACKS = [
  {
    name: "Google",
    description: "Algorithms, graphs, strings, and systems-thinking practice.",
  },
  {
    name: "Microsoft",
    description: "Arrays, trees, linked lists, and practical coding fundamentals.",
  },
  {
    name: "Amazon",
    description: "High-signal data structure and implementation practice.",
  },
  {
    name: "OpenAI",
    description: "Reasoning-heavy strings, graphs, tries, and streaming patterns.",
  },
];

export function hasCompanyTag(problem, companyName) {
  if (!companyName) return true;
  return (problem.company_tags || []).includes(companyName);
}
