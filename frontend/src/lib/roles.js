import learningPaths from "../../../shared/learning-paths.json";

export const ROLES = [
  { id: "", label: "Default (No role)" },
  { id: "swe_intern", label: "SWE Intern" },
  { id: "cloud_solutions_architect", label: "Cloud Solutions Architect Intern" },
  { id: "backend_engineer", label: "Backend Engineer Intern" },
  { id: "ai_infrastructure", label: "AI Infrastructure Intern" },
];

export function roleDescription(role) {
  switch (role) {
    case "swe_intern":
      return "Correctness, Big-O, edge cases, patterns";
    case "cloud_solutions_architect":
      return "Customer explanation, cloud tradeoffs, cost, security, monitoring";
    case "backend_engineer":
      return "APIs, databases, error handling, testing, reliability";
    case "ai_infrastructure":
      return "Evaluation, observability, data flow, failure modes, robustness";
    default:
      return "General Python interview coaching";
  }
}

export function learningPathForRole(role) {
  return learningPaths[role] || null;
}

export function isProblemRecommendedForRole(problem, role) {
  if (!role)
    return true;
  const roles = Array.isArray(problem?.recommended_for_roles)
    ? problem.recommended_for_roles
    : [];
  if (roles.length === 0)
    return true;
  return roles.includes(role);
}

export function filterProblemsByRole(problems, role) {
  return problems.filter((problem) => isProblemRecommendedForRole(problem, role));
}
