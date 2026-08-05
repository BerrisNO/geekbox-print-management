import { describe, expect, it } from 'vitest';
import { LoginThrottle } from '../../src/identity/throttle.js';

describe('LoginThrottle (FR-001 ES-001.1 / NFR-SE-07)', () => {
  it('allows attempts under the failure cap', () => {
    const now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 9; i++) {
      expect(t.check()).toBe(0);
      t.recordFailure();
    }
    expect(t.check()).toBe(0); // 9 fails, still allowed
  });

  it('imposes a >=30s delay after 10 failures in the window', () => {
    const now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 10; i++) t.recordFailure();
    const wait = t.check();
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(30);
  });

  it('clears the delay once 30s have elapsed since the last failure', () => {
    let now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 10; i++) t.recordFailure();
    now += 31_000;
    expect(t.check()).toBe(0);
  });

  it('resets the window after 15 minutes', () => {
    let now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 10; i++) t.recordFailure();
    now += 16 * 60 * 1000;
    expect(t.check()).toBe(0);
  });

  it('recordSuccess clears the counter', () => {
    const now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 10; i++) t.recordFailure();
    t.recordSuccess();
    expect(t.check()).toBe(0);
  });

  it('throttles per key: one key locked does not affect a different key (MR-003 self-DoS fix)', () => {
    const now = 0;
    const t = new LoginThrottle(() => now);
    // Attacker floods from one IP.
    for (let i = 0; i < 10; i++) t.recordFailure('1.2.3.4');
    expect(t.check('1.2.3.4')).toBeGreaterThan(0); // attacker throttled
    // Legitimate operator from a different IP is unaffected.
    expect(t.check('10.0.0.1')).toBe(0);
  });

  it('recordSuccess only clears the counter for its own key', () => {
    const now = 0;
    const t = new LoginThrottle(() => now);
    for (let i = 0; i < 10; i++) t.recordFailure('attacker');
    for (let i = 0; i < 10; i++) t.recordFailure('victim');
    t.recordSuccess('victim');
    expect(t.check('victim')).toBe(0);
    expect(t.check('attacker')).toBeGreaterThan(0);
  });
});
