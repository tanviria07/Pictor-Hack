package store

import (
	"context"

	"josemorinho/backend/internal/dto"
)

// SessionRepository abstracts local persistence for tests or alternate backends.
type SessionRepository interface {
	SaveSession(ctx context.Context, req dto.SessionSaveRequest) error
	GetSession(ctx context.Context, problemID string) (*dto.SessionState, error)
}
