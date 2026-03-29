// Package validation performs defense-in-depth checks on untrusted API input.
package validation

import (
	"fmt"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"pictorhack/backend/internal/dto"
)

var problemIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9\-]{0,127}$`)

// dangerousStringPatterns block obvious host-escape attempts (AST checks in runner are primary).
var dangerousStringPatterns = []struct {
	id  string
	re  *regexp.Regexp
	msg string
}{
	{"open_call", regexp.MustCompile(`(?i)\bopen\s*\(`), "File access is not allowed in submitted code."},
	{"exec_call", regexp.MustCompile(`(?i)\bexec\s*\(`), "Dynamic execution builtins are not allowed."},
	{"eval_call", regexp.MustCompile(`(?i)\beval\s*\(`), "Dynamic execution builtins are not allowed."},
	{"compile_call", regexp.MustCompile(`(?i)\bcompile\s*\(`), "Dynamic compilation is not allowed."},
	{"dunder_import", regexp.MustCompile(`(?i)__import__`), "Dynamic imports are not allowed."},
	{"importlib", regexp.MustCompile(`(?i)\bimportlib\b`), "The importlib module is not allowed."},
	{"os_module", regexp.MustCompile(`(?i)\bos\.`), "The os module is not allowed."},
	{"sys_module", regexp.MustCompile(`(?i)\bsys\.`), "The sys module is not allowed."},
	{"subprocess", regexp.MustCompile(`(?i)\bsubprocess\b`), "Subprocess usage is not allowed."},
	{"socket", regexp.MustCompile(`(?i)\bsocket\b`), "Network modules are not allowed."},
	{"pty", regexp.MustCompile(`(?i)\bpty\b`), "The pty module is not allowed."},
}

// NormalizeRunRequest trims string fields before validation or forwarding to the runner.
func NormalizeRunRequest(req *dto.RunRequest) {
	if req == nil {
		return
	}
	req.ProblemID = strings.TrimSpace(req.ProblemID)
	req.Code = strings.TrimSpace(req.Code)
	req.Language = strings.TrimSpace(req.Language)
}

// ValidateRunRequest checks problem id shape, code size, encoding, and obvious dangerous patterns.
func ValidateRunRequest(req *dto.RunRequest, maxCodeBytes int) error {
	if req == nil {
		return fmt.Errorf("empty request")
	}
	pid := req.ProblemID
	if pid == "" {
		return fmt.Errorf("problem_id is required")
	}
	if !problemIDPattern.MatchString(pid) {
		return fmt.Errorf("problem_id has invalid format")
	}

	code := req.Code
	if maxCodeBytes > 0 && len(code) > maxCodeBytes {
		return fmt.Errorf("code exceeds maximum length (%d bytes)", maxCodeBytes)
	}
	if !utf8.ValidString(code) {
		return fmt.Errorf("code must be valid UTF-8")
	}
	if strings.Contains(code, "\x00") {
		return fmt.Errorf("code contains invalid null bytes")
	}

	for _, r := range code {
		if unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t' {
			return fmt.Errorf("code contains disallowed control characters")
		}
	}

	for _, p := range dangerousStringPatterns {
		if p.re.MatchString(code) {
			return fmt.Errorf("%s", p.msg)
		}
	}

	if req.Language != "" && req.Language != "python" {
		return fmt.Errorf("only python is supported")
	}
	return nil
}
