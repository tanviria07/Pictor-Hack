package problems

import (
	"strings"
	"unicode/utf8"
)

// HintPromptContext bundles safe problem metadata for LLM prompts (no hidden tests).
type HintPromptContext struct {
	Title        string
	Difficulty   string
	Summary      string // Short narrative: truncated description + constraints + reference angle
	Signature    string // Expected entrypoint shape (names only)
	FunctionName string
}

const maxDescriptionRunes = 450

// BuildHintPromptContext loads safe metadata for DeepSeek hint prompts.
func BuildHintPromptContext(problemID string) (HintPromptContext, error) {
	p, err := GetRaw(problemID)
	if err != nil {
		return HintPromptContext{}, err
	}
	var sb strings.Builder
	desc := truncateRunes(strings.TrimSpace(p.Description), maxDescriptionRunes)
	if desc != "" {
		sb.WriteString("Problem statement (truncated):\n")
		sb.WriteString(desc)
		sb.WriteString("\n\n")
	}
	if len(p.Constraints) > 0 {
		sb.WriteString("Constraints (excerpt):\n")
		for i, c := range p.Constraints {
			if i >= 4 {
				break
			}
			sb.WriteString("- ")
			sb.WriteString(c)
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}
	if strings.TrimSpace(p.CanonicalSolutionSummary) != "" {
		sb.WriteString("Reference angle for this problem class (do NOT recite as the candidate's answer): ")
		sb.WriteString(strings.TrimSpace(p.CanonicalSolutionSummary))
	}

	params := make([]string, 0, len(p.Parameters))
	for _, par := range p.Parameters {
		params = append(params, par.Name)
	}
	sig := "def " + p.FunctionName + "(" + strings.Join(params, ", ") + ") -> " + p.ExpectedReturnType
	if p.ExecutionMode == "class" {
		sig = "class " + p.ClassName
	}

	return HintPromptContext{
		Title:        p.Title,
		Difficulty:   p.Difficulty,
		Summary:      strings.TrimSpace(sb.String()),
		Signature:    sig,
		FunctionName: p.FunctionName,
	}, nil
}

func truncateRunes(s string, max int) string {
	if max <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max]) + "…"
}
