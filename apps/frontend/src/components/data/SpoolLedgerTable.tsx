import type { LedgerEntry, LedgerEntryType } from '@geekbox/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { formatDateTime, formatGrams, orDash } from '../../lib/format';
import { Badge, type BadgeProps } from '../ui/badge';
import { DataTable } from './DataTable';

const TYPE_LABEL: Record<LedgerEntryType, { label: string; variant: BadgeProps['variant'] }> = {
  initial: { label: 'Initial', variant: 'info' },
  consumption: { label: 'Consumption', variant: 'neutral' },
  manual_adjustment: { label: 'Adjustment', variant: 'warning' },
  reversal: { label: 'Reversal', variant: 'primary' },
};

/** SpoolLedgerTable (organism, FR-103): newest-first, running balance, entry-type
 *  badges, over-consumption flag, estimated marker, reversal link. Virtualized
 *  for 100k-entry ledgers (NFR-PE-01). */
export function SpoolLedgerTable({
  entries,
  isLoading,
  isError,
  onRetry,
}: {
  entries: LedgerEntry[] | undefined;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const columns = useMemo<ColumnDef<LedgerEntry, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        cell: (c) => (
          <span className="whitespace-nowrap text-xs">{formatDateTime(c.getValue<string>())}</span>
        ),
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: (c) => {
          const t = TYPE_LABEL[c.getValue<LedgerEntryType>()];
          return <Badge variant={t.variant}>{t.label}</Badge>;
        },
      },
      {
        accessorKey: 'deltaG',
        header: 'Δ (g)',
        cell: (c) => {
          const d = c.getValue<number>();
          return (
            <span
              className={`font-mono ${d < 0 ? 'text-destructive' : 'text-[var(--color-status-fresh)]'}`}
            >
              {d > 0 ? '+' : ''}
              {d.toFixed(1)}
            </span>
          );
        },
      },
      {
        accessorKey: 'balanceAfterG',
        header: 'Balance (g)',
        cell: (c) => <span className="font-mono">{formatGrams(c.getValue<number>())}</span>,
      },
      {
        id: 'flags',
        header: 'Flags',
        cell: (c) => (
          <div className="flex gap-1">
            {c.row.original.overConsumption ? (
              <Badge variant="danger" icon={AlertTriangle}>
                Over
              </Badge>
            ) : null}
            {c.row.original.estimated ? <Badge>Estimated</Badge> : null}
            {c.row.original.reversesEntryId ? <Badge variant="primary">Reverses</Badge> : null}
          </div>
        ),
      },
      {
        accessorKey: 'note',
        header: 'Note',
        cell: (c) => <span className="text-xs">{orDash(c.getValue<string | null>())}</span>,
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={entries}
      isLoading={isLoading}
      isError={isError}
      onRetry={onRetry}
      virtualize={(entries?.length ?? 0) > 50}
      getRowId={(e) => e.id}
    />
  );
}
