import type { Spool, SpoolType } from '@geekbox/shared';
import { useId } from 'react';

const SWATCH_FALLBACK = '#e5e7eb';

/** Weight in grams → "1 kg" / "1.25 kg" / "750 g". */
function formatWeightKg(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 ? 2 : 0)} kg`;
  return `${g} g`;
}

/** Arc caption over the color dot — mirrors Bambu's "With Spool" wording. */
const SPOOL_TYPE_ARC: Record<SpoolType, string> = {
  plastic: 'With Spool',
  cardboard: 'Cardboard',
  refill: 'Refill',
  reusable: 'Masterspool',
};

/** ISO date → compact yyyy-mm-dd for the spec table. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

/**
 * Color dot with curved captions (spool type above, color name below),
 * modeled on the Bambu Lab box label. Pure SVG so the text follows the arcs.
 */
function ColorDot({
  hex,
  colorName,
  spoolType,
}: {
  hex: string | null;
  colorName: string;
  spoolType: SpoolType;
}) {
  const uid = useId();
  const topArc = `arc-top-${uid}`;
  const bottomArc = `arc-bot-${uid}`;
  return (
    <svg
      viewBox="0 0 100 100"
      style={{ width: '16mm', height: '16mm', flexShrink: 0 }}
      role="img"
      aria-label={`${colorName} (${SPOOL_TYPE_ARC[spoolType]})`}
    >
      <defs>
        {/* Left→right over the top = readable "frown" arc. */}
        <path id={topArc} d="M 13,50 A 37,37 0 0 1 87,50" fill="none" />
        {/* Left→right under the bottom = readable "smile" arc. */}
        <path id={bottomArc} d="M 14,50 A 36,36 0 0 0 86,50" fill="none" />
      </defs>
      <circle cx="50" cy="50" r="27" fill={hex ?? SWATCH_FALLBACK} stroke="#000" strokeWidth="1" />
      <text fontSize="12.5" fontWeight="600" fill="#000" fontFamily="ui-sans-serif, system-ui">
        <textPath href={`#${topArc}`} startOffset="50%" textAnchor="middle">
          {SPOOL_TYPE_ARC[spoolType]}
        </textPath>
      </text>
      <text fontSize="12.5" fontWeight="600" fill="#000" fontFamily="ui-sans-serif, system-ui">
        <textPath href={`#${bottomArc}`} startOffset="50%" textAnchor="middle">
          {colorName}
        </textPath>
      </text>
    </svg>
  );
}

/** One hairline spec row: label left, value right — like the Bambu spec table. */
function SpecRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '2mm',
        borderBottom: last ? 'none' : '0.15mm solid #ccc',
        padding: '0 0.5mm',
        flex: 1,
        minHeight: 0,
      }}
    >
      <span style={{ fontSize: '2.1mm', whiteSpace: 'nowrap' }}>{label}</span>
      <span
        style={{
          fontSize: '2.1mm',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Printable spool label styled after the Bambu Lab box label, fixed at
 * 85mm x 20mm: manufacturer + material block (left), hairline spec table
 * (middle), and a color dot with curved captions (right).
 */
export function SpoolLabel({ spool }: { spool: Spool }) {
  const { product } = spool;
  const series = product.name ?? product.category;

  return (
    <div
      style={{
        width: '85mm',
        height: '20mm',
        display: 'flex',
        alignItems: 'center',
        gap: '2mm',
        boxSizing: 'border-box',
        border: '0.3mm solid #000',
        borderRadius: '1.5mm',
        padding: '1.2mm 2mm',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        breakInside: 'avoid',
      }}
    >
      {/* Manufacturer + material block (stacked) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '21.5mm',
          flexShrink: 0,
          minWidth: 0,
        }}
      >
        {product.manufacturer ? (
          <span
            style={{
              fontSize: '2.4mm',
              fontWeight: 700,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {product.manufacturer}
          </span>
        ) : null}
        <span style={{ fontSize: '4.2mm', fontWeight: 800, lineHeight: 1.1 }}>
          {product.material}
        </span>
        {series ? (
          <span
            style={{
              fontSize: '2.4mm',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {series}
          </span>
        ) : null}
      </div>

      {/* Spec table */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'stretch',
          minWidth: 0,
          padding: '0.6mm 0',
        }}
      >
        <SpecRow label="Diameter" value={`${product.diameterMm} mm`} />
        <SpecRow label="Net Weight" value={formatWeightKg(spool.initialNetWeightG)} />
        <SpecRow label="Spool ID" value={spool.label} />
        <SpecRow label="Acquired" value={shortDate(spool.acquiredAt)} last />
      </div>

      <ColorDot
        hex={product.colorHex}
        colorName={product.colorName}
        spoolType={product.spoolType}
      />
    </div>
  );
}
