package db

import (
	"database/sql"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Init(path string) error {
	var err error
	DB, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}

	_, err = DB.Exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT UNIQUE,
		password_hash TEXT,
		email_verified INTEGER DEFAULT 0,
		verification_token TEXT,
		failed_login_attempts INTEGER DEFAULT 0,
		locked_until DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`)
	return err
}
