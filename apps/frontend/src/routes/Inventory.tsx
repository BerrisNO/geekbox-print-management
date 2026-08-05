import { MATERIALS, SPOOL_STATUSES, type Spool } from '@geekbox/shared';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Warehouse } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProducts, useRegisterSpool, useSpools } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { ColorSwatch, SpoolStatusPill } from '../components/data/pills';
import { InventorySummary } from '../components/feature/InventorySummary';
import { PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { Sheet } from '../components/ui/sheet';
import { SpoolForm } from '../forms/SpoolForm';
import { formatGrams, formatMoney, formatPct, orDash } from '../lib/format';

export function InventoryPage() {
  const navigate = useNavigate();
  const [material, setMaterial] = useState('');
  const [status, setStatus] = useState('');
  const spools = useSpools({ material: material || undefined, status: status || undefined });
  const products = useProducts();
  const register = useRegisterSpool();
  const [registering, setRegistering] = useState(false);

  const columns = useMemo<ColumnDef<Spool, unknown>[]>(
    () => [
      {
        accessorKey: 'label',
        header: 'Label',
        cell: (c) => <span className="font-mono font-medium">{c.getValue<string>()}</span>,
      },
      {
        id: 'material',
        header: 'Filament',
        accessorFn: (r) => `${r.product.material} ${r.product.colorName}`,
        cell: (c) => (
          <span className="flex items-center gap-1.5">
            {c.row.original.product.material}
            <ColorSwatch
              hex={c.row.original.product.colorHex}
              name={c.row.original.product.colorName}
            />
          </span>
        ),
      },
      {
        accessorKey: 'remainingNetWeightG',
        header: 'Remaining',
        cell: (c) => (
          <span className="font-mono">
            {formatGrams(c.getValue<number>())} · {formatPct(c.row.original.remainingPct)}
          </span>
        ),
      },
      {
        accessorKey: 'valuationMinor',
        header: 'Valuation',
        cell: (c) => (
          <span className="font-mono">
            {formatMoney(c.getValue<number>())}
            {c.row.original.valuationEstimated ? (
              <span className="ml-1 text-xs text-muted-foreground">(est.)</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (c) => <SpoolStatusPill status={c.row.original.status} />,
      },
      {
        id: 'location',
        header: 'Location',
        cell: (c) =>
          c.row.original.mappedTo ? (
            <span className="font-mono text-xs">
              {c.row.original.mappedTo.printerName} · {c.row.original.mappedTo.slotRef}
            </span>
          ) : (
            orDash(null)
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Filament spools, remaining weight, valuation, and mapping location."
        actions={
          <Button
            onClick={() => setRegistering(true)}
            disabled={(products.data ?? []).length === 0}
          >
            <Plus aria-hidden /> Register spool
          </Button>
        }
      />

      <InventorySummary />

      <div className="my-4 flex flex-wrap gap-2">
        <Select
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className="max-w-40"
          aria-label="Filter by material"
        >
          <option value="">All materials</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="max-w-40"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {SPOOL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={spools.data}
        isLoading={spools.isLoading}
        isError={spools.isError}
        onRetry={() => spools.refetch()}
        onRowClick={(s) =>
          navigate({ to: '/inventory/spools/$spoolId', params: { spoolId: s.id } })
        }
        virtualize={(spools.data?.length ?? 0) > 50}
        getRowId={(s) => s.id}
        empty={
          <EmptyState
            icon={Warehouse}
            title="No spools"
            description="Register a spool manually or receive one against a purchase order."
            action={
              (products.data ?? []).length > 0 ? (
                <Button onClick={() => setRegistering(true)}>Register spool</Button>
              ) : null
            }
          />
        }
      />

      {registering ? (
        <Sheet open onClose={() => setRegistering(false)} title="Register spool">
          <SpoolForm
            products={products.data ?? []}
            submitting={register.isPending}
            onCancel={() => setRegistering(false)}
            onSubmit={(values) =>
              register.mutate(values, { onSuccess: () => setRegistering(false) })
            }
          />
        </Sheet>
      ) : null}
    </>
  );
}
