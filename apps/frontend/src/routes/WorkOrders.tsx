import type { WorkOrder } from '@geekbox/shared';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardList, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreateWorkOrder, useCustomers, useParts, useWorkOrders } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { WorkOrderStatusPill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/misc';
import { Sheet } from '../components/ui/sheet';
import { WorkOrderForm } from '../forms/WorkOrderForm';
import { formatDate, formatMoney, orDash } from '../lib/format';

export function WorkOrdersPage() {
  const navigate = useNavigate();
  const workOrders = useWorkOrders();
  const customers = useCustomers();
  const parts = useParts();
  const create = useCreateWorkOrder();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<WorkOrder, unknown>[]>(
    () => [
      {
        accessorKey: 'orderRef',
        header: 'Reference',
        cell: (c) => <span className="font-medium">{orDash(c.getValue<string | null>())}</span>,
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: (c) => c.getValue<string>(),
      },
      {
        accessorKey: 'orderDate',
        header: 'Date',
        cell: (c) => formatDate(c.getValue<string | null>()),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (c) => <WorkOrderStatusPill status={c.row.original.status} />,
      },
      {
        id: 'sell',
        header: 'Total sell',
        accessorFn: (r) => r.totals.sellMinor,
        cell: (c) => <span className="font-mono">{formatMoney(c.getValue<number>())}</span>,
      },
      {
        id: 'margin',
        header: 'Margin',
        accessorFn: (r) => r.totals.marginMinor,
        cell: (c) => <span className="font-mono">{formatMoney(c.getValue<number>())}</span>,
      },
    ],
    [],
  );

  const canCreate = (customers.data ?? []).length > 0 && (parts.data ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Work orders"
        description="Plan customer production orders and track fulfillment."
        actions={
          <Button onClick={() => setCreating(true)} disabled={!canCreate}>
            <Plus aria-hidden /> New work order
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={workOrders.data}
        isLoading={workOrders.isLoading}
        isError={workOrders.isError}
        onRetry={() => workOrders.refetch()}
        onRowClick={(wo) => navigate({ to: '/work-orders/$id', params: { id: wo.id } })}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No work orders"
            description={
              canCreate ? 'Create your first work order.' : 'Add a customer and a product first.'
            }
            action={
              canCreate ? <Button onClick={() => setCreating(true)}>New work order</Button> : null
            }
          />
        }
      />

      {creating ? (
        <Sheet open onClose={() => setCreating(false)} title="New work order">
          <WorkOrderForm
            customers={customers.data ?? []}
            parts={parts.data ?? []}
            submitting={create.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(values) =>
              create.mutate(values, {
                onSuccess: (wo) => {
                  setCreating(false);
                  navigate({ to: '/work-orders/$id', params: { id: wo.id } });
                },
              })
            }
          />
        </Sheet>
      ) : null}
    </>
  );
}
