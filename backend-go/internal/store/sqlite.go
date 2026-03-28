// Package store persists session state (code + hint history) in SQLite.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
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
	return s, nil
}

func migrateSessions(s *Store) error {
	_, err := s.db.Exec(`ALTER TABLE sessions ADD COLUMN practice_status TEXT NOT NULL DEFAULT 'not_started'`)
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "duplicate column") {
		return nil
	}
	return err
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
