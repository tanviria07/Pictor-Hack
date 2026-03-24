package httpx

import "fmt"

// RunnerError wraps failures calling the Python runner service.
type RunnerError struct {
	Msg string
}

func (e *RunnerError) Error() string { return e.Msg }

// NewRunnerError constructs a runner client error.
func NewRunnerError(format string, args ...any) error {
	return &RunnerError{Msg: fmt.Sprintf(format, args...)}
}
