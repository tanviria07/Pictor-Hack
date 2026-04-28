import { useEffect, useRef } from "react";

export function DesignEditor({ value, onChange, disabled, onRun }) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (!disabled && onRun) {
          onRun();
        }
      }
    };
    const el = textareaRef.current;
    el?.addEventListener("keydown", handleKeyDown);
    return () => el?.removeEventListener("keydown", handleKeyDown);
  }, [disabled, onRun]);

  return (
    <div className="design-editor">
      <textarea
        ref={textareaRef}
        className="design-editor-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Enter your system design response here... Use markdown if you like. Focus on requirements, API, data model, and tradeoffs."
      />
    </div>
  );
}
