package service

import (
	"strings"
	"unicode"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
)

// codeHeuristicHints returns short, deterministic coaching lines from the user's code
// and the public problem statement (constraints). Used when DeepSeek is off or fails.
func codeHeuristicHints(problemID, code string, eval dto.StructuredEvaluation) []string {
	switch eval.Status {
	case dto.StatusWrong, dto.StatusPartial, dto.StatusIncomplete, dto.StatusRuntimeError:
	default:
		return nil
	}

	c := strings.ToLower(code)
	var out []string

	if strings.Contains(c, "while ") || strings.Contains(c, " for ") || strings.Contains(c, "\tfor ") || strings.HasPrefix(strings.TrimLeftFunc(c, unicode.IsSpace), "for ") {
		out = append(out, "Check your loop condition and update step so you always progress toward a clear termination (watch off-by-one and empty inputs).")
	}

	if strings.Contains(c, "range(") && strings.Contains(c, "len(") {
		out = append(out, "When iterating with indices, confirm every index stays in bounds and you handle length 0 or 1.")
	}

	if strings.Count(c, "if ") < 2 && (eval.Status == dto.StatusWrong || eval.Status == dto.StatusPartial) {
		if pd, err := problems.GetPublic(problemID); err == nil {
			for _, con := range pd.Constraints {
				lc := strings.ToLower(con)
				if strings.Contains(lc, "empty") || strings.Contains(lc, "1 <=") || strings.Contains(lc, "10^4") {
					out = append(out, "Re-read the constraints and test edge cases mentioned there (bounds, empty input, duplicates).")
					break
				}
			}
		}
	}

	if strings.Contains(c, "pass") || strings.TrimSpace(code) == "" {
		out = append(out, "Replace placeholder bodies with real logic that matches the required function signature and examples.")
	}

	return dedupeHintLines(out)
}

func dedupeHintLines(lines []string) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, l := range lines {
		t := strings.TrimSpace(l)
		if t == "" {
			continue
		}
		key := strings.ToLower(t)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	return out
}
