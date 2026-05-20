#!/usr/bin/env bash
# Back up the SQLite database with a timestamp.
# Keeps only the most recent 7 daily backups to bound disk usage.
#
# Run manually:   npm run backup
# Run on a cron:  0 22 * * *  cd /path/to/AutoGrader_v2 && npm run backup

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="$ROOT_DIR/autograder.db"
BACKUP_DIR="$ROOT_DIR/backups"

if [[ ! -f "$DB_PATH" ]]; then
  echo "No database at $DB_PATH — nothing to back up."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/autograder_$TIMESTAMP.db"

# SQLite's .backup command is the safest way to copy an active DB.
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
echo "Backed up to: $BACKUP_FILE"

# Prune: keep only the 7 most recent backups
cd "$BACKUP_DIR"
ls -1t autograder_*.db 2>/dev/null | tail -n +8 | xargs -I {} rm -- {} || true
echo "Backups in $BACKUP_DIR:"
ls -1t autograder_*.db 2>/dev/null | head -10
