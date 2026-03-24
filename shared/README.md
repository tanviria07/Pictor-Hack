# Shared contracts

- `contracts/evaluation.schema.json` — JSON Schema for deterministic evaluation payloads from the Python runner.
- `contracts/api.ts` — TypeScript DTOs mirrored in Go (`backend-go/internal/api/types.go`).
- `problems/*.json` — Canonical problem metadata (also embedded/copied for the Go server).

The Python runner loads problem definitions from `runner-python/problems/` (copies of `shared/problems/`).
