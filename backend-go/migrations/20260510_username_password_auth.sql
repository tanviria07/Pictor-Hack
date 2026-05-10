PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  full_name TEXT,
  password_hash TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  submitted_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, problem_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  code TEXT NOT NULL,
  hint_history_json TEXT NOT NULL DEFAULT '[]',
  practice_status TEXT NOT NULL DEFAULT 'not_started',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, problem_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_id ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- For existing legacy tables, add user_id once if the table already exists and lacks it.
-- SQLite versions before ALTER TABLE IF NOT EXISTS require checking PRAGMA table_info first.
-- ALTER TABLE submissions ADD COLUMN user_id INTEGER REFERENCES users(id);
-- ALTER TABLE progress ADD COLUMN user_id INTEGER REFERENCES users(id);
-- ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id);
