package validation

import (
	"testing"

	"pictorhack/backend/internal/dto"
)

func TestValidateRunRequest_ok(t *testing.T) {
	req := &dto.RunRequest{ProblemID: "two-sum", Language: "python", Code: "def twoSum(nums, target):\n    return [0,1]"}
	if err := ValidateRunRequest(req, 1<<20); err != nil {
		t.Fatal(err)
	}
}

func TestValidateRunRequest_problemID(t *testing.T) {
	req := &dto.RunRequest{ProblemID: "../etc/passwd", Code: "x"}
	if err := ValidateRunRequest(req, 1024); err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateRunRequest_dangerous(t *testing.T) {
	req := &dto.RunRequest{ProblemID: "two-sum", Code: "import os\ndef f():\n    os.system('x')"}
	if err := ValidateRunRequest(req, 1024); err == nil {
		t.Fatal("expected error for os.")
	}
}

func TestValidateRunRequest_open(t *testing.T) {
	req := &dto.RunRequest{ProblemID: "two-sum", Code: "def f():\n    open('/etc/passwd')"}
	if err := ValidateRunRequest(req, 1024); err == nil {
		t.Fatal("expected error")
	}
}
