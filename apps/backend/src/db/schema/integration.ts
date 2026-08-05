import { sql } from 'drizzle-orm';
import { blob, check, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** cloud_link — singleton (FR-301/306/307). Account password never stored. */
export const cloudLink = sqliteTable(
  'cloud_link',
  {
    id: text('id').primaryKey(),
    bambuUid: text('bambu_uid'),
    accessTokenEnc: blob('access_token_enc'),
    refreshTokenEnc: blob('refresh_token_enc'),
    state: text('state').notNull().default('unlinked'),
    authMode: text('auth_mode').notNull().default('password'),
    mqttRegion: text('mqtt_region').notNull().default('us'),
    integrationEnabled: integer('integration_enabled').notNull().default(1),
    taskSyncIntervalMin: integer('task_sync_interval_min').notNull().default(30),
    linkedAt: integer('linked_at'),
    tokenIssuedAt: integer('token_issued_at'),
    lastRestSuccessAt: integer('last_rest_success_at'),
    mqttConnectedSince: integer('mqtt_connected_since'),
    lastMqttMessageAt: integer('last_mqtt_message_at'),
    lastErrorClass: text('last_error_class'),
  },
  (t) => [
    check('cloud_link_state_ck', sql`${t.state} IN ('unlinked','linked','reauth_required')`),
    check('cloud_link_authmode_ck', sql`${t.authMode} IN ('password','manual_token')`),
  ],
);

/** printer (FR-302). */
export const printer = sqliteTable(
  'printer',
  {
    id: text('id').primaryKey(),
    serial: text('serial').notNull().unique(),
    name: text('name').notNull(),
    model: text('model'),
    registration: text('registration').notNull(),
    tracked: integer('tracked').notNull().default(1),
    onlineFlag: integer('online_flag').notNull().default(0),
    lastSeenAt: integer('last_seen_at'),
  },
  (t) => [check('printer_registration_ck', sql`${t.registration} IN ('discovered','manual')`)],
);

/** telemetry_snapshot — latest-per-printer, UPSERT on ingest (ADR-008). */
export const telemetrySnapshot = sqliteTable(
  'telemetry_snapshot',
  {
    printerId: text('printer_id')
      .primaryKey()
      .references(() => printer.id),
    capturedAt: integer('captured_at').notNull(),
    printerState: text('printer_state').notNull(),
    taskName: text('task_name'),
    progressPct: real('progress_pct'),
    currentLayer: integer('current_layer'),
    totalLayers: integer('total_layers'),
    remainingTimeMin: real('remaining_time_min'),
    nozzleTempC: real('nozzle_temp_c'),
    bedTempC: real('bed_temp_c'),
    chamberTempC: real('chamber_temp_c'),
    amsJson: text('ams_json'),
  },
  (t) => [
    check(
      'telemetry_state_ck',
      sql`${t.printerState} IN ('idle','printing','paused','error','offline','unknown')`,
    ),
  ],
);
