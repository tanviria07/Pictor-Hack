package service

import (
	"context"
	"sort"
	"time"

	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
	"pictorhack/backend/internal/store"
)

type DashboardService struct {
	users store.UserRepository
}

func NewDashboardService(users store.UserRepository) *DashboardService {
	return &DashboardService{users: users}
}

func (s *DashboardService) Build(ctx context.Context, userID int64) (*dto.DashboardResponse, error) {
	progress, err := s.users.ListUserProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	attempts, err := s.users.ListRecentAttempts(ctx, userID, 12)
	if err != nil {
		return nil, err
	}
	progressByProblem := map[string]dto.UserProgress{}
	for _, p := range progress {
		progressByProblem[p.ProblemID] = p
	}

	summaries := problems.ListSummaries("", "")
	trackCounts := map[string]*dto.ProgressBucket{}
	categoryCounts := map[string]*dto.ProgressBucket{}
	for _, p := range summaries {
		track := normalizeTrack(p.TrackID)
		if _, ok := trackCounts[track]; !ok {
			trackCounts[track] = &dto.ProgressBucket{ID: track, Title: trackTitle(track)}
		}
		trackCounts[track].Total++
		if _, ok := categoryCounts[p.Category]; !ok {
			categoryCounts[p.Category] = &dto.ProgressBucket{ID: p.Category, Title: p.CategoryTitle}
		}
		categoryCounts[p.Category].Total++
		if progressByProblem[p.ID].BestStatus == "correct" || progressByProblem[p.ID].Status == "solved" {
			trackCounts[track].Solved++
			categoryCounts[p.Category].Solved++
		}
	}
	addBlind75(trackCounts, summaries, progressByProblem)
	addCompanyTracks(trackCounts, summaries, progressByProblem)

	weak := weakAreas(attempts, summaries)
	recommended := recommendedProblems(summaries, progressByProblem, weak)
	streak, activeDays := activity(attempts)

	var solved int
	for _, p := range progressByProblem {
		if p.BestStatus == "correct" || p.Status == "solved" {
			solved++
		}
	}
	return &dto.DashboardResponse{
		SolvedCount:          solved,
		TotalProblems:        len(summaries),
		ProgressByTrack:      buckets(trackCounts),
		ProgressByCategory:   buckets(categoryCounts),
		RecentAttempts:       attempts,
		WeakAreas:            weak,
		RecommendedProblems:  recommended,
		RoleModeSummary:      roleSummary(progress),
		PracticeStreakDays:   streak,
		PracticeActivityDays: activeDays,
	}, nil
}

func normalizeTrack(track string) string {
	if track == "" {
		return "neetcode150"
	}
	if track == "dsa" {
		return "neetcode150"
	}
	return track
}

func trackTitle(track string) string {
	switch track {
	case "precode100":
		return "PreCode 100"
	case "blind75":
		return "Blind 75"
	case "neetcode150":
		return "NeetCode 150"
	case "company":
		return "Company Tracks"
	case "cloud-architect-prep":
		return "Cloud Architect Prep"
	default:
		return track
	}
}

func addBlind75(m map[string]*dto.ProgressBucket, summaries []dto.ProblemSummary, progress map[string]dto.UserProgress) {
	set := map[string]bool{}
	for _, id := range []string{"contains-duplicate", "valid-anagram", "two-sum", "group-anagrams", "top-k-frequent-elements", "product-of-array-except-self", "valid-sudoku", "encode-and-decode-strings", "longest-consecutive-sequence", "valid-palindrome", "two-sum-ii-input-array-is-sorted", "3sum", "container-with-most-water", "best-time-to-buy-and-sell-stock", "longest-substring-without-repeating-characters", "longest-repeating-character-replacement", "minimum-window-substring", "permutation-in-string", "valid-parentheses", "min-stack", "evaluate-reverse-polish-notation", "generate-parentheses", "daily-temperatures", "car-fleet", "largest-rectangle-in-histogram", "binary-search", "search-a-2d-matrix", "koko-eating-bananas", "find-minimum-in-rotated-sorted-array", "search-in-rotated-sorted-array", "reverse-linked-list", "merge-two-sorted-lists", "reorder-list", "remove-nth-node-from-end-of-list", "copy-list-with-random-pointer", "add-two-numbers", "linked-list-cycle", "invert-binary-tree", "maximum-depth-of-binary-tree", "diameter-of-binary-tree", "balanced-binary-tree", "same-tree", "subtree-of-another-tree", "lowest-common-ancestor-of-a-binary-search-tree", "binary-tree-level-order-traversal", "binary-tree-right-side-view", "count-good-nodes-in-binary-tree", "validate-binary-search-tree", "kth-smallest-element-in-a-bst", "construct-binary-tree-from-preorder-and-inorder-traversal", "binary-tree-maximum-path-sum", "serialize-and-deserialize-binary-tree", "implement-trie-prefix-tree", "design-add-and-search-words-data-structure", "find-median-from-data-stream", "kth-largest-element-in-an-array", "subsets", "combination-sum", "permutations", "word-search", "number-of-islands", "clone-graph", "max-area-of-island", "pacific-atlantic-water-flow", "course-schedule", "graph-valid-tree", "number-of-connected-components-in-an-undirected-graph", "redundant-connection", "climbing-stairs", "coin-change", "house-robber", "house-robber-ii", "longest-increasing-subsequence", "decode-ways", "word-break"} {
		set[id] = true
	}
	b := &dto.ProgressBucket{ID: "blind75", Title: "Blind 75"}
	for _, p := range summaries {
		if !set[p.ID] {
			continue
		}
		b.Total++
		if progress[p.ID].BestStatus == "correct" || progress[p.ID].Status == "solved" {
			b.Solved++
		}
	}
	m[b.ID] = b
}

func addCompanyTracks(m map[string]*dto.ProgressBucket, summaries []dto.ProblemSummary, progress map[string]dto.UserProgress) {
	b := &dto.ProgressBucket{ID: "company", Title: "Company Tracks"}
	seen := map[string]bool{}
	for _, p := range summaries {
		if len(p.CompanyTags) == 0 && len(p.CompanyTrackTags) == 0 {
			continue
		}
		if seen[p.ID] {
			continue
		}
		seen[p.ID] = true
		b.Total++
		if progress[p.ID].BestStatus == "correct" || progress[p.ID].Status == "solved" {
			b.Solved++
		}
	}
	m[b.ID] = b
}

func buckets(m map[string]*dto.ProgressBucket) []dto.ProgressBucket {
	out := make([]dto.ProgressBucket, 0, len(m))
	for _, b := range m {
		out = append(out, *b)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Title < out[j].Title })
	return out
}

func weakAreas(attempts []dto.UserAttempt, summaries []dto.ProblemSummary) []dto.WeakArea {
	byID := map[string]dto.ProblemSummary{}
	for _, p := range summaries {
		byID[p.ID] = p
	}
	counts := map[string]int{}
	for _, a := range attempts {
		if a.Status == "correct" {
			continue
		}
		cat := byID[a.ProblemID].CategoryTitle
		if cat == "" {
			cat = byID[a.ProblemID].Category
		}
		if cat != "" {
			counts[cat]++
		}
	}
	out := make([]dto.WeakArea, 0, len(counts))
	for k, v := range counts {
		out = append(out, dto.WeakArea{Category: k, WrongOrPartialAttempts: v})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].WrongOrPartialAttempts > out[j].WrongOrPartialAttempts })
	if len(out) > 5 {
		return out[:5]
	}
	return out
}

func recommendedProblems(summaries []dto.ProblemSummary, progress map[string]dto.UserProgress, weak []dto.WeakArea) []dto.RecommendedProblem {
	weakSet := map[string]bool{}
	for _, w := range weak {
		weakSet[w.Category] = true
	}
	var out []dto.RecommendedProblem
	for _, p := range summaries {
		pr := progress[p.ID]
		if pr.Status == "solved" || pr.BestStatus == "correct" {
			continue
		}
		reason := "Next unsolved problem"
		if weakSet[p.CategoryTitle] || weakSet[p.Category] {
			reason = "Practice a recent weak area"
		}
		out = append(out, dto.RecommendedProblem{ID: p.ID, Title: p.Title, Track: trackTitle(normalizeTrack(p.TrackID)), Category: p.CategoryTitle, Difficulty: p.Difficulty, Reason: reason})
		if len(out) == 6 {
			break
		}
	}
	return out
}

func roleSummary(progress []dto.UserProgress) []dto.RoleModeActivity {
	counts := map[string]int{}
	for _, p := range progress {
		if p.RoleMode != "" {
			counts[p.RoleMode] += p.AttemptCount
		}
	}
	out := make([]dto.RoleModeActivity, 0, len(counts))
	for role, count := range counts {
		out = append(out, dto.RoleModeActivity{Role: role, AttemptCount: count})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].AttemptCount > out[j].AttemptCount })
	return out
}

func activity(attempts []dto.UserAttempt) (int, int) {
	days := map[string]bool{}
	for _, a := range attempts {
		if t, err := time.Parse(time.RFC3339, a.CreatedAt); err == nil {
			days[t.Format("2006-01-02")] = true
		}
	}
	today := time.Now().UTC()
	streak := 0
	for d := today; ; d = d.AddDate(0, 0, -1) {
		if !days[d.Format("2006-01-02")] {
			break
		}
		streak++
	}
	return streak, len(days)
}
