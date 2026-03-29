package service

import (
	"os"
	"testing"

	"pictorhack/backend/internal/problems"
)

func TestMain(m *testing.M) {
	if err := problems.Init(); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}
