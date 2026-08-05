import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// node:sqlite is a stable-enough builtin (Node 22.5+/24); used here so the schema
// + DB constraints are verifiable even where the better-sqlite3 native binding is
// unavailable. Production code uses better-sqlite3; the SQL under test is identical.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(__dirname, '..', '..', 'migrations', '0000_baseline.sql');

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  const sql = readFileSync(MIGRATION, 'utf8');
  for (const s of sql
    .split('--> statement-breakpoint')
    .map((x) => x.trim())
    .filter(Boolean))
    db.exec(s);
  return db;
}

describe('Migration + DB constraints (ADR-009 load-bearing)', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = freshDb();
    db.exec("INSERT INTO vendor (id,name,archived) VALUES ('v1','Acme',0)");
    db.exec(
      "INSERT INTO filament_product (id,material,color_name,vendor_id,diameter_mm,nominal_net_weight_g,default_price_minor,density_g_cm3,archived) VALUES ('p1','PLA','Black','v1',1.75,1000,25000,1.24,0)",
    );
    db.exec(
      "INSERT INTO spool (id,label,product_id,initial_net_weight_g,remaining_net_weight_g,source,status,acquired_at) VALUES ('s1','S-0001','p1',1000,1000,'manual','in_stock',0)",
    );
    db.exec(
      "INSERT INTO spool_ledger_entry (id,spool_id,type,delta_g,balance_after_g,estimated,over_consumption,created_at) VALUES ('l1','s1','initial',1000,1000,0,0,0)",
    );
  });

  it('creates all 18 domain tables (+ session + user_account)', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_migrations'",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toContain('spool_ledger_entry');
    expect(tables).toContain('filament_usage');
    expect(tables).toContain('cost_calculation');
    expect(tables.length).toBe(20);
  });

  it('enforces balance_after_g >= 0 (floor-at-zero CHECK)', () => {
    expect(() =>
      db.exec(
        "INSERT INTO spool_ledger_entry (id,spool_id,type,delta_g,balance_after_g,estimated,over_consumption,created_at) VALUES ('bad','s1','consumption',-2000,-1000,0,1,1)",
      ),
    ).toThrow();
  });

  it('enforces UNIQUE(reverses_entry_id) WHERE NOT NULL — no double reversal', () => {
    db.exec(
      "INSERT INTO spool_ledger_entry (id,spool_id,type,delta_g,balance_after_g,reverses_entry_id,estimated,over_consumption,created_at) VALUES ('r1','s1','reversal',0,1000,'l1',0,0,1)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO spool_ledger_entry (id,spool_id,type,delta_g,balance_after_g,reverses_entry_id,estimated,over_consumption,created_at) VALUES ('r2','s1','reversal',0,1000,'l1',0,0,2)",
      ),
    ).toThrow();
  });

  it('allows external slot 254:0 but rejects 254:1 (ADR-011 CHECK)', () => {
    db.exec(
      "INSERT INTO printer (id,serial,name,registration,tracked,online_flag) VALUES ('pr1','SN1','P1','manual',1,0)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO ams_slot_mapping (id,printer_id,unit_index,slot_index,spool_id,mapped_at,verify_flag) VALUES ('m1','pr1',254,0,'s1',0,0)",
      ),
    ).not.toThrow();
    expect(() =>
      db.exec(
        "INSERT INTO ams_slot_mapping (id,printer_id,unit_index,slot_index,spool_id,mapped_at,verify_flag) VALUES ('m2','pr1',254,1,'s1',0,0)",
      ),
    ).toThrow();
  });

  it('enforces UNIQUE(job_id, slot_ref) on filament_usage (exactly-once anchor)', () => {
    db.exec(
      "INSERT INTO print_job (id,source,job_name,outcome,usage_status,created_at,updated_at) VALUES ('j1','manual','J','success','manual',0,0)",
    );
    db.exec(
      "INSERT INTO filament_usage (id,job_id,slot_ref,estimated,attributed) VALUES ('u1','j1','0:0',0,0)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO filament_usage (id,job_id,slot_ref,estimated,attributed) VALUES ('u2','j1','0:0',0,0)",
      ),
    ).toThrow();
  });

  it('enforces UNIQUE(spool_id) on ams_slot_mapping (one mount at a time)', () => {
    db.exec(
      "INSERT INTO printer (id,serial,name,registration,tracked,online_flag) VALUES ('pr1','SN1','P1','manual',1,0)",
    );
    db.exec(
      "INSERT INTO ams_slot_mapping (id,printer_id,unit_index,slot_index,spool_id,mapped_at,verify_flag) VALUES ('m1','pr1',0,0,'s1',0,0)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO ams_slot_mapping (id,printer_id,unit_index,slot_index,spool_id,mapped_at,verify_flag) VALUES ('m2','pr1',0,1,'s1',0,0)",
      ),
    ).toThrow();
  });
});
