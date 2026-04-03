"use client";

import Editor, { loader, type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useState } from "react";
import type * as Monaco from "monaco-editor";

// Pin to the installed monaco-editor version (npm ls monaco-editor).
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs",
  },
});

const THEME_ID = "pictor-dark";

function definePictorTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme(THEME_ID, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0d0d12",
      "editor.foreground": "#e4e4e7",
      "editorGutter.background": "#08080c",
      "editorLineNumber.foreground": "#52525b",
      "editorLineNumber.activeForeground": "#a1a1aa",
      "editorCursor.foreground": "#60a5fa",
      "editor.selectionBackground": "#1d4ed840",
      "editor.inactiveSelectionBackground": "#3f3f4620",
      "editor.lineHighlightBackground": "#18181b55",
      "editorLineHighlight.border": "#00000000",
      "editorBracketMatch.background": "#27272a",
      "editorBracketMatch.border": "#52525b",
      "editorWhitespace.foreground": "#3f3f4640",
      "editorIndentGuide.background": "#27272a",
      "editorIndentGuide.activeBackground": "#3f3f46",
      "minimap.background": "#0a0a0e",
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#3f3f4640",
      "scrollbarSlider.hoverBackground": "#52525b66",
      "scrollbarSlider.activeBackground": "#71717a80",
    },
  });
}

const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: false,
  minimap: {
    enabled: true,
    maxColumn: 100,
    renderCharacters: false,
    scale: 0.85,
    showSlider: "mouseover",
  },
  fontSize: 15,
  fontFamily:
    "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontLigatures: true,
  lineHeight: 22,
  letterSpacing: 0.2,
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: false,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorSmoothCaretAnimation: "on",
  cursorBlinking: "smooth",
  renderWhitespace: "selection",
  renderLineHighlight: "line",
  lineNumbers: "on",
  glyphMargin: false,
  folding: true,
  foldingStrategy: "indentation",
  showFoldingControls: "mouseover",
  bracketPairColorization: { enabled: true },
  guides: {
    bracketPairs: true,
    indentation: true,
    highlightActiveIndentation: true,
  },
  stickyScroll: { enabled: true },
  padding: { top: 16, bottom: 20 },
  automaticLayout: true,
  wordWrap: "off",
  wrappingIndent: "same",
  scrollBeyondLastColumn: 4,
  occurrencesHighlight: "singleFile",
  selectionHighlight: true,
  matchBrackets: "always",
  multiCursorModifier: "ctrlCmd",
  quickSuggestions: {
    other: true,
    comments: false,
    strings: true,
  },
  suggestOnTriggerCharacters: true,
  acceptSuggestionOnEnter: "on",
  tabCompletion: "on",
  snippetSuggestions: "top",
  unicodeHighlight: {
    ambiguousCharacters: true,
    invisibleCharacters: true,
  },
  accessibilitySupport: "auto",
  mouseWheelZoom: true,
  fixedOverflowWidgets: true,
};

export function PythonEditor({
  value,
  onChange,
  disabled,
  onRun,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Ctrl/Cmd+Enter runs when provided */
  onRun?: () => void;
}) {
  const [line, setLine] = useState(1);
  const [column, setColumn] = useState(1);
  const [lineCount, setLineCount] = useState(1);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(
      typeof navigator !== "undefined" &&
        /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent),
    );
  }, []);

  const beforeMount: BeforeMount = useCallback((monaco) => {
    definePictorTheme(monaco);
  }, []);

  const onMount: OnMount = useCallback(
    (editor, monaco) => {
      monaco.editor.setTheme(THEME_ID);

      const syncPosition = () => {
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (pos) {
          setLine(pos.lineNumber);
          setColumn(pos.column);
        }
        if (model) {
          setLineCount(model.getLineCount());
        }
      };

      syncPosition();
      editor.onDidChangeCursorPosition(syncPosition);
      editor.onDidChangeModelContent(syncPosition);

      if (onRun) {
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
          onRun();
        });
      }
    },
    [onRun],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-[#0d0d12]"
      role="region"
      aria-label="Python code editor"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme={THEME_ID}
          value={value}
          onChange={(v) => onChange(v ?? "")}
          beforeMount={beforeMount}
          onMount={onMount}
          options={{
            ...editorOptions,
            readOnly: !!disabled,
          }}
        />
      </div>
      <div
        className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800/80 bg-[#08080c] px-3 py-1.5 font-mono text-2xs text-zinc-500"
        aria-hidden="true"
      >
        <span className="tabular-nums">
          Ln {line}, Col {column}
          <span className="mx-2 text-zinc-700">·</span>
          {lineCount} {lineCount === 1 ? "line" : "lines"}
        </span>
        <span className="hidden sm:inline text-zinc-600">
          Spaces: 4
          {onRun ? (
            <>
              <span className="mx-2 text-zinc-700">·</span>
              <kbd className="rounded border border-zinc-700/80 bg-zinc-900/80 px-1 py-0.5 font-sans text-[0.6rem] text-zinc-400">
                {isMac ? "⌘" : "Ctrl"}
              </kbd>
              <span className="text-zinc-600">+</span>
              <kbd className="rounded border border-zinc-700/80 bg-zinc-900/80 px-1 py-0.5 font-sans text-[0.6rem] text-zinc-400">
                Enter
              </kbd>
              <span className="ml-1 text-zinc-600">run</span>
            </>
          ) : null}
        </span>
        <span className="text-zinc-600">Python</span>
      </div>
    </div>
  );
}
