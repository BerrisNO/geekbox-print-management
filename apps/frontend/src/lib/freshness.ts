/**
 * Freshness computation + shared clock (frontend spec §7.3 / §12.5, the m5 gate).
 *
 * Two named boundaries — never a single ambiguous threshold:
 *   freshMaxSec = 10  (NFR-PE-02 live budget)
 *   staleMinSec = 120 (FR-304 stale line)
 *
 * Five-value state resolved in strict priority order:
 *   1. error   — load/parse failure
 *   2. offline — connected === false
 *   3. fresh   — age <= freshMaxSec
 *   4. aging   — freshMaxSec < age <= staleMinSec
 *   5. stale   — age > staleMinSec
 *
 * Because freshMaxSec (10) < staleMinSec (120), a value older than 10s can NEVER
 * resolve to `fresh`.
 */

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'offline' | 'error';

export const FRESH_MAX_SEC_DEFAULT = 10;
export const STALE_MIN_SEC_DEFAULT = 120;

export interface FreshnessInput {
  capturedAt: string;
  /** Reference "now" in ms; injectable for tests (frozen clock). */
  now?: number;
  freshMaxSec?: number;
  staleMinSec?: number;
  connected?: boolean;
  error?: boolean;
}

export interface FreshnessResult {
  state: FreshnessState;
  ageSec: number;
}

export function computeFreshness(input: FreshnessInput): FreshnessResult {
  const {
    capturedAt,
    now = Date.now(),
    freshMaxSec = FRESH_MAX_SEC_DEFAULT,
    staleMinSec = STALE_MIN_SEC_DEFAULT,
    connected,
    error,
  } = input;

  const capturedMs = new Date(capturedAt).getTime();
  const ageSec = Number.isNaN(capturedMs) ? Number.POSITIVE_INFINITY : (now - capturedMs) / 1000;

  // Priority 1: explicit error (also covers an unparseable capturedAt).
  if (error || Number.isNaN(capturedMs)) return { state: 'error', ageSec };
  // Priority 2: offline.
  if (connected === false) return { state: 'offline', ageSec };
  // Priority 3–5: age-based.
  if (ageSec <= freshMaxSec) return { state: 'fresh', ageSec };
  if (ageSec <= staleMinSec) return { state: 'aging', ageSec };
  return { state: 'stale', ageSec };
}

/** Human relative-time label, e.g. "3s ago", "40s ago", "4m ago", "2h ago". */
export function relativeTime(ageSec: number): string {
  if (!Number.isFinite(ageSec)) return 'unknown';
  const s = Math.max(0, Math.round(ageSec));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/* --------------------------------------------------------------------------
   Shared 1s clock — one timer app-wide (spec §13 performance rule).
-------------------------------------------------------------------------- */

type Listener = (now: number) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

function ensureTimer(): void {
  if (timer !== null) return;
  timer = setInterval(() => {
    const now = Date.now();
    for (const fn of listeners) fn(now);
  }, 1000);
}

export function subscribeClock(fn: Listener): () => void {
  listeners.add(fn);
  ensureTimer();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
