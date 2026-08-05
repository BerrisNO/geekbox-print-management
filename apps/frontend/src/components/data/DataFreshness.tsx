import { AlertTriangle, Circle, Clock, WifiOff, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import {
  computeFreshness,
  FRESH_MAX_SEC_DEFAULT,
  type FreshnessState,
  relativeTime,
  STALE_MIN_SEC_DEFAULT,
  subscribeClock,
} from '../../lib/freshness';

/**
 * The m5 element (frontend spec §7.3 / §12.5).
 *
 * Renders freshness/staleness for every live value. Emits `data-freshness`
 * (fresh|aging|stale|offline|error), `data-captured-at` (ISO-8601) and
 * `role="status"`. Ticks via the shared 1s clock (one timer app-wide).
 *
 * Two named boundaries: freshMaxSec (default 10) and staleMinSec (default 120).
 * Because freshMaxSec < staleMinSec, a value older than 10s can NEVER be `fresh`.
 */

export interface DataFreshnessProps {
  capturedAt: string;
  freshMaxSec?: number;
  staleMinSec?: number;
  connected?: boolean;
  error?: boolean;
  /** Compact mode hides the label text (icon + a11y text only). */
  compact?: boolean;
  className?: string;
  /** Test seam: freeze "now". Production leaves undefined → live clock. */
  now?: number;
}

const ICON: Record<FreshnessState, React.ComponentType<{ className?: string }>> = {
  fresh: Circle,
  aging: Clock,
  stale: AlertTriangle,
  offline: WifiOff,
  error: XCircle,
};

const COLOR: Record<FreshnessState, string> = {
  fresh: 'text-[var(--color-status-fresh)]',
  aging: 'text-muted-foreground',
  stale: 'text-[var(--color-status-stale)]',
  offline: 'text-[var(--color-status-offline)]',
  error: 'text-[var(--color-status-error)]',
};

function labelFor(state: FreshnessState, ageSec: number): string {
  const rel = relativeTime(ageSec);
  switch (state) {
    case 'fresh':
      return rel;
    case 'aging':
      return `aging — ${rel}`;
    case 'stale':
      return `stale — ${rel}`;
    case 'offline':
      return Number.isFinite(ageSec) ? `offline — last seen ${rel}` : 'offline';
    case 'error':
      return 'error';
  }
}

export function DataFreshness({
  capturedAt,
  freshMaxSec = FRESH_MAX_SEC_DEFAULT,
  staleMinSec = STALE_MIN_SEC_DEFAULT,
  connected,
  error,
  compact,
  className,
  now: frozenNow,
}: DataFreshnessProps) {
  const [now, setNow] = useState<number>(frozenNow ?? Date.now());

  useEffect(() => {
    if (frozenNow !== undefined) return; // frozen clock (tests) — do not tick.
    return subscribeClock((t) => setNow(t));
  }, [frozenNow]);

  const { state, ageSec } = computeFreshness({
    capturedAt,
    now,
    freshMaxSec,
    staleMinSec,
    connected,
    error,
  });

  const Icon = ICON[state];
  const label = labelFor(state, ageSec);

  return (
    // biome-ignore lint/a11y/useSemanticElements: span with role="status" is the design-spec contract asserted by the m5 freshness test
    <span
      role="status"
      data-freshness={state}
      data-captured-at={capturedAt}
      title={`Updated ${label}`}
      className={cn('inline-flex items-center gap-1 text-xs', COLOR[state], className)}
    >
      <Icon className="size-3" aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </span>
  );
}
