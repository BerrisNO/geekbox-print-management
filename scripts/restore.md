# Restore Procedure (NFR-RE-04 drill)

The backup is a plain, consistent SQLite file (produced by `VACUUM INTO`). Restore = replace the live DB file with a backup and restart the container.

## Steps

1. **Stop the app** so nothing writes during the swap:
   ```sh
   docker compose down
   ```

2. **Locate a backup.** Backups live in the named volume under `/data/backups/`
   (or wherever `BACKUP_DIR` points). You can list them from a throwaway container:
   ```sh
   docker run --rm -v geekbox-print-management_gbx-data:/data alpine ls -la /data/backups
   ```

3. **Copy the chosen backup over the live DB file** (`DB_PATH`, default `/data/geekbox.sqlite`):
   ```sh
   docker run --rm -v geekbox-print-management_gbx-data:/data alpine \
     sh -c "cp /data/backups/geekbox-backup-<timestamp>.sqlite /data/geekbox.sqlite && \
            rm -f /data/geekbox.sqlite-wal /data/geekbox.sqlite-shm"
   ```
   Removing the stale `-wal`/`-shm` sidecar files is important — the backup is a
   complete database and must not be reconciled against an old WAL.

4. **Start the app.** Migrations run at startup and are idempotent:
   ```sh
   docker compose up -d
   ```

5. **Verify** `GET /api/health` returns 200 and spot-check inventory/jobs data.

## Rollback to a previous image + backup

For a bad release, restore the previous image tag in `docker-compose.yml` (never
bare `latest`), then run the restore steps above with the matching backup.
