package problems

// CategoryMeta is the curriculum catalog (IDs are stable URL slugs).
// TrackID groups sidebar sections: "precode100" (foundations) vs "dsa" (NeetCode 150).
type CategoryMeta struct {
	ID                 string
	Title              string
	TrackID            string
	TrackTitle         string
	SectionDescription string
}

func preCodeCat(id, title, description string) CategoryMeta {
	return CategoryMeta{
		ID:                 id,
		Title:              title,
		TrackID:            "precode100",
		TrackTitle:         "PreCode 100",
		SectionDescription: description,
	}
}

func dsaCat(id, title string) CategoryMeta {
	return CategoryMeta{
		ID:                 id,
		Title:              title,
		TrackID:            "dsa",
		TrackTitle:         "NeetCode 150",
		SectionDescription: "",
	}
}

// AllCategories defines full curriculum ordering: PreCode 100 first, then DSA.
var AllCategories = []CategoryMeta{
	preCodeCat("precode-python-basics", "Python Basics", "Variables, types, and simple expressions."),
	preCodeCat("precode-control-flow", "Control Flow & Functions", "Conditionals, loops, and small reusable functions."),
	preCodeCat("precode-core-data-structures", "Core Data Structures in Python", "Lists, tuples, dicts, and sets used idiomatically."),
	preCodeCat("precode-strings-lists", "Strings & Lists Practice", "Indexing, slicing, and common patterns without advanced algorithms."),
	preCodeCat("precode-dicts-sets", "Dictionaries & Sets", "Counting, membership, and grouping with hash-based structures."),
	preCodeCat("precode-problem-solving", "Problem Solving Foundations", "Brute force, simulation, and careful reasoning on small inputs."),
	preCodeCat("precode-recursion", "Recursion & Thinking Basics", "Base cases, recursive decomposition, and trusting the call stack."),
	preCodeCat("precode-oop-foundations", "OOP Foundations", "Classes, methods, state, and encapsulation."),
	preCodeCat("precode-oop-practice", "OOP Practice", "Small systems built from cooperating objects."),
	preCodeCat("precode-debugging", "Debugging & Code Reading", "Find and fix bugs; predict behavior from code structure."),

	dsaCat("arrays-hashing", "Arrays & Hashing"),
	dsaCat("two-pointers", "Two Pointers"),
	dsaCat("sliding-window", "Sliding Window"),
	dsaCat("stack", "Stack"),
	dsaCat("binary-search", "Binary Search"),
	dsaCat("linked-list", "Linked List"),
	dsaCat("trees", "Trees"),
	dsaCat("tries", "Tries"),
	dsaCat("heap-priority-queue", "Heap / Priority Queue"),
	dsaCat("backtracking", "Backtracking"),
	dsaCat("graphs", "Graphs"),
	dsaCat("advanced-graphs", "Advanced Graphs"),
	dsaCat("dp-1d", "1-D Dynamic Programming"),
	dsaCat("dp-2d", "2-D Dynamic Programming"),
	dsaCat("greedy", "Greedy"),
	dsaCat("intervals", "Intervals"),
	dsaCat("math-geometry", "Math & Geometry"),
	dsaCat("bit-manipulation", "Bit Manipulation"),
}

func categoryTitle(id string) string {
	for _, c := range AllCategories {
		if c.ID == id {
			return c.Title
		}
	}
	return id
}

// TrackMetaForCategory returns track labels for a problem's category.
func TrackMetaForCategory(cat string) (trackID, trackTitle string) {
	for _, c := range AllCategories {
		if c.ID == cat {
			return c.TrackID, c.TrackTitle
		}
	}
	return "", ""
}

// SectionDescriptionForCategory returns the short blurb for sidebar copy.
func SectionDescriptionForCategory(cat string) string {
	for _, c := range AllCategories {
		if c.ID == cat {
			return c.SectionDescription
		}
	}
	return ""
}

func isKnownCategory(id string) bool {
	for _, c := range AllCategories {
		if c.ID == id {
			return true
		}
	}
	return false
}
