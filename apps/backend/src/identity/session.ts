import { createHash, randomBytes } from 'node:crypto';
import { and, eq, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { session, userAccount } from '../db/schema/identity.js';
import { newId, nowMs } from '../shared/ids.js';

export const SESSION_COOKIE = 'gbx_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // sliding 7-day inactivity

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class SessionService {
  constructor(private readonly db: Db) {}

  /** Issue a new opaque session token and persist its hash. Returns the raw token for the cookie. */
  issue(userId: string): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('hex');
    const now = nowMs();
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .insert(session)
      .values({
        tokenHash: hashToken(token),
        userId,
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
      })
      .run();
    return { token, expiresAt };
  }

  /** Validate a raw token; slides expiry on success. Returns the username or null. */
  validate(token: string): { userId: string; username: string; expiresAt: number } | null {
    const tokenHash = hashToken(token);
    const row = this.db
      .select({
        userId: session.userId,
        expiresAt: session.expiresAt,
        username: userAccount.username,
      })
      .from(session)
      .innerJoin(userAccount, eq(userAccount.id, session.userId))
      .where(eq(session.tokenHash, tokenHash))
      .get();
    if (!row) return null;
    const now = nowMs();
    if (row.expiresAt < now) {
      this.db.delete(session).where(eq(session.tokenHash, tokenHash)).run();
      return null;
    }
    const expiresAt = now + SESSION_TTL_MS;
    this.db
      .update(session)
      .set({ lastSeenAt: now, expiresAt })
      .where(eq(session.tokenHash, tokenHash))
      .run();
    return { userId: row.userId, username: row.username, expiresAt };
  }

  revoke(token: string): void {
    this.db
      .delete(session)
      .where(eq(session.tokenHash, hashToken(token)))
      .run();
  }

  /** Delete all sessions for a user except the given one (password change, FR-003). */
  revokeAllExcept(userId: string, keepToken: string): void {
    this.db
      .delete(session)
      .where(and(eq(session.userId, userId), ne(session.tokenHash, hashToken(keepToken))))
      .run();
  }

  /** Sweep expired sessions (called periodically). */
  sweepExpired(): void {
    this.db.delete(session).where(lt(session.expiresAt, nowMs())).run();
  }
}

export { hashToken, newId };
