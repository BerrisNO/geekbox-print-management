import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Zod-validated environment contract (impl-spec §3). Fails fast on missing/invalid.
 */
const base64OrHex32 = z.string().refine(
  (v) => {
    // Accept a base64 or hex string that decodes to exactly 32 bytes.
    try {
      const asHex = /^[0-9a-fA-F]+$/.test(v) && v.length === 64;
      if (asHex) return true;
      const buf = Buffer.from(v, 'base64');
      return buf.length === 32;
    } catch {
      return false;
    }
  },
  { message: 'TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64-char hex)' },
);

const envSchema = z.object({
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: base64OrHex32,
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(8080),
  DB_PATH: z.string().default('/data/geekbox.sqlite'),
  BACKUP_DIR: z.string().default('/data/backups'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MQTT_REGION: z.string().optional(),
  // Set the session cookie's Secure flag. Defaults to true in production. Browsers
  // drop Secure cookies over plain HTTP, so set COOKIE_SECURE=false when serving the
  // app over HTTP on a trusted LAN (put a TLS reverse proxy in front for HTTPS).
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
});

export type AppConfig = {
  sessionSecret: string;
  tokenEncryptionKey: Buffer;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  dbPath: string;
  /** Directory for cached Bambu cover images, alongside the DB (e.g. /data/covers). */
  coversDir: string;
  backupDir: string;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  mqttRegionOverride: string | undefined;
  cookieSecure: boolean;
};

function decodeKey(v: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  return Buffer.from(v, 'base64');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  return {
    sessionSecret: e.SESSION_SECRET,
    tokenEncryptionKey: decodeKey(e.TOKEN_ENCRYPTION_KEY),
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    dbPath: e.DB_PATH,
    coversDir: join(dirname(e.DB_PATH), 'covers'),
    backupDir: e.BACKUP_DIR,
    logLevel: e.LOG_LEVEL,
    mqttRegionOverride: e.MQTT_REGION,
    cookieSecure:
      e.COOKIE_SECURE !== undefined ? e.COOKIE_SECURE === 'true' : e.NODE_ENV === 'production',
  };
}
