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

// InlineHintJSON is the model output shape for POST /api/inline-hint.
type InlineHintJSON struct {
	LineIssue       string `json:"line_issue"`
	NextSteps       string `json:"next_steps"`
	ProblemRedirect string `json:"problem_redirect"`
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

// TraceJSON is the model output shape for POST /api/trace.
type TraceJSON struct {
	AttemptStatus        string `json:"attempt_status"`
	LikelyBugPattern     string `json:"likely_bug_pattern"`
	FailedEdgeCaseCategory string `json:"failed_edge_case_category"`
	ComplexityNote       string `json:"complexity_note"`
	InterviewRisk        string `json:"interview_risk"`
	NextRecommendedAction string `json:"next_recommended_action"`
	FollowUpQuestion    string  `json:"follow_up_question"`
}

// ParseTraceJSON extracts a TraceJSON from raw model output.
func ParseTraceJSON(content string) (TraceJSON, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return TraceJSON{}, fmt.Errorf("empty model output")
	}
	content = extractJSONObject(stripMarkdownFence(content))
	var out TraceJSON
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return TraceJSON{}, fmt.Errorf("parse trace json: %w", err)
	}
	if strings.TrimSpace(out.AttemptStatus) == "" && strings.TrimSpace(out.LikelyBugPattern) == "" {
		return TraceJSON{}, fmt.Errorf("no attempt_status or likely_bug_pattern in json")
	}
	return out, nil
}

// ParseInlineHintJSON extracts an InlineHintJSON from raw model output.
func ParseInlineHintJSON(content string) (InlineHintJSON, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return InlineHintJSON{}, fmt.Errorf("empty model output")
	}
	content = extractJSONObject(stripMarkdownFence(content))
	var out InlineHintJSON
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return InlineHintJSON{}, fmt.Errorf("parse inline hint json: %w", err)
	}
	// All fields are optional; allow empty strings.
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
