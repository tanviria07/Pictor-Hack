package auth

import "context"

type contextKey string

const userIDKey contextKey = "auth_user_id"

func ContextWithUserID(ctx context.Context, userID int64) context.Context {
	ctx = context.WithValue(ctx, userIDKey, userID)
	return context.WithValue(ctx, "user_id", userID)
}

func UserIDFromContext(ctx context.Context) (int64, bool) {
	if id, ok := ctx.Value(userIDKey).(int64); ok && id > 0 {
		return id, true
	}
	id, ok := ctx.Value("user_id").(int64)
	return id, ok && id > 0
}
