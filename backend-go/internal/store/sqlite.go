// Package store persists session state (code + hint history) in SQLite.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"

	"pictorhack/backend/internal/dto"
)

// Store is the concrete SQLite implementation of session persistence.
type Store struct {
	db *sql.DB
}

// Open opens or creates the SQLite database and migrations.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS sessions (
  problem_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  hint_history_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  practice_status TEXT NOT NULL DEFAULT 'not_started'
);`); err != nil {
		_ = db.Close()
		return nil, err
	}
	s := &Store{db: db}
	if err := migrateSessions(s); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := migrateUsers(s); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func migrateSessions(s *Store) error {
	return addColumnIfMissing(s.db, "sessions", "practice_status", `ALTER TABLE sessions ADD COLUMN practice_status TEXT NOT NULL DEFAULT 'not_started'`)
}

func migrateUsers(s *Store) error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'email_verification',
  token_hash TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email_purpose_created ON email_verifications(lower(email), purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token_hash);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE IF NOT EXISTS user_problem_progress (
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  track TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  best_status TEXT NOT NULL DEFAULT '',
  last_code TEXT NOT NULL DEFAULT '',
  last_attempt_at TEXT NOT NULL DEFAULT '',
  solved_at TEXT NOT NULL DEFAULT '',
  hint_count INTEGER NOT NULL DEFAULT 0,
  hint_history_json TEXT NOT NULL DEFAULT '[]',
  role_mode TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, problem_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS user_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  submitted_code TEXT NOT NULL,
  status TEXT NOT NULL,
  passed_visible INTEGER NOT NULL DEFAULT 0,
  total_visible INTEGER NOT NULL DEFAULT 0,
  passed_hidden INTEGER NOT NULL DEFAULT 0,
  total_hidden INTEGER NOT NULL DEFAULT 0,
  runtime_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_user_attempts_user_created ON user_attempts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS user_design_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  rubric_scores_json TEXT NOT NULL DEFAULT '{}',
  feedback_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, problem_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);`)
	if err != nil {
		return err
	}
	if err := addColumnIfMissing(s.db, "users", "username", `ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''`); err != nil {
		return err
	}
	if err := addColumnIfMissing(s.db, "users", "email_verified", `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`); err != nil {
		return err
	}
	if err := addColumnIfMissing(s.db, "users", "updated_at", `ALTER TABLE users ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`); err != nil {
		return err
	}
	if err := addColumnIfMissing(s.db, "email_verifications", "purpose", `ALTER TABLE email_verifications ADD COLUMN purpose TEXT NOT NULL DEFAULT 'email_verification'`); err != nil {
		return err
	}
	if err := addColumnIfMissing(s.db, "user_problem_progress", "hint_history_json", `ALTER TABLE user_problem_progress ADD COLUMN hint_history_json TEXT NOT NULL DEFAULT '[]'`); err != nil {
		return err
	}
	_, err = s.db.Exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username)) WHERE username != '';`)
	return err
}

func addColumnIfMissing(db *sql.DB, table, column, stmt string) error {
	ok, err := columnExists(db, table, column)
	if err != nil {
		return err
	}
	if ok {
		return nil
	}
	_, err = db.Exec(stmt)
	return err
}

func columnExists(db *sql.DB, table, column string) (bool, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return false, err
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var colName string
		var colType string
		var notNull int
		var dfltValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &colName, &colType, &notNull, &dfltValue, &pk); err != nil {
			return false, err
		}
		if colName == column {
			return true, nil
		}
	}
	return false, rows.Err()
}

// Close releases the database handle.
func (s *Store) Close() error { return s.db.Close() }

func normStatus(st dto.PracticeStatus) dto.PracticeStatus {
	switch st {
	case dto.PracticeInProgress, dto.PracticeSolved, dto.PracticeNotStarted:
		return st
	default:
		return dto.PracticeNotStarted
	}
}

// SaveSession upserts the latest editor snapshot and hint history for a problem.
func (s *Store) SaveSession(_ context.Context, req dto.SessionSaveRequest) error {
	b, err := json.Marshal(req.HintHistory)
	if err != nil {
		return err
	}
	st := normStatus(req.PracticeStatus)
	if st == "" {
		st = dto.PracticeNotStarted
	}
	_, err = s.db.Exec(
		`INSERT INTO sessions(problem_id, code, hint_history_json, updated_at, practice_status)
		 VALUES(?,?,?,?,?)
		 ON CONFLICT(problem_id) DO UPDATE SET
		   code=excluded.code,
		   hint_history_json=excluded.hint_history_json,
		   updated_at=excluded.updated_at,
		   practice_status=excluded.practice_status`,
		req.ProblemID, req.Code, string(b), time.Now().UTC().Format(time.RFC3339), string(st),
	)
	return err
}

// GetSession returns saved state or (nil, nil) if none.
func (s *Store) GetSession(_ context.Context, problemID string) (*dto.SessionState, error) {
	row := s.db.QueryRow(
		`SELECT code, hint_history_json, updated_at, practice_status FROM sessions WHERE problem_id=?`,
		problemID,
	)
	var code, histJSON, updated, pst string
	if err := row.Scan(&code, &histJSON, &updated, &pst); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	var hist []string
	if err := json.Unmarshal([]byte(histJSON), &hist); err != nil {
		hist = nil
	}
	return &dto.SessionState{
		ProblemID:      problemID,
		Code:           code,
		HintHistory:    hist,
		PracticeStatus: normStatus(dto.PracticeStatus(pst)),
		UpdatedAt:      updated,
	}, nil
}

func (s *Store) CreateUser(_ context.Context, email, username, passwordHash string) (*dto.AuthUser, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`INSERT INTO users(email, username, password_hash, created_at, updated_at) VALUES(?,?,?,?,?)`, email, username, passwordHash, now, now)
	if err != nil {
		return nil, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &dto.AuthUser{ID: id, Email: email, Username: username, EmailVerified: false, CreatedAt: now, UpdatedAt: now}, nil
}

func (s *Store) GetUserByLogin(_ context.Context, identifier string) (*dto.AuthUser, string, error) {
	row := s.db.QueryRow(`SELECT id, email, username, password_hash, email_verified, created_at, updated_at FROM users WHERE lower(email)=lower(?) OR lower(username)=lower(?)`, identifier, identifier)
	var u dto.AuthUser
	var hash string
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &hash, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, "", err
	}
	return &u, hash, nil
}

func (s *Store) GetUserByEmail(_ context.Context, email string) (*dto.AuthUser, string, error) {
	row := s.db.QueryRow(`SELECT id, email, username, password_hash, email_verified, created_at, updated_at FROM users WHERE lower(email)=lower(?)`, email)
	var u dto.AuthUser
	var hash string
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &hash, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, "", err
	}
	return &u, hash, nil
}

func (s *Store) GetUserByID(_ context.Context, userID int64) (*dto.AuthUser, error) {
	row := s.db.QueryRow(`SELECT id, email, username, email_verified, created_at, updated_at FROM users WHERE id=?`, userID)
	var u dto.AuthUser
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) MarkEmailVerified(ctx context.Context, email string) (*dto.AuthUser, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`UPDATE users SET email_verified=1, updated_at=? WHERE lower(email)=lower(?)`, now, email)
	if err != nil {
		return nil, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return nil, sql.ErrNoRows
	}
	u, _, err := s.GetUserByEmail(ctx, email)
	return u, err
}

func (s *Store) UpdatePasswordByEmail(_ context.Context, email, passwordHash string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := s.db.Exec(`UPDATE users SET password_hash=?, updated_at=? WHERE lower(email)=lower(?)`, passwordHash, now, email)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (s *Store) CreateEmailVerification(_ context.Context, email, purpose, tokenHash, expiresAt string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO email_verifications(email, purpose, token_hash, attempts, created_at, expires_at) VALUES(?,?,?,?,?,?)`, email, purpose, tokenHash, 0, now, expiresAt)
	return err
}

func (s *Store) LatestEmailVerification(_ context.Context, email, purpose string) (*EmailVerification, error) {
	row := s.db.QueryRow(`SELECT id, email, purpose, token_hash, attempts, created_at, expires_at FROM email_verifications WHERE lower(email)=lower(?) AND purpose=? ORDER BY created_at DESC LIMIT 1`, email, purpose)
	return scanEmailVerification(row)
}

func (s *Store) GetEmailVerificationByHash(_ context.Context, purpose, tokenHash string) (*EmailVerification, error) {
	row := s.db.QueryRow(`SELECT id, email, purpose, token_hash, attempts, created_at, expires_at FROM email_verifications WHERE purpose=? AND token_hash=?`, purpose, tokenHash)
	return scanEmailVerification(row)
}

func (s *Store) IncrementEmailVerificationAttempts(_ context.Context, id int64) error {
	_, err := s.db.Exec(`UPDATE email_verifications SET attempts=attempts+1 WHERE id=?`, id)
	return err
}

func (s *Store) DeleteEmailVerifications(_ context.Context, email, purpose string) error {
	_, err := s.db.Exec(`DELETE FROM email_verifications WHERE lower(email)=lower(?) AND purpose=?`, email, purpose)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanEmailVerification(row rowScanner) (*EmailVerification, error) {
	var ev EmailVerification
	if err := row.Scan(&ev.ID, &ev.Email, &ev.Purpose, &ev.TokenHash, &ev.Attempts, &ev.CreatedAt, &ev.ExpiresAt); err != nil {
		return nil, err
	}
	return &ev, nil
}

func (s *Store) CreateAuthSession(_ context.Context, userID int64, tokenHash string, expiresAt string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO auth_sessions(user_id, token_hash, created_at, expires_at) VALUES(?,?,?,?)`, userID, tokenHash, now, expiresAt)
	return err
}

func (s *Store) GetUserIDBySessionHash(_ context.Context, tokenHash string) (int64, error) {
	row := s.db.QueryRow(`SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at > ?`, tokenHash, time.Now().UTC().Format(time.RFC3339))
	var userID int64
	if err := row.Scan(&userID); err != nil {
		return 0, err
	}
	return userID, nil
}

func (s *Store) DeleteAuthSession(_ context.Context, tokenHash string) error {
	_, err := s.db.Exec(`DELETE FROM auth_sessions WHERE token_hash=?`, tokenHash)
	return err
}

func (s *Store) DeleteUserSessions(_ context.Context, userID int64) error {
	_, err := s.db.Exec(`DELETE FROM auth_sessions WHERE user_id=?`, userID)
	return err
}

func (s *Store) DeleteExpiredAuthSessions(_ context.Context) error {
	_, err := s.db.Exec(`DELETE FROM auth_sessions WHERE expires_at <= ?`, time.Now().UTC().Format(time.RFC3339))
	return err
}

func (s *Store) SaveUserSession(ctx context.Context, userID int64, req dto.SessionSaveRequest) error {
	if err := s.upsertProgress(ctx, userID, req.ProblemID, "", "", string(normStatus(req.PracticeStatus)), req.Code, "", len(req.HintHistory), ""); err != nil {
		return err
	}
	b, err := json.Marshal(req.HintHistory)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE user_problem_progress SET last_code=?, hint_count=?, hint_history_json=?, updated_at=? WHERE user_id=? AND problem_id=?`,
		req.Code, len(req.HintHistory), string(b), time.Now().UTC().Format(time.RFC3339), userID, req.ProblemID)
	if err != nil {
		return err
	}
	return nil
}

func (s *Store) GetUserSession(_ context.Context, userID int64, problemID string) (*dto.SessionState, error) {
	row := s.db.QueryRow(`SELECT last_code, status, hint_history_json, updated_at FROM user_problem_progress WHERE user_id=? AND problem_id=?`, userID, problemID)
	var code, status, histJSON, updated string
	if err := row.Scan(&code, &status, &histJSON, &updated); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	var hints []string
	if err := json.Unmarshal([]byte(histJSON), &hints); err != nil {
		hints = nil
	}
	return &dto.SessionState{ProblemID: problemID, Code: code, HintHistory: hints, PracticeStatus: normStatus(dto.PracticeStatus(status)), UpdatedAt: updated}, nil
}

func (s *Store) RecordAttempt(ctx context.Context, userID int64, problem dto.ProblemSummary, req dto.RunRequest, res dto.RunResponse) error {
	now := time.Now().UTC().Format(time.RFC3339)
	runtimeErr := ""
	if res.Evaluation.ErrorMessage != nil {
		runtimeErr = *res.Evaluation.ErrorMessage
	}
	_, err := s.db.Exec(`INSERT INTO user_attempts(user_id, problem_id, submitted_code, status, passed_visible, total_visible, passed_hidden, total_hidden, runtime_error, created_at)
VALUES(?,?,?,?,?,?,?,?,?,?)`, userID, req.ProblemID, req.Code, string(res.Status), res.Evaluation.PassedVisibleTests, res.Evaluation.TotalVisibleTests, res.Evaluation.PassedHiddenTests, res.Evaluation.TotalHiddenTests, runtimeErr, now)
	if err != nil {
		return err
	}
	status := "in_progress"
	solvedAt := ""
	if res.Status == dto.StatusCorrect {
		status = "solved"
		solvedAt = now
	}
	if err := s.upsertProgress(ctx, userID, req.ProblemID, problem.TrackID, problem.Category, status, req.Code, string(res.Status), 0, req.Role); err != nil {
		return err
	}
	_, err = s.db.Exec(`UPDATE user_problem_progress SET attempt_count=attempt_count+1, last_attempt_at=?, solved_at=CASE WHEN ? != '' THEN ? ELSE solved_at END WHERE user_id=? AND problem_id=?`, now, solvedAt, solvedAt, userID, req.ProblemID)
	return err
}

func (s *Store) IncrementHintCount(_ context.Context, userID int64, problemID string) error {
	_, err := s.db.Exec(`UPDATE user_problem_progress SET hint_count=hint_count+1, updated_at=? WHERE user_id=? AND problem_id=?`, time.Now().UTC().Format(time.RFC3339), userID, problemID)
	return err
}

func (s *Store) upsertProgress(_ context.Context, userID int64, problemID, track, category, status, code, bestStatus string, hintCount int, role string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if status == "" {
		status = "in_progress"
	}
	_, err := s.db.Exec(`INSERT INTO user_problem_progress(user_id, problem_id, track, category, status, best_status, last_code, hint_count, role_mode, updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(user_id, problem_id) DO UPDATE SET
 track=CASE WHEN excluded.track != '' THEN excluded.track ELSE user_problem_progress.track END,
 category=CASE WHEN excluded.category != '' THEN excluded.category ELSE user_problem_progress.category END,
 status=CASE
   WHEN user_problem_progress.status='solved' THEN user_problem_progress.status
   ELSE excluded.status
 END,
 best_status=CASE
   WHEN excluded.best_status='correct' THEN excluded.best_status
   WHEN user_problem_progress.best_status='correct' THEN user_problem_progress.best_status
   WHEN excluded.best_status != '' THEN excluded.best_status
   ELSE user_problem_progress.best_status
 END,
 last_code=excluded.last_code,
 hint_count=CASE WHEN excluded.hint_count > user_problem_progress.hint_count THEN excluded.hint_count ELSE user_problem_progress.hint_count END,
 hint_history_json=CASE WHEN excluded.hint_history_json != '[]' THEN excluded.hint_history_json ELSE user_problem_progress.hint_history_json END,
 role_mode=CASE WHEN excluded.role_mode != '' THEN excluded.role_mode ELSE user_problem_progress.role_mode END,
 updated_at=excluded.updated_at`,
		userID, problemID, track, category, status, bestStatus, code, hintCount, role, now)
	return err
}

func (s *Store) ListUserProgress(_ context.Context, userID int64) ([]dto.UserProgress, error) {
	rows, err := s.db.Query(`SELECT user_id, problem_id, track, category, status, attempt_count, best_status, last_code, last_attempt_at, solved_at, hint_count, role_mode FROM user_problem_progress WHERE user_id=?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dto.UserProgress
	for rows.Next() {
		var p dto.UserProgress
		if err := rows.Scan(&p.UserID, &p.ProblemID, &p.Track, &p.Category, &p.Status, &p.AttemptCount, &p.BestStatus, &p.LastCode, &p.LastAttemptAt, &p.SolvedAt, &p.HintCount, &p.RoleMode); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) ProgressMap(ctx context.Context, userID int64) (map[string]dto.PracticeStatus, error) {
	items, err := s.ListUserProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := map[string]dto.PracticeStatus{}
	for _, item := range items {
		out[item.ProblemID] = normStatus(dto.PracticeStatus(item.Status))
	}
	return out, nil
}

func (s *Store) ListRecentAttempts(_ context.Context, userID int64, limit int) ([]dto.UserAttempt, error) {
	if limit <= 0 || limit > 50 {
		limit = 12
	}
	rows, err := s.db.Query(`SELECT id, user_id, problem_id, submitted_code, status, passed_visible, total_visible, passed_hidden, total_hidden, runtime_error, created_at FROM user_attempts WHERE user_id=? ORDER BY created_at DESC LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dto.UserAttempt
	for rows.Next() {
		var a dto.UserAttempt
		if err := rows.Scan(&a.ID, &a.UserID, &a.ProblemID, &a.SubmittedCode, &a.Status, &a.PassedVisible, &a.TotalVisible, &a.PassedHidden, &a.TotalHidden, &a.RuntimeError, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) ExportUserProgress(ctx context.Context, userID int64) (map[string]any, error) {
	progress, err := s.ListUserProgress(ctx, userID)
	if err != nil {
		return nil, err
	}
	attempts, err := s.ListRecentAttempts(ctx, userID, 50)
	if err != nil {
		return nil, err
	}
	return map[string]any{"progress": progress, "recent_attempts": attempts}, nil
}

func (s *Store) ResetUserProgress(_ context.Context, userID int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`DELETE FROM user_problem_progress WHERE user_id=?`, userID); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM user_attempts WHERE user_id=?`, userID); err != nil {
		_ = tx.Rollback()
		return err
	}
	if _, err := tx.Exec(`DELETE FROM user_design_answers WHERE user_id=?`, userID); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteUser(_ context.Context, userID int64) error {
	res, err := s.db.Exec(`DELETE FROM users WHERE id=?`, userID)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("user not found")
	}
	return nil
}
