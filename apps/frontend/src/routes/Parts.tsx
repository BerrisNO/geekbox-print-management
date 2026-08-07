import type { Part } from '@geekbox/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Component, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useArchivePart,
  useCostRates,
  useCreatePart,
  useCustomers,
  useParts,
  useProducts,
  useUpdatePart,
} from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/misc';
import { Sheet } from '../components/ui/sheet';
import { PartForm } from '../forms/PartForm';
import { formatMoney } from '../lib/format';

export function PartsPage() {
  const parts = useParts(true);
  const customers = useCustomers();
  const products = useProducts();
  const costRates = useCostRates();
  const [editing, setEditing] = useState<Part | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Part | null>(null);
  const archive = useArchivePart();
  const currencyCode = costRates.data?.currencyCode ?? 'NOK';

  const columns = useMemo<ColumnDef<Part, unknown>[]>(
    () => [
      {
        accessorKey: 'articleNo',
        header: 'Article no',
        cell: (c) => <span className="font-mono">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'customerName',
        header: 'Customer',
        cell: (c) => c.getValue<string | null>() ?? 'Universal',
      },
      {
        id: 'unitCost',
        header: 'Unit cost',
        cell: (c) => (
          <span className="font-mono">
            {formatMoney(c.row.original.economics.unitCostMinor, currencyCode)}
          </span>
        ),
      },
      {
        id: 'sellPrice',
        header: 'Sell price',
        cell: (c) => (
          <span className="font-mono">
            {formatMoney(c.row.original.economics.effectiveSellPriceMinor, currencyCode)}
          </span>
        ),
      },
      {
        id: 'margin',
        header: 'Margin',
        cell: (c) => (
          <span className="font-mono">
            {formatMoney(c.row.original.economics.marginMinor, currencyCode)} (
            {c.row.original.economics.marginPct}%)
          </span>
        ),
      },
      {
        accessorKey: 'archived',
        header: 'Status',
        cell: (c) =>
          c.getValue<boolean>() ? <Badge>Archived</Badge> : <Badge variant="success">Active</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: (c) => (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Edit part"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive part"
                onClick={() => setArchiving(c.row.original)}
              >
                <Archive className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [currencyCode],
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Customer-facing parts with a bill of materials and computed pricing."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New product
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={parts.data}
        isLoading={parts.isLoading}
        isError={parts.isError}
        onRetry={() => parts.refetch()}
        empty={
          <EmptyState
            icon={Component}
            title="No products yet"
            description="Create a customer-facing product with its bill of materials."
            action={<Button onClick={() => setEditing('new')}>New product</Button>}
          />
        }
      />

      {editing ? (
        <Sheet
          open
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'New product' : 'Edit product'}
        >
          <PartEditor
            part={editing === 'new' ? undefined : editing}
            customers={customers.data ?? []}
            products={products.data ?? []}
            costRates={costRates.data ?? null}
            currencyCode={currencyCode}
            onClose={() => setEditing(null)}
          />
        </Sheet>
      ) : null}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) });
        }}
        title="Archive product?"
        description="Historical references are preserved. The product is hidden from active lists."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function PartEditor({
  part,
  customers,
  products,
  costRates,
  currencyCode,
  onClose,
}: {
  part?: Part;
  customers: NonNullable<ReturnType<typeof useCustomers>['data']>;
  products: NonNullable<ReturnType<typeof useProducts>['data']>;
  costRates: ReturnType<typeof useCostRates>['data'] | null;
  currencyCode: string;
  onClose: () => void;
}) {
  const create = useCreatePart();
  const update = useUpdatePart(part?.id ?? '');
  const mutation = part ? update : create;

  return (
    <PartForm
      customers={customers}
      products={products}
      costRates={costRates ?? null}
      currencyCode={currencyCode}
      initial={part}
      submitting={mutation.isPending}
      onCancel={onClose}
      onSubmit={(values) => mutation.mutate(values, { onSuccess: onClose })}
    />
  );
}
