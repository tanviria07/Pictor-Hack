package problems

// CategoryMeta is the NeetCode-style catalog (IDs are stable URL slugs).
type CategoryMeta struct {
	ID    string
	Title string
}

// AllCategories defines the full curriculum ordering (empty categories show 0 problems).
var AllCategories = []CategoryMeta{
	{ID: "arrays-hashing", Title: "Arrays & Hashing"},
	{ID: "two-pointers", Title: "Two Pointers"},
	{ID: "sliding-window", Title: "Sliding Window"},
	{ID: "stack", Title: "Stack"},
	{ID: "binary-search", Title: "Binary Search"},
	{ID: "linked-list", Title: "Linked List"},
	{ID: "trees", Title: "Trees"},
	{ID: "tries", Title: "Tries"},
	{ID: "heap-priority-queue", Title: "Heap / Priority Queue"},
	{ID: "backtracking", Title: "Backtracking"},
	{ID: "graphs", Title: "Graphs"},
	{ID: "advanced-graphs", Title: "Advanced Graphs"},
	{ID: "dp-1d", Title: "1-D Dynamic Programming"},
	{ID: "dp-2d", Title: "2-D Dynamic Programming"},
	{ID: "greedy", Title: "Greedy"},
	{ID: "intervals", Title: "Intervals"},
	{ID: "math-geometry", Title: "Math & Geometry"},
	{ID: "bit-manipulation", Title: "Bit Manipulation"},
}

func categoryTitle(id string) string {
	for _, c := range AllCategories {
		if c.ID == id {
			return c.Title
		}
	}
	return id
}

func isKnownCategory(id string) bool {
	for _, c := range AllCategories {
		if c.ID == id {
			return true
		}
	}
	return false
}
