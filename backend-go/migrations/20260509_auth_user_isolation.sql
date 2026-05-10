PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(lower(username)) WHERE username != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token) WHERE verification_token != '';

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

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  submitted_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_problem ON submissions(user_id, problem_id);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  problem_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, problem_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE sessions ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0;
