import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { printer } from './integration.js';
import { spool, spoolLedgerEntry } from './inventory.js';
import { workOrderLine } from './work-orders.js';

/** print_job (FR-401). bambu_task_id is the idempotent upsert key. */
export const printJob = sqliteTable(
  'print_job',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    bambuTaskId: text('bambu_task_id').unique(),
    printerId: text('printer_id').references(() => printer.id),
    jobName: text('job_name').notNull().default(''),
    startedAt: integer('started_at'),
    endedAt: integer('ended_at'),
    durationMin: real('duration_min'),
    outcome: text('outcome').notNull().default('unknown'),
    usageStatus: text('usage_status').notNull().default('unknown'),
    // Fulfillment link to a work-order line (Stage 2); null when unassigned.
    workOrderLineId: text('work_order_line_id').references(() => workOrderLine.id),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    check('job_source_ck', sql`${t.source} IN ('task_sync','telemetry','manual')`),
    check('job_outcome_ck', sql`${t.outcome} IN ('success','failed','cancelled','unknown')`),
    check(
      'job_usage_status_ck',
      sql`${t.usageStatus} IN ('reported','estimated','unknown','manual')`,
    ),
    index('job_printer_started_idx').on(t.printerId, sql`${t.startedAt} DESC`),
    index('job_outcome_idx').on(t.outcome),
  ],
);

/** filament_usage — the idempotency anchor (FR-402, ADR-009 §3). */
export const filamentUsage = sqliteTable(
  'filament_usage',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => printJob.id),
    slotRef: text('slot_ref').notNull(),
    spoolId: text('spool_id').references(() => spool.id),
    usedG: real('used_g'),
    usedMm: real('used_mm'),
    estimated: integer('estimated').notNull().default(0),
    attributed: integer('attributed').notNull().default(0),
    // References the LIVE consumption entry; repointed inside FR-405 corrections.
    ledgerEntryId: text('ledger_entry_id')
      .references(() => spoolLedgerEntry.id)
      .unique(),
  },
  (t) => [
    check('usage_used_g_ck', sql`${t.usedG} IS NULL OR ${t.usedG} >= 0`),
    // ADR-009 constraint (a): at most one usage row per (job, slot).
    uniqueIndex('usage_job_slot_uq').on(t.jobId, t.slotRef),
    index('usage_job_idx').on(t.jobId),
    index('usage_spool_idx').on(t.spoolId),
  ],
);

/** cost_rate_settings — singleton (FR-403). */
export const costRateSettings = sqliteTable(
  'cost_rate_settings',
  {
    id: text('id').primaryKey(),
    energyPricePerKwhMinor: integer('energy_price_per_kwh_minor'),
    machineRatePerHourMinor: integer('machine_rate_per_hour_minor'),
    laborRatePerHourMinor: integer('labor_rate_per_hour_minor'),
    defaultMarkupPct: real('default_markup_pct'),
    defaultPowerDrawW: integer('default_power_draw_w'),
    currencyCode: text('currency_code').notNull().default('NOK'),
  },
  (t) => [
    check(
      'crs_energy_ck',
      sql`${t.energyPricePerKwhMinor} IS NULL OR ${t.energyPricePerKwhMinor} >= 0`,
    ),
    check(
      'crs_machine_ck',
      sql`${t.machineRatePerHourMinor} IS NULL OR ${t.machineRatePerHourMinor} >= 0`,
    ),
  ],
);

/** printer_power_draw (FR-403 AC-403.1). */
export const printerPowerDraw = sqliteTable(
  'printer_power_draw',
  {
    printerId: text('printer_id')
      .primaryKey()
      .references(() => printer.id),
    watts: real('watts').notNull(),
  },
  (t) => [check('ppd_watts_ck', sql`${t.watts} > 0`)],
);

/** cost_calculation — immutable snapshot (FR-404). */
export const costCalculation = sqliteTable('cost_calculation', {
  id: text('id').primaryKey(),
  jobId: text('job_id')
    .notNull()
    .references(() => printJob.id),
  calculatedAt: integer('calculated_at').notNull(),
  filamentCostMinor: integer('filament_cost_minor').notNull(),
  energyCostMinor: integer('energy_cost_minor'),
  machineCostMinor: integer('machine_cost_minor'),
  totalCostMinor: integer('total_cost_minor').notNull(),
  incomplete: integer('incomplete').notNull().default(0),
  inputsSnapshotJson: text('inputs_snapshot_json').notNull(),
  superseded: integer('superseded').notNull().default(0),
});
