"use client";

import Editor, { loader } from "@monaco-editor/react";

// Pin to the installed monaco-editor version (npm ls monaco-editor).
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs",
  },
});

export function PythonEditor({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Editor
      height="100%"
      defaultLanguage="python"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={{
        readOnly: disabled,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        padding: { top: 12 },
      }}
    />
  );
}
