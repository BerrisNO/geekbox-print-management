import type { InboundRow } from '@geekbox/shared';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Truck } from 'lucide-react';
import { useMemo } from 'react';
import { useInboundOverview } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { PoStatusPill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { EmptyState } from '../components/ui/misc';
import { formatDate, formatMoney } from '../lib/format';

/** Inbound overview (FR-204): ETA-sorted, overdue flagged, no-ETA last. */
export function InboundPage() {
  const navigate = useNavigate();
  const inbound = useInboundOverview();

  const columns = useMemo<ColumnDef<InboundRow, unknown>[]>(
    () => [
      {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (c) => <PoStatusPill status={c.getValue<'ordered' | 'partially_received'>()} />,
      },
      {
        accessorKey: 'expectedArrival',
        header: 'ETA',
        cell: (c) => {
          const row = c.row.original;
          return (
            <span className="flex items-center gap-2">
              {formatDate(c.getValue<string | null>())}
              {row.overdue ? (
                <Badge variant="danger">Overdue</Badge>
              ) : row.daysUntil !== null ? (
                <span className="text-xs text-muted-foreground">in {row.daysUntil}d</span>
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: 'totalOutstandingQty',
        header: 'Outstanding qty',
        cell: (c) => <span className="font-mono">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'outstandingValueMinor',
        header: 'Outstanding value',
        cell: (c) => <span className="font-mono">{formatMoney(c.getValue<number>())}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Inbound"
        description="Ordered / partially received purchase orders, sorted by ETA."
      />
      <DataTable
        columns={columns}
        data={inbound.data}
        isLoading={inbound.isLoading}
        isError={inbound.isError}
        onRetry={() => inbound.refetch()}
        onRowClick={(r) =>
          navigate({ to: '/purchase-orders/$id', params: { id: r.purchaseOrderId } })
        }
        empty={
          <EmptyState
            icon={Truck}
            title="Nothing inbound"
            description="No open purchase orders awaiting delivery."
          />
        }
      />
    </>
  );
}
