PRAGMA foreign_keys = ON;

-- If auth_sessions already exists without expires_at, run this once manually:
-- ALTER TABLE auth_sessions ADD COLUMN expires_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';
--
-- The Go startup migration performs this column check automatically for local
-- SQLite databases that are opened through store.Open.

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

DELETE FROM auth_sessions WHERE expires_at < datetime('now');
