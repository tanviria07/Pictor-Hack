export function InterviewTracePanel({ trace }) {
  if (!trace) return null;

  const getRiskClass = (risk) => {
    const r = (risk || "").toLowerCase();
    if (r.includes("high")) return "trace-item-value--risk-high";
    if (r.includes("medium")) return "trace-item-value--risk-medium";
    if (r.includes("low")) return "trace-item-value--risk-low";
    return "";
  };

  return (
    <div className="trace-panel">
      <div className="trace-head">
        <span className="trace-title">Interview Trace</span>
        <span className={`trace-risk ${getRiskClass(trace.interview_risk)}`}>
          Risk: {trace.interview_risk}
        </span>
      </div>
      <div className="trace-body">
        <div className="trace-grid">
          <TraceField label="Attempt Status" value={trace.attempt_status} />
          <TraceField label="Likely Bug Pattern" value={trace.likely_bug_pattern} />
          <TraceField label="Failed Edge Cases" value={trace.failed_edge_case_category || "None detected"} />
          <TraceField label="Complexity Note" value={trace.complexity_note || "N/A"} />
          <TraceField label="Next Recommended Action" value={trace.next_recommended_action} fullWidth />
          <div className="trace-field trace-field--full">
            <span className="trace-label">Follow-up Question</span>
            <blockquote className="trace-quote">{trace.follow_up_question}</blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceField({ label, value, fullWidth }) {
  return (
    <div className={`trace-field ${fullWidth ? "trace-field--full" : ""}`}>
      <span className="trace-label">{label}</span>
      <span className="trace-value">{value}</span>
    </div>
  );
}
