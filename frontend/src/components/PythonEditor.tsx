import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const INDENT = "    ";

function lineColFromPos(text: string, pos: number): { line: number; col: number } {
  const safe = Math.max(0, Math.min(pos, text.length));
  const before = text.slice(0, safe);
  const lines = before.split("\n");
  const line = lines.length;
  const col = (lines[lines.length - 1]?.length ?? 0) + 1;
  return { line, col };
}

export function PythonEditor({
  value,
  onChange,
  disabled,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onRun?: () => void;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const [line, setLine] = useState(1);
  const [column, setColumn] = useState(1);
  const lineCount = value.split("\n").length;
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      typeof navigator !== "undefined" &&
        /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent),
    );
  }, []);

  /** Use the textarea DOM value so line/col stay correct while typing (controlled updates). */
  const syncCaret = useCallback(() => {
    const el = ta.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const { line: ln, col } = lineColFromPos(el.value, pos);
    setLine(ln);
    setColumn(col);
  }, []);

  useEffect(() => {
    syncCaret();
  }, [value, syncCaret]);

  useLayoutEffect(() => {
    const el = ta.current;
    const p = pendingCaret.current;
    if (el && p != null) {
      pendingCaret.current = null;
      el.setSelectionRange(p, p);
      syncCaret();
    }
  }, [value, syncCaret]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const next = el.value.slice(0, start) + INDENT + el.value.slice(end);
      pendingCaret.current = start + INDENT.length;
      onChange(next);
      return;
    }
    if (onRun && (e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRun();
    }
  };

  return (
    <div className="pe" role="region" aria-label="Python code editor">
      <div className="pe-editor-wrap">
        <textarea
          ref={ta}
          data-testid="python-editor"
          className="pe-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onSelect={syncCaret}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onBlur={syncCaret}
          onKeyDown={onKeyDown}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
        />
      </div>
      <div className="pe-footer" aria-hidden="true">
        <span className="pe-footer-pos">
          Ln {line}, Col {column}
          <span className="pe-dot">·</span>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <span className="pe-kbd-hint">
          Tab indent · Spaces: 4
          {onRun ? (
            <>
              <span className="pe-dot">·</span>
              <kbd className="pe-kbd">{isMac ? "⌘" : "Ctrl"}</kbd>
              <span className="text-muted">+</span>
              <kbd className="pe-kbd">Enter</kbd>
              <span className="ml-xs text-muted">run</span>
            </>
          ) : null}
        </span>
        <span className="text-muted">Python</span>
      </div>
    </div>
  );
}
