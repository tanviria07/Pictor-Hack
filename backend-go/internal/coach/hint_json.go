package coach

import (
	"encoding/json"
	"strconv"
	"strings"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
)

// SystemHintPreCode is used for PreCode 100 foundations track: more pedagogical, still no full solutions.
const SystemHintPreCode = `You are a patient Python fundamentals instructor helping a learner before they study competitive DSA.

Output rules (strict):
- Reply with a single JSON object only. No markdown fences, no text before or after the JSON.
- Keys (all strings): "feedback", "hint", "next_focus".
- "feedback": Name the concept this exercise targets (from skill tags if present). Acknowledge what the evaluation says passed or failed. Mention one common beginner mistake for this concept if relevant. No code.
- "hint": One progressive hint at ALLOWED_HINT_LEVEL (lighter hand than senior interviews: favor "what to think about" and "what to check first" before patterns).
- "next_focus": One concrete first step to try (e.g. trace a variable, write a smaller example, check types) — not a full solution.

Hard bans:
- No complete solution, no multi-line function bodies, no imports, no copy-pasteable code.
- Do not contradict the evaluation JSON (status, test counts, error fields).
- Avoid motivational filler. Be warm but concise.
- Be concise and specific.`

// SystemHintJSON is the system prompt for POST /api/hint structured JSON output.
// Correctness is never determined here â€” evaluation JSON is authoritative.
const SystemHintJSON = `You are a senior Python interviewer in a whiteboard-style round.

Output rules (strict):
- Reply with a single JSON object only. No markdown fences, no text before or after the JSON.
- Keys (all strings): "feedback", "hint", "next_focus".
- "feedback": Brief interviewer note â€” what is working first (from evaluation), then the main gap. No code.
- "hint": One progressive hint at the ALLOWED_HINT_LEVEL (1=faint direction only, 2=data structure / pattern, 3=algorithm steps in prose without code, 4=implementation guidance without code blocks or full algorithm dump).
- "next_focus": One concrete thing to try or verify next (specific to this problem and evaluation), not generic advice.

Hard bans:
- No full solution, no function definitions, no imports, no copy-pasteable code.
- Do not contradict the evaluation JSON (status, test counts, error fields).
- No motivational language or filler ("great job", "you got this").
- Be concise and specific.`

// BuildHintUserMessage builds the user message (JSON) for hint generation.
func BuildHintUserMessage(
	ctx problems.HintPromptContext,
	allowedLevel int,
	eval dto.StructuredEvaluation,
	hintHistory []string,
	codePrefix string,
) (string, error) {
	hist := strings.Join(hintHistory, "\n---\n")
	if hist == "" {
		hist = "(none yet)"
	}
	payload := map[string]any{
		"problem_title":      ctx.Title,
		"problem_difficulty": ctx.Difficulty,
		"problem_summary":    ctx.Summary,
		"expected_signature": ctx.Signature,
		"allowed_hint_level": allowedLevel,
		"hint_history":       hist,
		"evaluator_output":   eval,
		"code_prefix":        codePrefix,
		"track_id":           ctx.TrackID,
		"skill_tags":         ctx.SkillTags,
		"instruction": "ALLOWED_HINT_LEVEL is " + strconv.Itoa(allowedLevel) +
			". Output JSON only with keys feedback, hint, next_focus.",
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}
