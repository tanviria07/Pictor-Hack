# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies for CGO (required for sqlite3)
RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build the application with CGO enabled for sqlite3
RUN CGO_ENABLED=1 GOOS=linux go build -o server ./cmd/server/main.go

# Final stage
FROM alpine:latest

WORKDIR /app

# Install runtime dependencies for sqlite3
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/server .
# Ensure the data directory exists for SQLite
RUN mkdir -p data

# Default environment variables
ENV PORT=8080
ENV DATABASE_PATH=/app/data/pictorhack.db

EXPOSE 8080

CMD ["./server"]
