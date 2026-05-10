package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"strings"
	"time"
)

type JWTClaims struct {
	UserID   int64  `json:"user_id"`
	Username string `json:"username"`
	Expires  int64  `json:"exp"`
}

func NewJWT(secret string, userID int64, username string, ttl time.Duration) (string, error) {
	if strings.TrimSpace(secret) == "" {
		return "", errors.New("jwt secret is required")
	}
	header := map[string]string{"alg": "HS256", "typ": "JWT"}
	claims := JWTClaims{UserID: userID, Username: username, Expires: time.Now().UTC().Add(ttl).Unix()}
	headerJSON, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	unsigned := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(claimsJSON)
	return unsigned + "." + signJWT(secret, unsigned), nil
}

func ParseJWT(secret, token string) (*JWTClaims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid token")
	}
	unsigned := parts[0] + "." + parts[1]
	if !ConstantTimeTokenEqual(signJWT(secret, unsigned), parts[2]) {
		return nil, errors.New("invalid token signature")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var claims JWTClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}
	if claims.UserID <= 0 || strings.TrimSpace(claims.Username) == "" {
		return nil, errors.New("invalid token claims")
	}
	if time.Now().UTC().Unix() >= claims.Expires {
		return nil, errors.New("token expired")
	}
	return &claims, nil
}

func signJWT(secret, unsigned string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(unsigned))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TokenExpiresInDays(token string) int {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return 0
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return 0
	}
	var raw map[string]any
	if err := json.Unmarshal(payload, &raw); err != nil {
		return 0
	}
	exp, _ := raw["exp"].(float64)
	return int((int64(exp) - time.Now().UTC().Unix()) / int64((24 * time.Hour).Seconds()))
}

func UserIDString(id int64) string {
	return strconv.FormatInt(id, 10)
}

func GetJWTSecret() string {
	s := strings.TrimSpace(os.Getenv("JWT_SECRET"))
	if s == "" {
		return "kitkode-dev-secret-keep-it-safe"
	}
	return s
}
