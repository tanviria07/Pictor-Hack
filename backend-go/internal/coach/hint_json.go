package coach

import (
	"encoding/json"
	"strconv"
	"strings"

	"josemorinho/backend/internal/dto"
	"josemorinho/backend/internal/problems"
)

// SystemHintJSON is the system prompt for POST /api/hint structured JSON output.
// Correctness is never determined here — evaluation JSON is authoritative.
const SystemHintJSON = `You are a senior Python interviewer in a whiteboard-style round.

Output rules (strict):
- Reply with a single JSON object only. No markdown fences, no text before or after the JSON.
- Keys (all strings): "feedback", "hint", "next_focus".
- "feedback": Brief interviewer note — what is working first (from evaluation), then the main gap. No code.
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
		"problem_title":       ctx.Title,
		"problem_difficulty":  ctx.Difficulty,
		"problem_summary":     ctx.Summary,
		"expected_signature":  ctx.Signature,
		"allowed_hint_level":  allowedLevel,
		"hint_history":        hist,
		"evaluator_output":    eval,
		"code_prefix":         codePrefix,
		"instruction": "ALLOWED_HINT_LEVEL is " + strconv.Itoa(allowedLevel) +
			". Output JSON only with keys feedback, hint, next_focus.",
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}
