-- PostgreSQL / SQLite compatible core DDL
-- SQLite: INTEGER PRIMARY KEY AUTOINCREMENT
-- PostgreSQL: SERIAL or GENERATED AS IDENTITY

CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    date DATE NOT NULL,
    problems_solved INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_date
    ON user_activity (user_id, date);
