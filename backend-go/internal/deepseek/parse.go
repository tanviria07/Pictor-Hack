package deepseek

import (
	"encoding/json"
	"fmt"
	"strings"
)

// HintJSON is the model output shape for POST /api/hint.
type HintJSON struct {
	Feedback  string `json:"feedback"`
	Hint      string `json:"hint"`
	NextFocus string `json:"next_focus"`
}

// ParseHintJSON extracts a HintJSON from raw model output (JSON mode or fenced).
func ParseHintJSON(content string) (HintJSON, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return HintJSON{}, fmt.Errorf("empty model output")
	}
	content = extractJSONObject(stripMarkdownFence(content))
	var out HintJSON
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return HintJSON{}, fmt.Errorf("parse hint json: %w", err)
	}
	if strings.TrimSpace(out.Hint) == "" && strings.TrimSpace(out.Feedback) == "" && strings.TrimSpace(out.NextFocus) == "" {
		return HintJSON{}, fmt.Errorf("no feedback, hint, or next_focus in json")
	}
	return out, nil
}

func stripMarkdownFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	lines := strings.Split(s, "\n")
	if len(lines) < 2 {
		return s
	}
	// drop ``` or ```json first line
	start := 1
	end := len(lines)
	for i := len(lines) - 1; i >= 0; i-- {
		if strings.TrimSpace(lines[i]) == "```" {
			end = i
			break
		}
	}
	if end <= start {
		return s
	}
	return strings.Join(lines[start:end], "\n")
}

func extractJSONObject(s string) string {
	s = strings.TrimSpace(s)
	i := strings.Index(s, "{")
	j := strings.LastIndex(s, "}")
	if i >= 0 && j > i {
		return s[i : j+1]
	}
	return s
}
