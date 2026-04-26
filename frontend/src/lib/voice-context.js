const MAX_CODE_CHARS = 1600;
const MAX_DESC_CHARS = 900;
const MAX_HINTS = 4;
function truncate(text, max) {
    if (!text)
        return "";
    if (text.length <= max)
        return text;
    return `${text.slice(0, max)}\n... (truncated)`;
}
export function buildCoachContext(problem, code, hints) {
    const title = problem?.title || "Unknown";
    const difficulty = problem?.difficulty || "Unknown";
    const description = truncate((problem?.description || "").trim(), MAX_DESC_CHARS);
    const codeBlock = truncate((code || "").trim() || "(empty)", MAX_CODE_CHARS);
    const recentHints = hints.slice(-MAX_HINTS);
    const hintsText = recentHints.length === 0
        ? "None"
        : recentHints.map((hint, i) => `${i + 1}. ${hint}`).join("\n");
    return [
        `Problem: ${title} (${difficulty})`,
        description ? `Summary:\n${description}` : "",
        `User's current code:\n\`\`\`python\n${codeBlock}\n\`\`\``,
        `Recent hints given:\n${hintsText}`,
    ]
        .filter(Boolean)
        .join("\n\n");
}
