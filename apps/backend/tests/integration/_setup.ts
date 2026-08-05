import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../../src/db/client.js';
import { createDb } from '../../src/db/client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', '..', 'migrations');

/**
 * Create an in-memory DB with the baseline migration applied. Used by all
 * DB-integration tests. Requires the better-sqlite3 native binding to be built
 * (available on node:22 CI / Docker; may be unavailable on some dev hosts).
 */
export function makeTestDb(): Db {
  const db = createDb(':memory:');
  const sql = readFileSync(join(MIGRATIONS, '0000_baseline.sql'), 'utf8');
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) db.$client.exec(stmt);
  return db;
}
