package problems

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"pictorhack/backend/internal/dto"
)

// ErrNotFound is returned when a problem id is unknown.
var ErrNotFound = errors.New("problem not found")

//go:embed data
var embedded embed.FS

var (
	mu           sync.RWMutex
	byID         map[string]rawProblem
	orderIDs     []string
	byCategoryID map[string][]string // category id -> sorted problem ids
)

type rawProblem struct {
	ID                         string            `json:"id"`
	Title                      string            `json:"title"`
	Difficulty                 string            `json:"difficulty"`
	Category                   string            `json:"category"`
	Description                string            `json:"description"`
	Examples                   []dto.Example     `json:"examples"`
	Constraints                []string          `json:"constraints"`
	FunctionName               string            `json:"function_name"`
	ExecutionMode              string            `json:"execution_mode"`
	ClassName                  string            `json:"class_name"`
	StarterCode                string            `json:"starter_code"`
	Parameters                 []dto.Parameter   `json:"parameters"`
	ExpectedReturnType         string            `json:"expected_return_type"`
	VisibleTests               []any             `json:"visible_tests"`
	HiddenTests                []any             `json:"hidden_tests"`
	HintPlan                   map[string]string `json:"hint_plan"`
	CanonicalSolutionSummary   string            `json:"canonical_solution_summary"`
	DisallowedFullSolution     bool              `json:"disallowed_full_solution_exposure"`
}

func Init() error {
	if dir := strings.TrimSpace(os.Getenv("PROBLEMS_DATA_DIR")); dir != "" {
		return initFromDisk(dir)
	}
	return initFromEmbed()
}

func initFromEmbed() error {
	m := make(map[string]rawProblem)
	ids := make([]string, 0)
	byCat := make(map[string][]string)

	err := fs.WalkDir(embedded, "data", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(path), ".json") {
			return nil
		}
		b, err := embedded.ReadFile(path)
		if err != nil {
			return err
		}
		var p rawProblem
		if err := json.Unmarshal(b, &p); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		if p.ID == "" {
			return fmt.Errorf("missing id in %s", path)
		}
		if p.Category == "" {
			return fmt.Errorf("missing category in %s", path)
		}
		if !isKnownCategory(p.Category) {
			return fmt.Errorf("unknown category %q in %s", p.Category, path)
		}
		if _, dup := m[p.ID]; dup {
			return fmt.Errorf("duplicate problem id %q (%s)", p.ID, path)
		}
		m[p.ID] = p
		ids = append(ids, p.ID)
		byCat[p.Category] = append(byCat[p.Category], p.ID)
		return nil
	})
	if err != nil {
		return err
	}

	return commitProblemIndex(m, ids, byCat)
}

func initFromDisk(root string) error {
	st, err := os.Stat(root)
	if err != nil {
		return fmt.Errorf("PROBLEMS_DATA_DIR: %w", err)
	}
	if !st.IsDir() {
		return fmt.Errorf("PROBLEMS_DATA_DIR is not a directory: %s", root)
	}

	m := make(map[string]rawProblem)
	ids := make([]string, 0)
	byCat := make(map[string][]string)

	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(strings.ToLower(path), ".json") {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var p rawProblem
		if err := json.Unmarshal(b, &p); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}
		if p.ID == "" {
			return fmt.Errorf("missing id in %s", path)
		}
		if p.Category == "" {
			return fmt.Errorf("missing category in %s", path)
		}
		if !isKnownCategory(p.Category) {
			return fmt.Errorf("unknown category %q in %s", p.Category, path)
		}
		if _, dup := m[p.ID]; dup {
			return fmt.Errorf("duplicate problem id %q (%s)", p.ID, path)
		}
		m[p.ID] = p
		ids = append(ids, p.ID)
		byCat[p.Category] = append(byCat[p.Category], p.ID)
		return nil
	})
	if err != nil {
		return err
	}

	return commitProblemIndex(m, ids, byCat)
}

func commitProblemIndex(m map[string]rawProblem, ids []string, byCat map[string][]string) error {
	sort.Strings(ids)
	for k := range byCat {
		sort.Strings(byCat[k])
	}

	mu.Lock()
	byID = m
	orderIDs = ids
	byCategoryID = byCat
	mu.Unlock()
	return nil
}

// ListCategorySummaries returns all curriculum categories with live problem counts.
func ListCategorySummaries() []dto.CategorySummary {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]dto.CategorySummary, 0, len(AllCategories))
	for _, c := range AllCategories {
		n := 0
		if byCategoryID != nil {
			n = len(byCategoryID[c.ID])
		}
		out = append(out, dto.CategorySummary{
			ID:           c.ID,
			Title:        c.Title,
			ProblemCount: n,
		})
	}
	return out
}

func normalizeDifficulty(d string) string {
	switch strings.ToLower(strings.TrimSpace(d)) {
	case "easy", "medium", "hard":
		return strings.ToLower(strings.TrimSpace(d))
	default:
		return ""
	}
}

// ListSummaries returns problem summaries with optional filters (empty = all).
func ListSummaries(categoryFilter, difficultyFilter string) []dto.ProblemSummary {
	cat := strings.TrimSpace(categoryFilter)
	diff := normalizeDifficulty(difficultyFilter)

	mu.RLock()
	defer mu.RUnlock()

	var pool []string
	if cat != "" {
		pool = append(pool, byCategoryID[cat]...)
	} else {
		pool = append(pool, orderIDs...)
	}

	out := make([]dto.ProblemSummary, 0, len(pool))
	for _, id := range pool {
		p := byID[id]
		if diff != "" && normalizeDifficulty(p.Difficulty) != diff {
			continue
		}
		out = append(out, dto.ProblemSummary{
			ID:            p.ID,
			Title:         p.Title,
			Difficulty:    p.Difficulty,
			Category:      p.Category,
			CategoryTitle: categoryTitle(p.Category),
			FunctionName:  p.FunctionName,
		})
	}
	return out
}

func GetPublic(id string) (*dto.ProblemDetail, error) {
	mu.RLock()
	p, ok := byID[id]
	mu.RUnlock()
	if !ok {
		return nil, ErrNotFound
	}
	return &dto.ProblemDetail{
		ID:                 p.ID,
		Title:              p.Title,
		Difficulty:         p.Difficulty,
		Category:           p.Category,
		CategoryTitle:      categoryTitle(p.Category),
		Description:        p.Description,
		Examples:           p.Examples,
		Constraints:        p.Constraints,
		FunctionName:       p.FunctionName,
		ExecutionMode:      p.ExecutionMode,
		ClassName:          p.ClassName,
		StarterCode:        p.StarterCode,
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
		return nil, ErrNotFound
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
