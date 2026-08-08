import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { buildContainer } from './container.js';
import { createDb } from './db/client.js';
import { runMigrations } from './db/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Entry point. Startup order (impl-spec §2.3):
 *   load+validate config → open DB → migrate → build app → listen → start supervisor.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.dbPath);

  // Migrations live next to the compiled output at ../migrations (build copies them there).
  const { applied } = runMigrations(db, join(__dirname, '..', 'migrations'));

  const container = buildContainer(config, db);
  container.log.info({ applied }, 'Migrations applied');

  // Ensure the cover-image cache directory exists before serving/downloading.
  await container.coverCache.ensureDir();

  const publicDir = join(__dirname, 'public');
  const app = await buildApp(container, { publicDir });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  container.log.info(`GeekBOX listening on :${config.port}`);

  // Start the telemetry supervisor + task-sync scheduler after boot (ADR-004).
  // Backfill a missing uid / normalize a legacy region on an existing link first,
  // so the source is built with a valid MQTT username + host.
  await container.integration.ensureLinkReady().catch(() => undefined);
  const source = container.integration.makeTelemetrySource();
  container.supervisor.configure(source);
  container.taskSync.startScheduler();

  // Periodic session sweep.
  setInterval(() => container.sessions.sweepExpired(), 60 * 60 * 1000);

  const shutdown = async (): Promise<void> => {
    container.log.info('Shutting down');
    container.taskSync.stopScheduler();
    await container.supervisor.stop();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
