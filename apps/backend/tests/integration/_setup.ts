import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../../src/db/client.js';
import { createDb } from '../../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', '..', 'migrations');

/**
 * Create an in-memory DB with all migrations applied in order (matching the
 * production boot path in runMigrations). Used by all DB-integration tests.
 * Requires the better-sqlite3 native binding to be built (available on node:22
 * CI / Docker; may be unavailable on some dev hosts).
 */
export function makeTestDb(): Db {
  const db = createDb(':memory:');
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) db.$client.exec(stmt);
  }
  return db;
}
