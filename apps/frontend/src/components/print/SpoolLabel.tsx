import type { Spool } from '@geekbox/shared';
import { QRCodeSVG } from 'qrcode.react';

const SWATCH_FALLBACK = '#e5e7eb';

/**
 * Pick a readable foreground (#000 / #fff) for text drawn on top of `hex`,
 * based on relative luminance. Falls back to black when hex is null/invalid.
 */
export function readableOn(hex: string | null): '#000' | '#fff' {
  if (!hex) return '#000';
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m?.[1]) return '#000';
  const short = m[1];
  const h = short.length === 3 ? short.replace(/./g, (c) => c + c) : short;
  const r = Number.parseInt(h.slice(0, 2), 16) / 255;
  const g = Number.parseInt(h.slice(2, 4), 16) / 255;
  const b = Number.parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5 ? '#000' : '#fff';
}

/** Weight in grams → "1 kg" / "1.25 kg" / "750 g". */
function formatWeightKg(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 ? 2 : 0)} kg`;
  return `${g} g`;
}

/**
 * Bambu-inspired printable spool label, fixed at 70mm x 40mm. Display-only:
 * a color swatch (left), key product/weight info (right) and a QR code
 * linking back to the spool-detail page.
 */
export function SpoolLabel({ spool }: { spool: Spool }) {
  const { product } = spool;
  const swatch = product.colorHex ?? SWATCH_FALLBACK;
  const swatchText = readableOn(product.colorHex);
  const heading = product.category ?? product.material;
  const showBaseMaterial = product.category !== null && product.category !== product.material;
  const weightKg = formatWeightKg(spool.initialNetWeightG);
  const detailUrl = `${window.location.origin}/inventory/spools/${spool.id}`;

  return (
    <div
      style={{
        width: '70mm',
        height: '40mm',
        display: 'flex',
        boxSizing: 'border-box',
        border: '1px solid #000',
        borderRadius: '2mm',
        overflow: 'hidden',
        background: '#fff',
        color: '#000',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        breakInside: 'avoid',
      }}
    >
      {/* Color swatch (~40% width) */}
      <div
        style={{
          width: '40%',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '2mm',
          background: swatch,
          color: swatchText,
        }}
      >
        <span
          style={{
            fontSize: '3.2mm',
            fontWeight: 700,
            lineHeight: 1.1,
            wordBreak: 'break-word',
          }}
        >
          {product.colorName}
        </span>
      </div>

      {/* Info panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '2mm',
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {product.manufacturer ? (
            <div
              style={{
                fontSize: '2.6mm',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.2mm',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {product.manufacturer}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '1mm',
              fontSize: '5mm',
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            <span>{heading}</span>
            {showBaseMaterial ? (
              <span style={{ fontSize: '2.8mm', fontWeight: 600, opacity: 0.7 }}>
                {product.material}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: '2.8mm', marginTop: '0.5mm' }}>{product.colorName}</div>
          <div style={{ fontSize: '2.8mm', fontWeight: 600 }}>
            {weightKg} · {product.diameterMm} mm
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '2.4mm',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {spool.label}
          </span>
          <QRCodeSVG value={detailUrl} size={72} level="M" marginSize={0} />
        </div>
      </div>
    </div>
  );
}
