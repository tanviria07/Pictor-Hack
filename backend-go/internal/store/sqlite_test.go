package store

import (
	"context"
	"testing"

	"pictorhack/backend/internal/dto"
)

func TestStore_roundTrip(t *testing.T) {
	s, err := Open("file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	ctx := context.Background()
	req := dto.SessionSaveRequest{
		ProblemID:      "two-sum",
		Code:           "def twoSum(nums, t):\n    return []",
		HintHistory:    []string{"hint1"},
		PracticeStatus: dto.PracticeInProgress,
	}
	if err := s.SaveSession(ctx, req); err != nil {
		t.Fatalf("SaveSession: %v", err)
	}

	got, err := s.GetSession(ctx, "two-sum")
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if got == nil {
		t.Fatal("expected session")
	}
	if got.Code != req.Code {
		t.Errorf("code: got %q want %q", got.Code, req.Code)
	}
	if len(got.HintHistory) != 1 || got.HintHistory[0] != "hint1" {
		t.Errorf("hint history: %+v", got.HintHistory)
	}
	if got.PracticeStatus != dto.PracticeInProgress {
		t.Errorf("status: got %q", got.PracticeStatus)
	}

	req2 := dto.SessionSaveRequest{
		ProblemID:      "two-sum",
		Code:           "updated",
		HintHistory:    []string{"hint1", "hint2"},
		PracticeStatus: dto.PracticeSolved,
	}
	if err := s.SaveSession(ctx, req2); err != nil {
		t.Fatalf("SaveSession update: %v", err)
	}
	got2, err := s.GetSession(ctx, "two-sum")
	if err != nil {
		t.Fatalf("GetSession 2: %v", err)
	}
	if got2.Code != "updated" || len(got2.HintHistory) != 2 {
		t.Fatalf("update mismatch: %+v", got2)
	}

	miss, err := s.GetSession(ctx, "missing-id")
	if err != nil {
		t.Fatalf("GetSession missing: %v", err)
	}
	if miss != nil {
		t.Fatalf("expected nil for missing, got %+v", miss)
	}
}

func TestStore_UserSessionPreservesHintHistory(t *testing.T) {
	s, err := Open("file::memory:?cache=shared")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })

	ctx := context.Background()
	req := dto.SessionSaveRequest{
		ProblemID:      "two-sum",
		Code:           "def solve():\n    pass",
		HintHistory:    []string{"look at the hashmap invariant", "handle duplicate values"},
		PracticeStatus: dto.PracticeInProgress,
	}
	if err := s.SaveUserSession(ctx, 42, req); err != nil {
		t.Fatalf("SaveUserSession: %v", err)
	}

	got, err := s.GetUserSession(ctx, 42, "two-sum")
	if err != nil {
		t.Fatalf("GetUserSession: %v", err)
	}
	if got == nil {
		t.Fatal("expected user session")
	}
	if len(got.HintHistory) != len(req.HintHistory) {
		t.Fatalf("hint count got %d want %d: %+v", len(got.HintHistory), len(req.HintHistory), got.HintHistory)
	}
	for i := range req.HintHistory {
		if got.HintHistory[i] != req.HintHistory[i] {
			t.Fatalf("hint %d got %q want %q", i, got.HintHistory[i], req.HintHistory[i])
		}
	}

	req.HintHistory = append(req.HintHistory, "return indices, not values")
	if err := s.SaveUserSession(ctx, 42, req); err != nil {
		t.Fatalf("SaveUserSession update: %v", err)
	}
	got, err = s.GetUserSession(ctx, 42, "two-sum")
	if err != nil {
		t.Fatalf("GetUserSession update: %v", err)
	}
	if len(got.HintHistory) != 3 || got.HintHistory[2] != "return indices, not values" {
		t.Fatalf("updated hints not preserved: %+v", got.HintHistory)
	}
}
