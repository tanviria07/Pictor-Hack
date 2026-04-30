package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

const (
	EmailVerificationPurpose = "email_verification"
	PasswordResetPurpose     = "password_reset"
)

// NewOTP returns a cryptographically random 6-digit numeric code.
func NewOTP() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := (uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])) % 1000000
	return fmt.Sprintf("%06d", n), nil
}

func NewPasswordResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func HashEmailToken(secret, purpose, email, token string) (string, error) {
	secret = strings.TrimSpace(secret)
	purpose = strings.TrimSpace(purpose)
	email = strings.ToLower(strings.TrimSpace(email))
	token = strings.TrimSpace(token)
	if secret == "" {
		return "", errors.New("email token secret is required")
	}
	if purpose == "" || token == "" {
		return "", errors.New("email token inputs are required")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(purpose))
	mac.Write([]byte{0})
	mac.Write([]byte(email))
	mac.Write([]byte{0})
	mac.Write([]byte(token))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func ConstantTimeTokenEqual(got, want string) bool {
	return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}
