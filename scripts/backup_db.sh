#!/bin/bash
# Backup script for KitKode SQLite database

# Load environment variables if .env exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Configuration
DB_PATH="${DATABASE_PATH:-./backend-go/data/pictorhack.db}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="kitkode_backup_${TIMESTAMP}.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Error: Database not found at $DB_PATH"
    exit 1
fi

# Perform backup using SQLite's .backup command for safety (handles concurrent writes better than cp)
# If sqlite3 is not available, fall back to cp
if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/$BACKUP_NAME'"
else
    cp "$DB_PATH" "$BACKUP_DIR/$BACKUP_NAME"
fi

# Compress the backup
gzip "$BACKUP_DIR/$BACKUP_NAME"

# Keep only the last 30 days of backups
find "$BACKUP_DIR" -name "kitkode_backup_*.db.gz" -mtime +30 -delete

echo "Backup successful: $BACKUP_DIR/${BACKUP_NAME}.gz"
