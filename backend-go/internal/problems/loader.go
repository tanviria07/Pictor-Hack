package problems

import (
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"sync"

	"josemorinho/backend/internal/api"
)

//go:embed data/*.json
var embedded embed.FS

var (
	mu       sync.RWMutex
	byID     map[string]rawProblem
	orderIDs []string
)

type rawProblem struct {
	ID                         string          `json:"id"`
	Title                      string          `json:"title"`
	Difficulty                 string          `json:"difficulty"`
	Description                string          `json:"description"`
	Examples                   []api.Example   `json:"examples"`
	Constraints                []string        `json:"constraints"`
	FunctionName               string          `json:"function_name"`
	Parameters                 []api.Parameter `json:"parameters"`
	ExpectedReturnType         string          `json:"expected_return_type"`
	VisibleTests               []any           `json:"visible_tests"`
	HiddenTests                []any           `json:"hidden_tests"`
	HintPlan                   map[string]string `json:"hint_plan"`
	CanonicalSolutionSummary string          `json:"canonical_solution_summary"`
	DisallowedFullSolution     bool            `json:"disallowed_full_solution_exposure"`
}

func Init() error {
	entries, err := embedded.ReadDir("data")
	if err != nil {
		return err
	}
	m := make(map[string]rawProblem)
	ids := make([]string, 0)
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		b, err := embedded.ReadFile("data/" + e.Name())
		if err != nil {
			return err
		}
		var p rawProblem
		if err := json.Unmarshal(b, &p); err != nil {
			return fmt.Errorf("parse %s: %w", e.Name(), err)
		}
		if p.ID == "" {
			return fmt.Errorf("missing id in %s", e.Name())
		}
		m[p.ID] = p
		ids = append(ids, p.ID)
	}
	sort.Strings(ids)
	mu.Lock()
	byID = m
	orderIDs = ids
	mu.Unlock()
	return nil
}

func ListSummaries() []api.ProblemSummary {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]api.ProblemSummary, 0, len(orderIDs))
	for _, id := range orderIDs {
		p := byID[id]
		out = append(out, api.ProblemSummary{
			ID:           p.ID,
			Title:        p.Title,
			Difficulty:   p.Difficulty,
			FunctionName: p.FunctionName,
		})
	}
	return out
}

func GetPublic(id string) (*api.ProblemDetail, error) {
	mu.RLock()
	p, ok := byID[id]
	mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	return &api.ProblemDetail{
		ID:                 p.ID,
		Title:              p.Title,
		Difficulty:         p.Difficulty,
		Description:        p.Description,
		Examples:           p.Examples,
		Constraints:        p.Constraints,
		FunctionName:       p.FunctionName,
		Parameters:         p.Parameters,
		ExpectedReturnType: p.ExpectedReturnType,
		VisibleTestCount:   len(p.VisibleTests),
		HiddenTestCount:    len(p.HiddenTests),
	}, nil
}

func GetRaw(id string) (*rawProblem, error) {
	mu.RLock()
	defer mu.RUnlock()
	p, ok := byID[id]
	if !ok {
		return nil, fmt.Errorf("not found")
	}
	cp := p
	return &cp, nil
}

// HintPlanJSON returns the seeded hint plan for DeepSeek fallback / context.
func HintPlanJSON(id string) (string, error) {
	p, err := GetRaw(id)
	if err != nil {
		return "", err
	}
	b, err := json.MarshalIndent(p.HintPlan, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// SeededHint returns the progressive hint text from problem metadata (no LLM).
func SeededHint(id string, level int) string {
	if level < 1 {
		level = 1
	}
	if level > 4 {
		level = 4
	}
	p, err := GetRaw(id)
	if err != nil {
		return ""
	}
	key := "level_" + strconv.Itoa(level)
	return p.HintPlan[key]
}
