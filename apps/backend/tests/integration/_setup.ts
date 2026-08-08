import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../../src/db/client.js';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', '..', 'migrations');

/**
 * Create an in-memory DB with all migrations applied in order via the SAME
 * runner as the production boot path (FK toggling included — table-rebuild
 * migrations require it). Used by all DB-integration tests.
 * Requires the better-sqlite3 native binding to be built (available on node:22
 * CI / Docker; may be unavailable on some dev hosts).
 */
export function makeTestDb(): Db {
  const db = createDb(':memory:');
  runMigrations(db, MIGRATIONS);
  return db;
}
