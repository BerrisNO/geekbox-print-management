import type { PurchaseOrder } from '@geekbox/shared';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, ShoppingCart } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCreatePurchaseOrder, useProducts, usePurchaseOrders, useVendors } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { PoStatusPill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/misc';
import { Sheet } from '../components/ui/sheet';
import { PurchaseOrderForm } from '../forms/PurchaseOrderForm';
import { formatDate, formatMoney } from '../lib/format';

export function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const pos = usePurchaseOrders();
  const vendors = useVendors();
  const products = useProducts();
  const create = useCreatePurchaseOrder();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (c) => <PoStatusPill status={c.row.original.status} />,
      },
      {
        accessorKey: 'orderDate',
        header: 'Ordered',
        cell: (c) => formatDate(c.getValue<string>()),
      },
      {
        accessorKey: 'expectedArrival',
        header: 'ETA',
        cell: (c) => formatDate(c.getValue<string | null>()),
      },
      {
        id: 'lines',
        header: 'Lines',
        cell: (c) => <span className="font-mono">{c.row.original.lines.length}</span>,
      },
      {
        id: 'value',
        header: 'Goods value',
        accessorFn: (r) => r.totals.goodsValueMinor,
        cell: (c) => <span className="font-mono">{formatMoney(c.getValue<number>())}</span>,
      },
    ],
    [],
  );

  const canCreate = (vendors.data ?? []).length > 0 && (products.data ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Draft, order, and track filament purchases."
        actions={
          <Button onClick={() => setCreating(true)} disabled={!canCreate}>
            <Plus aria-hidden /> New PO
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={pos.data}
        isLoading={pos.isLoading}
        isError={pos.isError}
        onRetry={() => pos.refetch()}
        onRowClick={(po) => navigate({ to: '/purchase-orders/$id', params: { id: po.id } })}
        empty={
          <EmptyState
            icon={ShoppingCart}
            title="No purchase orders"
            description={
              canCreate ? 'Create your first purchase order.' : 'Add a vendor and a product first.'
            }
            action={canCreate ? <Button onClick={() => setCreating(true)}>New PO</Button> : null}
          />
        }
      />

      {creating ? (
        <Sheet open onClose={() => setCreating(false)} title="New purchase order">
          <PurchaseOrderForm
            vendors={vendors.data ?? []}
            products={products.data ?? []}
            submitting={create.isPending}
            onCancel={() => setCreating(false)}
            onSubmit={(values) =>
              create.mutate(values, {
                onSuccess: (po) => {
                  setCreating(false);
                  navigate({ to: '/purchase-orders/$id', params: { id: po.id } });
                },
              })
            }
          />
        </Sheet>
      ) : null}
    </>
  );
}
