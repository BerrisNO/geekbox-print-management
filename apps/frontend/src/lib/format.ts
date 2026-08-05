import { DEFAULT_CURRENCY_CODE } from '@geekbox/shared';

/**
 * Display formatters (spec §10). Money is stored in integer minor units;
 * weights in grams. `Intl.NumberFormat` drives currency; monospace at call site.
 */

/** Format integer minor units as a currency string (display-only). */
export function formatMoney(
  minor: number | null | undefined,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
): string {
  if (minor === null || minor === undefined) return '—';
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    // Unknown currency code — fall back to plain number + code.
    return `${major.toFixed(2)} ${currencyCode}`;
  }
}

/**
 * Convert stored integer minor units to a MAJOR-unit value for a price input
 * field (NOK, decimals allowed). Returns undefined for null/undefined so the
 * input renders empty rather than 0.
 */
export function minorToMajorInput(minor: number | null | undefined): number | undefined {
  return minor == null ? undefined : minor / 100;
}

/**
 * Convert a typed MAJOR-unit price (NOK) to integer minor units for the API
 * payload. Empty/non-finite input yields undefined (field omitted).
 */
export function majorToMinor(major: number | string | null | undefined): number | undefined {
  if (major === null || major === undefined || major === '') return undefined;
  const n = typeof major === 'string' ? Number(major) : major;
  if (!Number.isFinite(n)) return undefined;
  return Math.round(n * 100);
}

/** Format grams with fixed decimals. */
export function formatGrams(g: number | null | undefined, decimals = 1): string {
  if (g === null || g === undefined) return '—';
  return `${g.toFixed(decimals)} g`;
}

/** Format a 0–100 percentage. */
export function formatPct(pct: number | null | undefined, decimals = 0): string {
  if (pct === null || pct === undefined) return '—';
  return `${pct.toFixed(decimals)}%`;
}

/** Minutes → "1h 23m" / "45m". */
export function formatDuration(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—';
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/** ISO date/date-time → localized date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d);
}

/** ISO date-time → localized date + time. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Show a plain string or an em-dash for null/empty. */
export function orDash(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}
