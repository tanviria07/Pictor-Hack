const styles = {
    syntax_error: {
        label: "Syntax Error",
        className: "sb-syntax",
    },
    runtime_error: {
        label: "Runtime Error",
        className: "sb-runtime",
    },
    internal_error: {
        label: "Platform Error",
        className: "sb-internal",
    },
    incomplete: {
        label: "Incomplete",
        className: "sb-incomplete",
    },
    partial: {
        label: "Partial",
        className: "sb-partial",
    },
    wrong: {
        label: "Wrong",
        className: "sb-wrong",
    },
    correct: {
        label: "Correct",
        className: "sb-correct",
    },
};
export function StatusBadge({ status }) {
    const badge = styles[status];
    return (<span className={`status-badge ${badge.className}`}>{badge.label}</span>);
}
