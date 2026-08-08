import { type FilamentProduct, type ProductStockRow, type SpoolType } from '@geekbox/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Package, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useArchiveProduct,
  useCreateProduct,
  useInventorySummary,
  useManufacturers,
  useMaterials,
  useProducts,
  useUpdateProduct,
  useVendors,
} from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { ColorSwatch } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { Sheet } from '../components/ui/sheet';
import { ProductForm } from '../forms/ProductForm';
import { formatGrams, formatMoney, orDash } from '../lib/format';

const SPOOL_TYPE_LABELS: Record<SpoolType, string> = {
  plastic: 'Plastic spool',
  cardboard: 'Cardboard spool',
  refill: 'Refill (no spool)',
  reusable: 'Reusable/Masterspool',
};

export function ProductsPage() {
  const [material, setMaterial] = useState('');
  const products = useProducts({ material: material || undefined, includeArchived: true });
  const vendors = useVendors();
  const manufacturers = useManufacturers();
  const materials = useMaterials(true);
  const summary = useInventorySummary();
  const [editing, setEditing] = useState<FilamentProduct | 'new' | null>(null);
  const [archiving, setArchiving] = useState<FilamentProduct | null>(null);
  const archive = useArchiveProduct();

  // Stock-on-hand per product, joined from the inventory summary.
  const stockById = useMemo(() => {
    const map = new Map<string, ProductStockRow>();
    for (const row of summary.data ?? []) map.set(row.productId, row);
    return map;
  }, [summary.data]);

  const columns = useMemo<ColumnDef<FilamentProduct, unknown>[]>(
    () => [
      {
        accessorKey: 'material',
        header: 'Material',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        id: 'product',
        header: 'Product',
        accessorFn: (r) =>
          [r.manufacturer, r.name, r.category, r.colorName].filter(Boolean).join(' '),
        cell: (c) => {
          const p = c.row.original;
          const title =
            p.name || [p.manufacturer, p.category ?? p.material].filter(Boolean).join(' ');
          const detail = [
            p.manufacturer,
            p.category,
            SPOOL_TYPE_LABELS[p.spoolType],
            p.sku ? `SKU ${p.sku}` : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-medium">
                <ColorSwatch hex={p.colorHex} name={p.colorName} />
                {title} — {p.colorName}
              </span>
              <span className="text-xs text-muted-foreground">{detail}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'vendorName',
        header: 'Vendor',
        cell: (c) => {
          const extra = Math.max(0, (c.row.original.vendors?.length ?? 1) - 1);
          return (
            <span className="flex items-center gap-1.5">
              {c.getValue<string>()}
              {extra > 0 ? <Badge>+{extra}</Badge> : null}
            </span>
          );
        },
      },
      {
        accessorKey: 'diameterMm',
        header: 'Ø (mm)',
        cell: (c) => <span className="font-mono">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'nominalNetWeightG',
        header: 'Nominal',
        cell: (c) => <span className="font-mono">{formatGrams(c.getValue<number>(), 0)}</span>,
      },
      {
        accessorKey: 'densityGCm3',
        header: 'Density',
        cell: (c) => (
          <span className="font-mono text-muted-foreground">
            {c.getValue<number>().toFixed(2)} g/cm³
          </span>
        ),
      },
      {
        accessorKey: 'defaultPriceMinor',
        header: 'Default price',
        cell: (c) => {
          const p = c.row.original;
          const perKgMinor =
            p.defaultPriceMinor > 0 && p.nominalNetWeightG > 0
              ? (p.defaultPriceMinor / p.nominalNetWeightG) * 1000
              : null;
          return (
            <div className="flex flex-col">
              <span className="font-mono">{formatMoney(c.getValue<number>())}</span>
              {perKgMinor !== null ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatMoney(Math.round(perKgMinor))}/kg
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'stock',
        header: 'In stock',
        accessorFn: (r) => stockById.get(r.id)?.totalRemainingG ?? 0,
        cell: (c) => {
          const stock = stockById.get(c.row.original.id);
          if (!stock || stock.usableSpools === 0) {
            return <span className="text-muted-foreground">{orDash(null)}</span>;
          }
          return (
            <div className="flex flex-col">
              <span className="font-mono">
                {stock.usableSpools} {stock.usableSpools === 1 ? 'spool' : 'spools'} ·{' '}
                {formatGrams(stock.totalRemainingG, 0)}
              </span>
              {stock.lowStockActive ? (
                <span>
                  <Badge variant="danger">Low stock</Badge>
                </span>
              ) : null}
            </div>
          );
        },
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
              aria-label="Edit product"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive product"
                onClick={() => setArchiving(c.row.original)}
              >
                <Archive className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [stockById],
  );

  return (
    <>
      <PageHeader
        title="Filament"
        description="Raw filament materials catalog. Prices are recorded on historical spools/POs (AC-101.2)."
        actions={
          <Button onClick={() => setEditing('new')} disabled={(vendors.data ?? []).length === 0}>
            <Plus aria-hidden /> New filament
          </Button>
        }
      />

      <div className="mb-3 flex gap-2">
        <Select
          value={material}
          onChange={(e) => setMaterial(e.target.value)}
          className="max-w-40"
          aria-label="Filter by material"
        >
          <option value="">All materials</option>
          {(materials.data ?? []).map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={products.data}
        isLoading={products.isLoading}
        isError={products.isError}
        onRetry={() => products.refetch()}
        empty={
          <EmptyState
            icon={Package}
            title="No products"
            description={
              (vendors.data ?? []).length === 0
                ? 'Add a vendor first, then create products.'
                : 'Create your first filament product.'
            }
            action={
              (vendors.data ?? []).length > 0 ? (
                <Button onClick={() => setEditing('new')}>New product</Button>
              ) : null
            }
          />
        }
      />

      {editing ? (
        <Sheet
          open
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'New product' : 'Edit product'}
        >
          <ProductEditor
            product={editing === 'new' ? undefined : editing}
            vendors={vendors.data ?? []}
            manufacturers={manufacturers.data ?? []}
            materials={materials.data ?? []}
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
        description="Offered instead of hard delete when referenced (AC-101.3)."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function ProductEditor({
  product,
  vendors,
  manufacturers,
  materials,
  onClose,
}: {
  product?: FilamentProduct;
  vendors: ReturnType<typeof useVendors>['data'] extends infer T ? NonNullable<T> : never;
  manufacturers: ReturnType<typeof useManufacturers>['data'] extends infer T
    ? NonNullable<T>
    : never;
  materials: ReturnType<typeof useMaterials>['data'] extends infer T ? NonNullable<T> : never;
  onClose: () => void;
}) {
  const create = useCreateProduct();
  const update = useUpdateProduct(product?.id ?? '');
  const mutation = product ? update : create;

  return (
    <ProductForm
      vendors={vendors}
      manufacturers={manufacturers}
      materials={materials}
      initial={product}
      submitting={mutation.isPending}
      onCancel={onClose}
      onSubmit={(values) => mutation.mutate(values, { onSuccess: onClose })}
    />
  );
}
