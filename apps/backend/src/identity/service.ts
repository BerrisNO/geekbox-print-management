import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { userAccount } from '../db/schema/identity.js';
import {
  ConflictError,
  ForbiddenError,
  ThrottledError,
  UnauthorizedError,
} from '../shared/errors/index.js';
import { newId, nowMs } from '../shared/ids.js';
import { currentDummyHash, hashPassword, verifyPassword, warmDummyHash } from './password.js';
import { SessionService } from './session.js';
import { LoginThrottle } from './throttle.js';

export class IdentityService {
  private readonly throttle = new LoginThrottle();

  constructor(
    private readonly db: Db,
    readonly sessions: SessionService,
  ) {
    // Warm the timing-parity dummy hash so the first unknown-user login is already
    // constant-time (fire-and-forget; falls back to the static hash until ready).
    void warmDummyHash();
  }

  accountExists(): boolean {
    const row = this.db.select({ id: userAccount.id }).from(userAccount).get();
    return row !== undefined;
  }

  /** First-run setup (AC-001.3) — only while no account exists. Returns a session token. */
  async setup(
    username: string,
    password: string,
  ): Promise<{ token: string; expiresAt: number; username: string }> {
    if (this.accountExists()) {
      throw new ConflictError('ACCOUNT_EXISTS', 'An account already exists');
    }
    const id = newId();
    const now = nowMs();
    const passwordHash = await hashPassword(password);
    this.db
      .insert(userAccount)
      .values({ id, username, passwordHash, createdAt: now, updatedAt: now })
      .run();
    const { token, expiresAt } = this.sessions.issue(id);
    return { token, expiresAt, username };
  }

  /**
   * Login (FR-001). Generic errors (AC-001.2), throttled per source key (ES-001.1).
   *
   * @param throttleKey stable per-attempt key (source IP) so the brute-force
   *   limiter cannot be turned into a self-DoS against the sole operator (MR-003).
   */
  async login(
    username: string,
    password: string,
    throttleKey?: string,
  ): Promise<{ token: string; expiresAt: number }> {
    const key = throttleKey ?? 'unknown';
    const retryAfter = this.throttle.check(key);
    if (retryAfter > 0) {
      throw new ThrottledError(retryAfter, 'Too many failed attempts');
    }
    const user = this.db.select().from(userAccount).where(eq(userAccount.username, username)).get();
    // Constant-time-ish: ALWAYS run an argon2 verify — against the real hash when
    // the user exists, otherwise against a fixed dummy hash — so the response time
    // and shape do not leak whether the username exists (CWE-208/307 timing/
    // enumeration oracle, SEC-002/MR-003). The dummy verify result is discarded.
    let ok: boolean;
    if (user) {
      ok = await verifyPassword(user.passwordHash, password);
    } else {
      // Burn an equivalent argon2 verify so timing does not reveal a missing user.
      await verifyPassword(currentDummyHash(), password);
      ok = false;
    }
    if (!user || !ok) {
      this.throttle.recordFailure(key);
      // Identical generic error for both unknown-user and wrong-password (AC-001.2).
      throw new UnauthorizedError('Invalid credentials');
    }
    this.throttle.recordSuccess(key);
    const { token, expiresAt } = this.sessions.issue(user.id);
    return { token, expiresAt };
  }

  logout(token: string): void {
    this.sessions.revoke(token);
  }

  /** Change password (FR-003). Requires current password; invalidates other sessions. */
  async changePassword(
    userId: string,
    currentToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = this.db.select().from(userAccount).where(eq(userAccount.id, userId)).get();
    if (!user) throw new UnauthorizedError();
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) throw new ForbiddenError('Current password is incorrect');
    const passwordHash = await hashPassword(newPassword);
    this.db
      .update(userAccount)
      .set({ passwordHash, updatedAt: nowMs() })
      .where(eq(userAccount.id, userId))
      .run();
    this.sessions.revokeAllExcept(userId, currentToken);
  }
}
