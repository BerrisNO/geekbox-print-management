#!/usr/bin/env node
/**
 * CLI backup one-liner (NFR-RE-04). Produces a consistent single-file SQLite
 * backup via VACUUM INTO — the same mechanism as GET /api/backup.
 *
 *   node scripts/backup.mjs [dbPath] [backupDir]
 *
 * Defaults: DB_PATH and BACKUP_DIR env vars, else /data/geekbox.sqlite and /data/backups.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const dbPath = process.argv[2] || process.env.DB_PATH || '/data/geekbox.sqlite';
const backupDir = process.argv[3] || process.env.BACKUP_DIR || '/data/backups';

if (!existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(backupDir, `geekbox-backup-${ts}.sqlite`);
const db = new Database(dbPath, { readonly: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
console.log(`Backup written to ${target}`);
