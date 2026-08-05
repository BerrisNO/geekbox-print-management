import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/client.js';

/**
 * Shared VACUUM INTO backup mechanism (NFR-RE-04, RISK-009). Produces a
 * consistent single-file SQLite backup. Called by both the GET /api/backup route
 * and scripts/backup.mjs.
 */
export function createBackup(db: Db, backupDir: string): string {
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(backupDir, `geekbox-backup-${ts}.sqlite`);
  // VACUUM INTO requires a path literal; parameterize safely by escaping quotes.
  const safe = target.replace(/'/g, "''");
  db.$client.exec(`VACUUM INTO '${safe}'`);
  return target;
}
