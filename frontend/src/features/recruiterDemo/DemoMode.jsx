import { DEMO_STEPS } from "./demoData";

export function DemoButton({ active, onToggle }) {
  return (
    <button
      type="button"
      className={`btn-demo ${active ? "btn-demo--end" : ""}`}
      onClick={onToggle}
      title={active ? "Exit guided demo" : "Start guided recruiter demo"}
    >
      {active ? "End Demo" : "Recruiter Demo"}
    </button>
  );
}

export function DemoBanner({ step, instructions, onAction, actionLabel, cloudPrompt }) {
  if (!step) return null;

  return (
    <div className="demo-banner">
      <div className="demo-banner-text">
        <strong>Demo Guide:</strong> {instructions}
      </div>
      {actionLabel && (
        <button type="button" className="btn-demo-action" onClick={onAction}>
          {actionLabel}
        </button>
      )}
      {cloudPrompt && (
        <div className="demo-cloud">
          <pre className="demo-cloud-text">{cloudPrompt}</pre>
        </div>
      )}
    </div>
  );
}
