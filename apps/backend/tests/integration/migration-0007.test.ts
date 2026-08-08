import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '..', '..', 'migrations');

/**
 * Upgrade-path proof for migration 0007 (material catalog): a database with
 * real pre-0007 data (products under the old material CHECK, spools with
 * ledger-backed FKs) must come through the filament_product rebuild with all
 * rows intact, seeded materials, and zero foreign-key violations.
 */
describe('migration 0007 upgrade path', () => {
  it('rebuilds filament_product with existing data intact', () => {
    const db = createDb(':memory:');
    const sqlite = db.$client;

    // Apply everything BEFORE 0007 and journal it, mimicking an existing install.
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);`,
    );
    const pre = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith('.sql') && f < '0007')
      .sort();
    expect(pre.length).toBeGreaterThan(0);
    const journal = sqlite.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
    for (const file of pre) {
      const statements = readFileSync(join(MIGRATIONS, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) sqlite.exec(stmt);
      journal.run(file, Date.now());
    }

    // Legacy data: vendor → product (old enum CHECK still active) → spool.
    sqlite.prepare(`INSERT INTO vendor (id, name, archived) VALUES ('v1', 'Acme', 0)`).run();
    sqlite
      .prepare(
        `INSERT INTO filament_product
           (id, material, color_name, vendor_id, diameter_mm, nominal_net_weight_g,
            default_price_minor, density_g_cm3, spool_type, archived)
         VALUES ('p1', 'PETG', 'Orange', 'v1', 1.75, 1000, 25000, 1.27, 'plastic', 0)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO spool
           (id, label, product_id, initial_net_weight_g, remaining_net_weight_g,
            source, status, acquired_at)
         VALUES ('s1', 'S-0001', 'p1', 1000, 750, 'manual', 'in_use', 1700000000)`,
      )
      .run();
    // Old CHECK still rejects unknown materials pre-migration.
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO filament_product
             (id, material, color_name, vendor_id, diameter_mm, nominal_net_weight_g,
              default_price_minor, density_g_cm3, spool_type, archived)
           VALUES ('p2', 'PCTG', 'Clear', 'v1', 1.75, 1000, 0, 1.23, 'plastic', 0)`,
        )
        .run(),
    ).toThrow(/CHECK/);

    // Upgrade: only 0007+ should apply.
    const { applied } = runMigrations(db, MIGRATIONS);
    expect(applied).toBeGreaterThanOrEqual(1);

    // Data survived the rebuild, references intact.
    const p = sqlite.prepare(`SELECT * FROM filament_product WHERE id = 'p1'`).get() as Record<
      string,
      unknown
    >;
    expect(p.material).toBe('PETG');
    expect(p.nominal_net_weight_g).toBe(1000);
    const s = sqlite.prepare(`SELECT product_id FROM spool WHERE id = 's1'`).get() as {
      product_id: string;
    };
    expect(s.product_id).toBe('p1');
    expect(sqlite.pragma('foreign_key_check')).toHaveLength(0);

    // Seeded material catalog, and the CHECK is gone: custom materials insert fine.
    const materials = sqlite.prepare(`SELECT name FROM material ORDER BY name`).all() as {
      name: string;
    }[];
    expect(materials.map((m) => m.name)).toContain('PLA');
    sqlite
      .prepare(
        `INSERT INTO filament_product
           (id, material, color_name, vendor_id, diameter_mm, nominal_net_weight_g,
            default_price_minor, density_g_cm3, spool_type, archived)
         VALUES ('p2', 'PCTG', 'Clear', 'v1', 1.75, 1000, 0, 1.23, 'plastic', 0)`,
      )
      .run();

    // Idempotent: a second run applies nothing.
    expect(runMigrations(db, MIGRATIONS).applied).toBe(0);
  });
});
