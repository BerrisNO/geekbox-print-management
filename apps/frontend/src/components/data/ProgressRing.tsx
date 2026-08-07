/**
 * Circular remaining-percentage ring (AMS filament visualization). The arc is drawn
 * in the filament's own color when known, so a slot's ring matches its spool.
 */
export function ProgressRing({
  pct,
  color,
  size = 46,
  stroke = 5,
  label,
}: {
  pct: number | null | undefined;
  /** Arc color (e.g. the filament's colorHex). Falls back to the theme accent. */
  color?: string | null;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(pct ?? 0)));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label ?? `${p}% remaining`}
      className="shrink-0"
    >
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="var(--color-surface-muted)"
        strokeWidth={stroke}
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color || 'var(--color-primary)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ - dash}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-current font-medium text-[11px]"
      >
        {p}%
      </text>
    </svg>
  );
}
