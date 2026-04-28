const MAX_CODE_CHARS = 1600;
const MAX_DESC_CHARS = 900;
const MAX_HINTS = 4;

function truncate(text, max) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... (truncated)`;
}

function summarizeEvaluation(evaluation) {
  if (!evaluation) return "No runner evaluation yet.";
  const visible = `${evaluation.passed_visible_tests}/${evaluation.total_visible_tests}`;
  const hidden = `${evaluation.passed_hidden_tests}/${evaluation.total_hidden_tests}`;
  return [
    `Runner status: ${evaluation.status}`,
    `Syntax OK: ${evaluation.syntax_ok}`,
    `Function found: ${evaluation.function_found}`,
    `Signature OK: ${evaluation.signature_ok}`,
    `Visible tests: ${visible}`,
    `Hidden tests: ${hidden}`,
    evaluation.error_type ? `Error type: ${evaluation.error_type}` : "",
    evaluation.error_message
      ? `Error message: ${evaluation.error_message}`
      : "",
    evaluation.failing_case_summary
      ? `Failing case summary: ${evaluation.failing_case_summary}`
      : "",
    evaluation.likely_stage ? `Likely stage: ${evaluation.likely_stage}` : "",
    evaluation.feedback_targets?.length
      ? `Feedback targets: ${evaluation.feedback_targets.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeRubricFeedback(feedback) {
  if (!feedback) return "No rubric feedback yet.";
  return [
    `Rubric status: ${feedback.status}`,
    feedback.scores
      ? `Scores: ${Object.entries(feedback.scores)
          .map(([k, v]) => `${k} ${v}/5`)
          .join(", ")}`
      : "",
    feedback.strengths?.length ? `Strengths: ${feedback.strengths.join(" ")}` : "",
    feedback.missing_points?.length
      ? `Missing points: ${feedback.missing_points.join(" ")}`
      : "",
    feedback.next_practice_suggestion
      ? `Next practice: ${feedback.next_practice_suggestion}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function summarizeStepwise(stepwise) {
  if (!stepwise) return "";
  return [
    `Stepwise validation: ${stepwise.correct_count}/${stepwise.total}`,
    `Full solution: ${stepwise.is_full_solution}`,
    stepwise.message ? `Message: ${stepwise.message}` : "",
    stepwise.next_hint ? `Next hint: ${stepwise.next_hint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCoachContext(
  problem,
  code,
  hints,
  evaluation,
  stepwise,
  rubricFeedback,
  role = "",
) {
  const problemId = problem?.id || "Unknown";
  const title = problem?.title || "Unknown";
  const difficulty = problem?.difficulty || "Unknown";
  const description = truncate(
    (problem?.description || "").trim(),
    MAX_DESC_CHARS,
  );
  const codeBlock = truncate((code || "").trim() || "(empty)", MAX_CODE_CHARS);
  const isNonCoding = problem && (problem.problem_type || "coding") !== "coding";

  const recentHints = hints.slice(-MAX_HINTS);
  const hintsText =
    recentHints.length === 0
      ? "None"
      : recentHints.map((hint, i) => `${i + 1}. ${hint}`).join("\n");

  return [
    `Problem ID: ${problemId}`,
    `Problem: ${title} (${difficulty})`,
    role ? `Role Context: ${role.replace(/_/g, " ").toUpperCase()}` : "",
    description ? `Summary:\n${description}` : "",
    isNonCoding
      ? `User's current answer:\n${codeBlock}`
      : `User's current code:\n\`\`\`python\n${codeBlock}\n\`\`\``,
    isNonCoding && problem?.rubric
      ? `Rubric:\nCategories: ${(problem.rubric.categories || []).join(", ")}\nStrong answer includes: ${(problem.rubric.strong_answer_includes || []).join("; ")}`
      : "",
    isNonCoding
      ? `Latest rubric feedback:\n${summarizeRubricFeedback(rubricFeedback)}`
      : `Latest Python runner evaluation:\n${summarizeEvaluation(evaluation)}`,
    summarizeStepwise(stepwise)
      ? `Latest stepwise validation:\n${summarizeStepwise(stepwise)}`
      : "",
    `Recent hints given:\n${hintsText}`,
    isNonCoding
      ? "Correctness rule: do not pretend there is one exact answer. Use the rubric and latest feedback as the source of evaluation."
      : "Correctness rule: do not decide whether the code is correct. Only reference the Python runner or stepwise validation result above as the source of correctness.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
