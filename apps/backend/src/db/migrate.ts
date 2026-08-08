import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './client.js';

/**
 * Applies drizzle-kit generated SQL migrations at startup (idempotent). Uses a
 * small journal table so each migration file runs at most once. Runs during
 * single-user downtime (ADR-003).
 *
 * FK enforcement is suspended while applying (PRAGMA is a no-op inside a
 * transaction, so it is toggled around the whole run): table rebuilds
 * (e.g. 0007 dropping the material CHECK) must DROP a referenced table.
 * `foreign_key_check` afterwards guarantees no migration left dangling refs.
 */
export function runMigrations(db: Db, migrationsDir: string): { applied: number } {
  const sqlite = db.$client;
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`,
  );

  if (!existsSync(migrationsDir)) {
    return { applied: 0 };
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const done = new Set(
    sqlite
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((r) => (r as { name: string }).name),
  );

  let applied = 0;
  const insert = sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  sqlite.pragma('foreign_keys = OFF');
  try {
    for (const file of files) {
      if (done.has(file)) continue;
      // drizzle uses `--> statement-breakpoint` between statements.
      const raw = readFileSync(join(migrationsDir, file), 'utf8');
      const statements = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const tx = sqlite.transaction(() => {
        for (const stmt of statements) sqlite.exec(stmt);
        insert.run(file, Date.now());
      });
      tx();
      applied += 1;
    }
    if (applied > 0) {
      const violations = sqlite.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error(
          `Migration left ${violations.length} foreign-key violation(s): ${JSON.stringify(violations.slice(0, 5))}`,
        );
      }
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
  return { applied };
}
