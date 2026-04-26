function diffClass(d) {
    const x = d.toLowerCase();
    if (x === "easy")
        return "diff-easy";
    if (x === "medium")
        return "diff-medium";
    if (x === "hard")
        return "diff-hard";
    return "diff-unknown";
}
const letter = {
    easy: "E",
    medium: "M",
    hard: "H",
};
function difficultyTitle(difficulty, trackId) {
    if (trackId !== "precode100")
        return difficulty;
    const x = difficulty.toLowerCase();
    if (x === "easy")
        return "Easier — short and focused";
    if (x === "medium")
        return "Medium — a few ideas to combine";
    if (x === "hard")
        return difficulty;
    return difficulty;
}
export function DifficultyBadge({ difficulty, compact, trackId, }) {
    const x = difficulty.toLowerCase();
    const tip = difficultyTitle(difficulty, trackId);
    const c = diffClass(difficulty);
    if (compact) {
        const L = letter[x] ?? difficulty.slice(0, 1).toUpperCase();
        return (<span className={`diff-badge diff-badge--compact ${c}`} title={tip}>
        {L}
      </span>);
    }
    return (<span title={tip} className={`diff-badge diff-badge--full ${c}`}>
      {difficulty}
    </span>);
}
