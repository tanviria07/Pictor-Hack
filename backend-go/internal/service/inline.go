package service

import (
	"context"
	"encoding/json"
	"strings"

	"pictorhack/backend/internal/coach"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
)

// InlineService provides real-time line‑by‑line feedback.
type InlineService struct {
	deepseek *deepseek.Client
}

// NewInlineService wires dependencies.
func NewInlineService(d *deepseek.Client) *InlineService {
	return &InlineService{deepseek: d}
}

// InlineHint returns feedback for partial code, cursor position, and problem context.
func (s *InlineService) InlineHint(ctx context.Context, req dto.InlineHintRequest) (*dto.InlineHintResponse, error) {
	// 1. Gather problem metadata (safe for prompts).
	pctx, err := problems.BuildHintPromptContext(req.ProblemID)
	if err != nil {
		return nil, err
	}

	// 2. Build user message with partial code, cursor, and problem context.
	userMsg := buildInlineUserMessage(pctx, req.Code, req.CursorLine, req.CursorColumn)

	// 3. Use DeepSeek if available.
	if s.deepseek.Enabled() {
		sysPrompt := coach.RoleSystemPrompt(coach.SystemInlineHint, req.Role)
		raw, err := s.deepseek.InlineHintCompletion(ctx, sysPrompt, userMsg)
		if err == nil && raw != "" {
			parsed, perr := deepseek.ParseInlineHintJSON(raw)
			if perr == nil {
				return &dto.InlineHintResponse{
					LineIssue:       strings.TrimSpace(parsed.LineIssue),
					NextSteps:       strings.TrimSpace(parsed.NextSteps),
					ProblemRedirect: strings.TrimSpace(parsed.ProblemRedirect),
				}, nil
			}
		}
	}

	// 4. Fallback: simple line analysis.
	return fallbackInlineHint(req.Code, req.CursorLine), nil
}

func buildInlineUserMessage(pctx problems.HintPromptContext, code string, line, col int) string {
	payload := map[string]any{
		"problem_title":      pctx.Title,
		"problem_difficulty": pctx.Difficulty,
		"problem_summary":    pctx.Summary,
		"expected_signature": pctx.Signature,
		"code":               code,
		"cursor_line":        line,
		"cursor_column":      col,
		"track_id":           pctx.TrackID,
		"skill_tags":         pctx.SkillTags,
	}
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		// fallback to simple JSON
		b = []byte(`{"code": "` + strings.ReplaceAll(code, `"`, `\"`) + `", "cursor_line": ` + string(rune(line)) + `}`)
	}
	return string(b)
}

func fallbackInlineHint(code string, line int) *dto.InlineHintResponse {
	lines := strings.Split(code, "\n")
	if line <= 0 || line > len(lines) {
		return &dto.InlineHintResponse{
			LineIssue:       "No line selected.",
			NextSteps:       "Continue writing your solution.",
			ProblemRedirect: "Keep going.",
		}
	}
	target := strings.TrimSpace(lines[line-1])
	if target == "" {
		return &dto.InlineHintResponse{
			LineIssue:       "Empty line.",
			NextSteps:       "Consider adding logic or a comment.",
			ProblemRedirect: "Keep going.",
		}
	}
	// Very simple syntax detection.
	if strings.Contains(target, "import") && strings.Contains(target, "from") {
		return &dto.InlineHintResponse{
			LineIssue:       "Import statement detected.",
			NextSteps:       "Ensure you only import allowed modules.",
			ProblemRedirect: "Keep going.",
		}
	}
	if strings.Contains(target, "def") || strings.Contains(target, "class") {
		return &dto.InlineHintResponse{
			LineIssue:       "Looks good.",
			NextSteps:       "Add the function body or class methods.",
			ProblemRedirect: "Keep going.",
		}
	}
	return &dto.InlineHintResponse{
		LineIssue:       "Line looks plausible.",
		NextSteps:       "Write the next line of logic.",
		ProblemRedirect: "Keep going.",
	}
}