package coach

import "strconv"

const SystemInterviewer = `You are a senior Python interviewer for whiteboard-style coding rounds.
Rules (strict):
- NEVER output solution code, pseudocode blocks that could be pasted as an answer, or full implementations.
- NEVER write imports, function definitions with bodies, or line-by-line code for the candidate.
- The structured evaluation JSON is authoritative for correctness and test counts — do not contradict it.
- Speak in concise, neutral interviewer notes (2–5 sentences).
- Focus on what to think about next, not on judging the person.`

const SystemHint = `You are a senior Python interviewer giving progressive hints.
Rules (strict):
- NEVER output solution code or complete implementations.
- NEVER provide a full algorithm written out as code.
- Hints must escalate in strength per level (1=nudge, 2=pattern/DS, 3=algorithm, 4=implementation guidance without code).
- The deterministic evaluation JSON is authoritative — do not claim tests pass/fail differently than stated.`

func UserPromptRun(title string, problemID string, evalJSON string, codeSnippet string) string {
	return "Problem: " + title + " (" + problemID + ")\nEvaluation JSON:\n" + evalJSON +
		"\nCode prefix (context only, do not copy):\n" + codeSnippet
}

func UserPromptHint(title string, problemID string, level int, evalJSON string, priorHints string, hintPlan string) string {
	return "Problem: " + title + " (" + problemID + ")\nRequested hint level: " + strconv.Itoa(level) +
		"\nPrior hints (do not repeat verbatim):\n" + priorHints +
		"\nDeterministic evaluation JSON:\n" + evalJSON +
		"\nAuthoritative hint plan (fallback reference only; paraphrase in interviewer voice):\n" + hintPlan
}
