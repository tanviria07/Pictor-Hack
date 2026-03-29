package httpx

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func TestErrorWithDetails_JSONShape(t *testing.T) {
	rec := httptest.NewRecorder()
	ErrorWithDetails(rec, 502, ErrRunnerUnavailable, "Runner down.", map[string]string{"reason": "timeout"})

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != ErrRunnerUnavailable {
		t.Fatalf("code: %v", body["code"])
	}
	if body["message"] != "Runner down." {
		t.Fatalf("message: %v", body["message"])
	}
	details, ok := body["details"].(map[string]any)
	if !ok || details["reason"] != "timeout" {
		t.Fatalf("details: %v", body["details"])
	}
}
