# Activity API (FastAPI)

Stores per-day solved counts and serves a GitHub-style heatmap payload.

## Setup

```bash
cd activity-api
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
copy .env.example .env          # optional
uvicorn app.main:app --reload --port 8000
```

SQLite database file `activity.db` is created next to the process working directory (see `DATABASE_URL`).

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/activity/{user_id}` | Last 365 days: `{ "date", "count" }[]` |
| GET | `/activity/{user_id}/summary` | Same days + yearly total + streaks |
| POST | `/activity/{user_id}/solve` | Increment count for date (JSON body `{ "date": "YYYY-MM-DD" }` optional; defaults today) |

## PostgreSQL

Set `DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname` and install a driver, e.g. `pip install psycopg[binary]`.

SQL DDL is in `sql/schema.sql` (compatible with SQLite and PostgreSQL for this schema).
