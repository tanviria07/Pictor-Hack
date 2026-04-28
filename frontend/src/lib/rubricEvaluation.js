const SCORE_CATEGORIES = [
    "technical accuracy",
    "clarity",
    "structure",
    "tradeoff awareness",
    "customer communication",
];

function normalize(text) {
    return String(text || "").toLowerCase();
}

function hasAny(text, words) {
    return words.some((word) => text.includes(word));
}

function scoreCategory(category, answer, problemType) {
    const text = normalize(answer);
    const wordCount = answer.trim().split(/\s+/).filter(Boolean).length;
    switch (category) {
        case "technical accuracy":
            return Math.min(5, Math.max(1, Math.floor(wordCount / 35) + (hasAny(text, ["azure", "api", "database", "storage", "logs", "metrics", "security", "scal"]) ? 2 : 0)));
        case "clarity":
            return Math.min(5, Math.max(1, Math.floor(wordCount / 45) + (/[.!?]/.test(answer) ? 2 : 0)));
        case "structure":
            return Math.min(5, Math.max(1, (answer.includes("\n") ? 2 : 0) + (hasAny(text, ["first", "then", "because", "for example", "i would"]) ? 2 : 1)));
        case "tradeoff awareness":
            return Math.min(5, Math.max(1, hasAny(text, ["tradeoff", "cost", "scale", "scaling", "latency", "risk", "however", "but"]) ? 4 : problemType === "architecture" ? 2 : 1));
        case "customer communication":
            return Math.min(5, Math.max(1, hasAny(text, ["user", "customer", "team", "simple", "recommend", "i would", "you"]) ? 4 : 2));
        default:
            return 1;
    }
}

function sentence(text) {
    return text.endsWith(".") ? text : `${text}.`;
}

export function evaluateRubricAnswer(detail, answer) {
    const trimmed = answer.trim();
    const problemType = (detail?.problem_type || "scenario").toLowerCase();
    const rubric = detail?.rubric || {};
    const categories = rubric.categories?.length ? rubric.categories : SCORE_CATEGORIES;
    const scores = Object.fromEntries(categories.map((category) => [
        category,
        trimmed ? scoreCategory(category, trimmed, problemType) : 1,
    ]));
    const lower = normalize(trimmed);
    const expected = rubric.strong_answer_includes || [];
    const covered = expected.filter((item) => {
        const words = normalize(item).split(/[^a-z0-9]+/).filter((word) => word.length > 4);
        return words.some((word) => lower.includes(word));
    });
    const missing = expected.filter((item) => !covered.includes(item));
    const avg = categories.reduce((sum, category) => sum + (scores[category] || 1), 0) / categories.length;
    const strengths = [];
    if (trimmed) strengths.push("You provided a response that can be evaluated against the rubric.");
    if (covered.length) strengths.push(`You touched on ${covered.slice(0, 2).join(" and ")}.`);
    if (scores.structure >= 4) strengths.push("Your answer has a usable structure for an interview response.");
    if (strengths.length === 0) strengths.push("Start by writing a short answer in your own words.");
    const missingPoints = missing.length
        ? missing.slice(0, 4)
        : ["Add a concrete example, an explicit tradeoff, and a clear recommendation."];
    const nextPracticeSuggestion = avg >= 4
        ? "Practice giving the same answer in 60 seconds with one concrete customer example."
        : "Revise once by adding a recommendation, one tradeoff, and one monitoring or security point.";
    return {
        status: avg >= 4 ? "strong" : avg >= 2.8 ? "developing" : "needs_work",
        scores,
        strengths: strengths.map(sentence),
        missing_points: missingPoints.map(sentence),
        improved_sample_answer: detail?.sample_answer || "A strong answer should be accurate, structured, tradeoff-aware, and easy for the customer to follow.",
        next_practice_suggestion: nextPracticeSuggestion,
        note: "Rubric feedback is directional. There is not one exact answer for this item.",
    };
}
