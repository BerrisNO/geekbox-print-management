import type { JobOutcome, PoStatus, PrinterState, SpoolStatus } from '@geekbox/shared';
import {
  Ban,
  Box,
  CheckCircle2,
  CircleDashed,
  CirclePause,
  HelpCircle,
  PackageCheck,
  Pencil,
  Play,
  Power,
  Printer as PrinterIcon,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge, type BadgeProps } from '../ui/badge';

/** Filament color swatch with adjacent name (never color alone — WCAG 1.4.1). */
export function ColorSwatch({
  hex,
  name,
  className,
}: {
  hex: string | null;
  name?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-block size-3.5 shrink-0 rounded-full border border-border"
        style={{ backgroundColor: hex ?? 'transparent' }}
        title={name ?? hex ?? 'no color'}
        aria-hidden
      />
      {name ? <span>{name}</span> : null}
    </span>
  );
}

const SPOOL_STATUS: Record<SpoolStatus, { variant: BadgeProps['variant']; icon: typeof Box; label: string }> = {
  in_stock: { variant: 'info', icon: Box, label: 'In stock' },
  in_use: { variant: 'primary', icon: Play, label: 'In use' },
  depleted: { variant: 'neutral', icon: CircleDashed, label: 'Depleted' },
  archived: { variant: 'neutral', icon: Ban, label: 'Archived' },
};

export function SpoolStatusPill({ status }: { status: SpoolStatus }) {
  const s = SPOOL_STATUS[status];
  return <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>;
}

const PO_STATUS: Record<PoStatus, { variant: BadgeProps['variant']; icon: typeof Box; label: string }> = {
  draft: { variant: 'neutral', icon: Pencil, label: 'Draft' },
  ordered: { variant: 'info', icon: Truck, label: 'Ordered' },
  partially_received: { variant: 'warning', icon: PackageCheck, label: 'Partial' },
  received: { variant: 'success', icon: CheckCircle2, label: 'Received' },
  cancelled: { variant: 'neutral', icon: Ban, label: 'Cancelled' },
};

export function PoStatusPill({ status }: { status: PoStatus }) {
  const s = PO_STATUS[status];
  return <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>;
}

const OUTCOME: Record<JobOutcome, { variant: BadgeProps['variant']; icon: typeof Box; label: string }> = {
  success: { variant: 'success', icon: CheckCircle2, label: 'Success' },
  failed: { variant: 'danger', icon: XCircle, label: 'Failed' },
  cancelled: { variant: 'neutral', icon: Ban, label: 'Cancelled' },
  unknown: { variant: 'neutral', icon: HelpCircle, label: 'Unknown' },
};

export function JobOutcomePill({ outcome }: { outcome: JobOutcome }) {
  const s = OUTCOME[outcome];
  return <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>;
}

const PRINTER_STATE: Record<
  PrinterState,
  { variant: BadgeProps['variant']; icon: typeof Box; label: string }
> = {
  idle: { variant: 'neutral', icon: PrinterIcon, label: 'Idle' },
  printing: { variant: 'primary', icon: Play, label: 'Printing' },
  paused: { variant: 'warning', icon: CirclePause, label: 'Paused' },
  error: { variant: 'danger', icon: XCircle, label: 'Error' },
  offline: { variant: 'neutral', icon: Power, label: 'Offline' },
  unknown: { variant: 'neutral', icon: HelpCircle, label: 'Unknown' },
};

export function PrinterStatePill({ state }: { state: PrinterState }) {
  const s = PRINTER_STATE[state];
  return <Badge variant={s.variant} icon={s.icon}>{s.label}</Badge>;
}
