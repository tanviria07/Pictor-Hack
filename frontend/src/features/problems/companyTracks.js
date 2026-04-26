export const COMPANY_TRACKS = [
  {
    id: "google",
    name: "Google",
    description: "Graph, tree, DP, and optimization-heavy reasoning.",
  },
  {
    id: "microsoft",
    name: "Microsoft",
    description: "Clean implementation, readability, arrays, strings, trees.",
  },
  {
    id: "amazon",
    name: "Amazon",
    description: "Practical DSA, heaps, intervals, sliding window, fast tradeoffs.",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Python reasoning, robustness, correctness, evaluation mindset.",
  },
];

export const COMPANY_TRACK_DISCLAIMER =
  "Unofficial practice sets curated around common interview patterns.";

const LEGACY_NAME_TO_ID = new Map(
  COMPANY_TRACKS.map((track) => [track.name.toLowerCase(), track.id]),
);

const PRIORITY_RANK = {
  core: 0,
  high: 1,
  medium: 2,
  bonus: 3,
};

export function companyById(companyId) {
  return COMPANY_TRACKS.find((track) => track.id === companyId) || null;
}

export function companyTagFor(problem, companyId) {
  if (!companyId) return null;
  const richTag = (problem.company_track_tags || []).find(
    (tag) => tag.company_id === companyId,
  );
  if (richTag) return richTag;

  const legacyId = LEGACY_NAME_TO_ID.get(String(companyId).toLowerCase());
  const legacyNames = new Set(
    (problem.company_tags || []).map((name) => String(name).toLowerCase()),
  );
  const company = companyById(companyId);
  if (company && legacyNames.has(company.name.toLowerCase())) {
    return {
      company_id: companyId,
      priority: "medium",
      reason: company.description,
      recommended_order: Number.MAX_SAFE_INTEGER,
    };
  }
  if (legacyId && legacyNames.has(String(companyId).toLowerCase())) {
    return {
      company_id: legacyId,
      priority: "medium",
      reason: companyById(legacyId)?.description || "",
      recommended_order: Number.MAX_SAFE_INTEGER,
    };
  }
  return null;
}

export function hasCompanyTag(problem, companyId) {
  if (!companyId) return true;
  return Boolean(companyTagFor(problem, companyId));
}

export function compareByCompanyOrder(companyId) {
  return (a, b) => {
    const tagA = companyTagFor(a, companyId);
    const tagB = companyTagFor(b, companyId);
    const orderA = tagA?.recommended_order ?? Number.MAX_SAFE_INTEGER;
    const orderB = tagB?.recommended_order ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    return a.title.localeCompare(b.title);
  };
}

export function priorityLabel(priority) {
  if (priority === "medium") return "MED";
  return String(priority || "bonus").toUpperCase();
}

export function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.bonus;
}
