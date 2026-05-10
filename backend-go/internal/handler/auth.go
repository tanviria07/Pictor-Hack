package handler

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"pictorhack/backend/internal/auth"
	"pictorhack/backend/internal/db"
)

type AuthRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func Register(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 10)
	if err != nil {
		http.Error(w, `{"error":"error hashing password"}`, http.StatusInternalServerError)
		return
	}

	token := uuid.New().String()

	_, err = db.DB.Exec("INSERT INTO users (email, password_hash, verification_token) VALUES (?, ?, ?)",
		req.Email, string(hash), token)
	if err != nil {
		http.Error(w, `{"error":"error creating user or user already exists"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("Verification link: http://localhost:3000/verify?token=%s", token)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"message": "Check console for verification link"})
}

func Signup(w http.ResponseWriter, r *http.Request) {
	Register(w, r)
}

func Verify(w http.ResponseWriter, r *http.Request) {
	var token string
	if r.Method == http.MethodPost {
		var req struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			token = req.Token
		}
	}
	if token == "" {
		token = r.URL.Query().Get("token")
	}

	if token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	res, err := db.DB.Exec("UPDATE users SET email_verified = 1, verification_token = NULL WHERE verification_token = ?", token)
	if err != nil {
		http.Error(w, `{"error":"error verifying user"}`, http.StatusInternalServerError)
		return
	}

	rows, _ := res.RowsAffected()
	if rows == 0 {
		http.Error(w, `{"error":"invalid token"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"verified": true})
}

func Health(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func Login(w http.ResponseWriter, r *http.Request) {
	var req AuthRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	var id int64
	var hash string
	var verified int
	var failedAttempts int
	var lockedUntil sql.NullTime
	err := db.DB.QueryRow("SELECT id, password_hash, email_verified, failed_login_attempts, locked_until FROM users WHERE email = ?", req.Email).Scan(&id, &hash, &verified, &failedAttempts, &lockedUntil)
	if err != nil {
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	if lockedUntil.Valid && lockedUntil.Time.After(time.Now()) {
		remaining := time.Until(lockedUntil.Time).Round(time.Second)
		w.Header().Set("Retry-After", strconv.Itoa(int(remaining.Seconds())))
		http.Error(w, `{"error":"account locked", "remaining_seconds":` + strconv.Itoa(int(remaining.Seconds())) + `}`, http.StatusTooManyRequests)
		return
	}

	if verified == 0 {
		http.Error(w, `{"error":"email not verified"}`, http.StatusForbidden)
		return
	}

	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password))
	if err != nil {
		failedAttempts++
		if failedAttempts >= 5 {
			lockedUntilTime := time.Now().Add(15 * time.Minute)
			_, _ = db.DB.Exec("UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?", failedAttempts, lockedUntilTime, id)
			http.Error(w, `{"error":"account locked for 15 minutes due to too many failed attempts"}`, http.StatusTooManyRequests)
		} else {
			_, _ = db.DB.Exec("UPDATE users SET failed_login_attempts = ? WHERE id = ?", failedAttempts, id)
			http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		}
		return
	}

	// Reset on success
	_, _ = db.DB.Exec("UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?", id)

	token, err := auth.NewJWT(auth.GetJWTSecret(), id, req.Email, 7*24*time.Hour)
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    token,
		Path:     "/",
		MaxAge:   int((7 * 24 * time.Hour).Seconds()),
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"user": map[string]any{
			"id":             id,
			"email":          req.Email,
			"email_verified": true,
		},
	})
}

func Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   r.TLS != nil,
		SameSite: http.SameSiteStrictMode,
	})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}
