import { type Logger, pino } from 'pino';

/**
 * Pino instance with secret-redaction serializers (NFR-SE-05). Strips
 * password / token / cookie / authorization from any logged object.
 */
export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'password',
        'newPassword',
        'currentPassword',
        'token',
        'accessToken',
        'refreshToken',
        'access_token',
        'refresh_token',
        '*.password',
        '*.token',
        'req.headers.cookie',
        'req.headers.authorization',
        'headers.cookie',
        'headers.authorization',
      ],
      censor: '[REDACTED]',
    },
  });
}

export type { Logger };
