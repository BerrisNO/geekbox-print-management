import argon2 from 'argon2';

/** argon2id password hashing (NFR-SE-01, ADR-007). Uses library defaults (>= OWASP baseline). */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * A fixed argon2id hash of an arbitrary constant, used to run a "dummy" verify on
 * the unknown-user login branch so response timing does not reveal whether a
 * username exists (CWE-208/307 enumeration/timing oracle — SEC-002/MR-003). It is
 * generated with the SAME parameters as {@link hashPassword} so the burned verify
 * costs the same as a real one. Lazily computed once and cached.
 */
let dummyHashCache: string | null = null;
let dummyHashPromise: Promise<string> | null = null;

/**
 * Synchronous accessor for the dummy hash. Returns a precomputed argon2id hash
 * (generated with the current default parameters) until the runtime-computed one
 * — which is guaranteed to match hashPassword's exact params — resolves and
 * replaces it. Both are valid argon2id hashes, so the verify cost is representative
 * either way; the runtime value simply keeps timing parity if defaults change.
 */
export const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$z5M/S3KTmtuqHU2Qr4UmGA$6fm6huGYgPIXYx8qnAIg49Rb2CVJHZ+iGi7lvwgnhds';

/**
 * Ensures the dummy hash is computed with the live hashPassword parameters so the
 * unknown-user verify is timing-equivalent even if argon2 defaults change. Call
 * once at startup (fire-and-forget); until it resolves, DUMMY_ARGON2_HASH is used.
 */
export async function warmDummyHash(): Promise<string> {
  if (dummyHashCache) return dummyHashCache;
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('geekbox-dummy-verify-constant').then((h) => {
      dummyHashCache = h;
      return h;
    });
  }
  return dummyHashPromise;
}

/** The best available dummy hash: the warmed one if ready, else the static fallback. */
export function currentDummyHash(): string {
  return dummyHashCache ?? DUMMY_ARGON2_HASH;
}
