import type { TelemetrySnapshot } from '@geekbox/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/query-keys';
import { DataFreshness } from '../components/data/DataFreshness';
import { PrinterCard } from '../components/feature/PrinterCard';
import { computeFreshness, type FreshnessState } from '../lib/freshness';

/**
 * m5 DataFreshness gate (frontend spec §12.5) — STANDING REQUIRED CI GATE.
 *
 * Proves:
 *  (1) presence — every live-value container renders a descendant carrying
 *      [data-freshness][data-captured-at] exposed as role="status";
 *  (2) state — with a FROZEN clock, at ages 9s/11s/90s/121s the computed
 *      data-freshness resolves correctly; a 90s-old value is aging/stale,
 *      NEVER `fresh`.
 */

const NOW = Date.UTC(2026, 7, 5, 12, 0, 0); // frozen reference instant

function capturedAtAgeSec(ageSec: number): string {
  return new Date(NOW - ageSec * 1000).toISOString();
}

describe('m5: DataFreshness pure computation (frozen clock)', () => {
  const cases: Array<{ ageSec: number; expected: FreshnessState }> = [
    { ageSec: 9, expected: 'fresh' },
    { ageSec: 11, expected: 'aging' },
    { ageSec: 90, expected: 'aging' },
    { ageSec: 121, expected: 'stale' },
  ];

  for (const { ageSec, expected } of cases) {
    it(`age=${ageSec}s → ${expected}`, () => {
      const { state } = computeFreshness({ capturedAt: capturedAtAgeSec(ageSec), now: NOW });
      expect(state).toBe(expected);
    });
  }

  it('boundary: exactly 10s is fresh, exactly 120s is aging (inclusive lower boundary)', () => {
    expect(computeFreshness({ capturedAt: capturedAtAgeSec(10), now: NOW }).state).toBe('fresh');
    expect(computeFreshness({ capturedAt: capturedAtAgeSec(120), now: NOW }).state).toBe('aging');
  });

  it('a 90s-old value can NEVER be fresh (the PrinterCard threshold=120 regression)', () => {
    const { state } = computeFreshness({ capturedAt: capturedAtAgeSec(90), now: NOW });
    expect(state).not.toBe('fresh');
    expect(['aging', 'stale']).toContain(state);
  });

  it('priority: error > offline > age', () => {
    expect(computeFreshness({ capturedAt: capturedAtAgeSec(1), now: NOW, error: true }).state).toBe(
      'error',
    );
    expect(
      computeFreshness({ capturedAt: capturedAtAgeSec(1), now: NOW, connected: false }).state,
    ).toBe('offline');
  });
});

describe('m5: DataFreshness element (presence + attributes)', () => {
  const states: Array<{ ageSec: number; expected: FreshnessState }> = [
    { ageSec: 9, expected: 'fresh' },
    { ageSec: 11, expected: 'aging' },
    { ageSec: 90, expected: 'aging' },
    { ageSec: 121, expected: 'stale' },
  ];

  for (const { ageSec, expected } of states) {
    it(`renders role=status + data-freshness="${expected}" + data-captured-at at age ${ageSec}s`, () => {
      const capturedAt = capturedAtAgeSec(ageSec);
      render(<DataFreshness capturedAt={capturedAt} now={NOW} />);
      const el = screen.getByRole('status');
      expect(el).toHaveAttribute('data-freshness', expected);
      expect(el).toHaveAttribute('data-captured-at', capturedAt);
    });
  }

  it('a 90s value in the element is never data-freshness="fresh"', () => {
    render(<DataFreshness capturedAt={capturedAtAgeSec(90)} now={NOW} />);
    expect(screen.getByRole('status')).not.toHaveAttribute('data-freshness', 'fresh');
  });
});

describe('m5: every live container has a conforming freshness descendant (PrinterCard)', () => {
  // Freeze the real clock so PrinterCard's internal DataFreshness (which reads the
  // live clock, not a `now` prop) computes ages against the same frozen instant.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  function renderPrinterCard(snapshot: TelemetrySnapshot) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Seed telemetry so the card renders synchronously without a network call.
    qc.setQueryData(queryKeys.printers.telemetry('p1'), snapshot);
    return render(
      <QueryClientProvider client={qc}>
        <PrinterCard
          printer={{
            id: 'p1',
            serial: 'SN-1',
            name: 'X1C',
            model: 'X1 Carbon',
            registration: 'discovered',
            tracked: true,
            online: true,
            lastSeenAt: null,
          }}
        />
      </QueryClientProvider>,
    );
  }

  function snapshot(ageSec: number): TelemetrySnapshot {
    return {
      printerId: 'p1',
      capturedAt: capturedAtAgeSec(ageSec),
      printerState: 'printing',
      taskName: 'benchy.3mf',
      progressPct: 42,
      currentLayer: 100,
      totalLayers: 240,
      remainingTimeMin: 33,
      nozzleTempC: 220,
      bedTempC: 60,
      chamberTempC: null,
      ams: null,
    };
  }

  it('PrinterCard (a live value container) exposes [data-freshness][data-captured-at] role=status', () => {
    const { container } = renderPrinterCard(snapshot(5));
    const freshnessEls = container.querySelectorAll('[data-freshness][data-captured-at]');
    expect(freshnessEls.length).toBeGreaterThan(0);
    const status = within(container as HTMLElement).getAllByRole('status');
    // At least one status node is the freshness element with both attributes.
    expect(
      status.some((n) => n.hasAttribute('data-freshness') && n.hasAttribute('data-captured-at')),
    ).toBe(true);
  });

  it('a 90s-old telemetry snapshot renders the card as aging/stale, never fresh', () => {
    const { container } = renderPrinterCard(snapshot(90));
    const el = container.querySelector('[data-freshness]');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('data-freshness')).not.toBe('fresh');
    expect(['aging', 'stale']).toContain(el?.getAttribute('data-freshness'));
  });
});
