package store

import (
	"context"

	"pictorhack/backend/internal/dto"
)

// SessionRepository abstracts local persistence for tests or alternate backends.
type SessionRepository interface {
	SaveSession(ctx context.Context, req dto.SessionSaveRequest) error
	GetSession(ctx context.Context, problemID string) (*dto.SessionState, error)
}

type UserRepository interface {
	CreateUser(ctx context.Context, email, username, passwordHash string) (*dto.AuthUser, error)
	GetUserByLogin(ctx context.Context, identifier string) (*dto.AuthUser, string, error)
	GetUserByEmail(ctx context.Context, email string) (*dto.AuthUser, string, error)
	GetUserByID(ctx context.Context, userID int64) (*dto.AuthUser, error)
	MarkEmailVerified(ctx context.Context, email string) (*dto.AuthUser, error)
	UpdatePasswordByEmail(ctx context.Context, email, passwordHash string) error
	CreateEmailVerification(ctx context.Context, email, purpose, tokenHash, expiresAt string) error
	LatestEmailVerification(ctx context.Context, email, purpose string) (*EmailVerification, error)
	GetEmailVerificationByHash(ctx context.Context, purpose, tokenHash string) (*EmailVerification, error)
	IncrementEmailVerificationAttempts(ctx context.Context, id int64) error
	DeleteEmailVerifications(ctx context.Context, email, purpose string) error
	CreateAuthSession(ctx context.Context, userID int64, tokenHash string, expiresAt string) error
	GetUserIDBySessionHash(ctx context.Context, tokenHash string) (int64, error)
	DeleteAuthSession(ctx context.Context, tokenHash string) error
	DeleteExpiredAuthSessions(ctx context.Context) error
	SaveUserSession(ctx context.Context, userID int64, req dto.SessionSaveRequest) error
	GetUserSession(ctx context.Context, userID int64, problemID string) (*dto.SessionState, error)
	RecordAttempt(ctx context.Context, userID int64, problem dto.ProblemSummary, req dto.RunRequest, res dto.RunResponse) error
	IncrementHintCount(ctx context.Context, userID int64, problemID string) error
	ListUserProgress(ctx context.Context, userID int64) ([]dto.UserProgress, error)
	ProgressMap(ctx context.Context, userID int64) (map[string]dto.PracticeStatus, error)
	ListRecentAttempts(ctx context.Context, userID int64, limit int) ([]dto.UserAttempt, error)
	ExportUserProgress(ctx context.Context, userID int64) (map[string]any, error)
	ResetUserProgress(ctx context.Context, userID int64) error
	DeleteUser(ctx context.Context, userID int64) error
}

type EmailVerification struct {
	ID        int64
	Email     string
	Purpose   string
	TokenHash string
	Attempts  int
	CreatedAt string
	ExpiresAt string
}
