/**
 * Login brute-force throttle (FR-001 ES-001.1 / NFR-SE-07). Fixed-window in-memory
 * counter: after 10 failures in 15 minutes for a given key, impose a >=30s delay
 * before the next attempt from that key is accepted. In-memory is acceptable
 * (restart-reset) — it is friction, not an account-lock ledger (ADR-007).
 *
 * The counter is KEYED (default per source IP, see IdentityService) rather than a
 * single global bucket (MR-003 fix): a hostile client hammering the login endpoint
 * throttles only its own key and can no longer lock out the sole legitimate
 * operator connecting from a different address (self-DoS). Unknown/absent keys map
 * to a shared 'unknown' bucket so a missing IP header cannot bypass the limiter.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const DELAY_MS = 30 * 1000;
/** Cap the number of tracked keys so a spoofed-IP flood cannot exhaust memory. */
const MAX_KEYS = 10_000;

type Bucket = { fails: number; windowStart: number; lastFailAt: number };

const DEFAULT_KEY = 'unknown';

export class LoginThrottle {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  private bucketFor(key: string): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      // Bound memory: if the table is full, evict the oldest-window entry.
      if (this.buckets.size >= MAX_KEYS) {
        let oldestKey: string | null = null;
        let oldestWindow = Number.POSITIVE_INFINITY;
        for (const [k, v] of this.buckets) {
          if (v.windowStart < oldestWindow) {
            oldestWindow = v.windowStart;
            oldestKey = k;
          }
        }
        if (oldestKey) this.buckets.delete(oldestKey);
      }
      b = { fails: 0, windowStart: this.now(), lastFailAt: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  /** Returns retryAfterSec > 0 when the caller must wait, else 0 (allowed). */
  check(key: string = DEFAULT_KEY): number {
    const t = this.now();
    const bucket = this.bucketFor(key);
    if (t - bucket.windowStart > WINDOW_MS) {
      // window expired; reset
      this.buckets.set(key, { fails: 0, windowStart: t, lastFailAt: 0 });
      return 0;
    }
    if (bucket.fails >= MAX_FAILS) {
      const waitUntil = bucket.lastFailAt + DELAY_MS;
      const remaining = waitUntil - t;
      if (remaining > 0) return Math.ceil(remaining / 1000);
    }
    return 0;
  }

  recordFailure(key: string = DEFAULT_KEY): void {
    const t = this.now();
    const bucket = this.bucketFor(key);
    if (t - bucket.windowStart > WINDOW_MS) {
      this.buckets.set(key, { fails: 1, windowStart: t, lastFailAt: t });
    } else {
      bucket.fails += 1;
      bucket.lastFailAt = t;
    }
  }

  recordSuccess(key: string = DEFAULT_KEY): void {
    this.buckets.set(key, { fails: 0, windowStart: this.now(), lastFailAt: 0 });
  }
}
