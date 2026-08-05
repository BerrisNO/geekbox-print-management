import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

/**
 * Opens the SQLite database with WAL mode and FK enforcement (ADR-003).
 * A single connection = a single writer in a single process (ADR-004), which
 * serializes all writes by construction (discharges ES-206.1).
 */
export function createDb(dbPath: string): Db {
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema }) as Db;
  return db;
}

export { schema };
