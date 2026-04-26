import { useCallback, useMemo, useState } from "react";
/**
 * Split a hint string into alternating plain-text and inline-code segments.
 * DeepSeek- and rule-based hints consistently quote code in single backticks
 * (e.g. "Define the function with `def answer():`"), so anything between
 * matching backticks becomes an insertable snippet.
 */
function tokenizeHint(text) {
    const out = [];
    if (!text)
        return out;
    const parts = text.split(/`([^`]+)`/g);
    parts.forEach((part, i) => {
        if (!part)
            return;
        out.push({ kind: i % 2 === 1 ? "code" : "text", value: part });
    });
    return out;
}
/**
 * Renders a hint bubble with two affordances:
 *  - Any inline `code` span is a clickable chip that inserts that snippet
 *    into the editor at the current cursor position.
 *  - A "Copy" button in the top-right copies the full hint text.
 */
export function HintContent({ text, onInsert, className = "stepwise-hint", testId, }) {
    const [copied, setCopied] = useState(false);
    const tokens = useMemo(() => tokenizeHint(text), [text]);
    const onCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        }
        catch {
            /* clipboard denied; silent no-op */
        }
    }, [text]);
    return (<div className={className} data-testid={testId}>
      <div className="stepwise-hint-body">
        {tokens.length === 0 ? (<span>{text}</span>) : (tokens.map((tok, i) => tok.kind === "code" && onInsert ? (<button key={i} type="button" className="stepwise-hint-chip" title="Click to insert at cursor" onClick={() => onInsert(tok.value)}>
                {tok.value}
              </button>) : tok.kind === "code" ? (<code key={i} className="stepwise-hint-code">
                {tok.value}
              </code>) : (<span key={i}>{tok.value}</span>)))}
      </div>
      <button type="button" className="stepwise-hint-copy" onClick={onCopy} aria-label="Copy hint" title="Copy hint to clipboard">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>);
}
