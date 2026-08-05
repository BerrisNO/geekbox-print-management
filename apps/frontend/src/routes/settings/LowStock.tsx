import type { FilamentProduct } from '@geekbox/shared';
import { useState } from 'react';
import { useProducts, useUpdateProduct } from '../../api/hooks';
import { ColorSwatch } from '../../components/data/pills';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { ErrorState, Label, Skeleton } from '../../components/ui/misc';
import { useUiStore } from '../../stores/ui-store';

/** Low-stock threshold defaults per product (FR-106). */
export function LowStockSettings() {
  const products = useProducts();

  if (products.isLoading) return <Skeleton className="h-72 w-full" />;
  if (products.isError) return <ErrorState onRetry={() => products.refetch()} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Low-stock thresholds</CardTitle>
      </CardHeader>
      <CardContent>
        {(products.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No products yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(products.data ?? []).map((p) => (
              <ThresholdRow key={p.id} product={p} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ThresholdRow({ product }: { product: FilamentProduct }) {
  const update = useUpdateProduct(product.id);
  const pushToast = useUiStore((s) => s.pushToast);
  const [thresholdG, setThresholdG] = useState<string>(
    product.lowStockThresholdG?.toString() ?? '',
  );
  const [minSpools, setMinSpools] = useState<string>(product.lowStockMinSpools?.toString() ?? '');

  function save() {
    update.mutate(
      {
        material: product.material,
        colorName: product.colorName,
        vendorId: product.vendorId,
        diameterMm: product.diameterMm,
        nominalNetWeightG: product.nominalNetWeightG,
        lowStockThresholdG: thresholdG ? Number(thresholdG) : undefined,
        lowStockMinSpools: minSpools ? Number(minSpools) : undefined,
      },
      {
        onSuccess: () => pushToast({ variant: 'success', title: 'Threshold saved' }),
        onError: () => pushToast({ variant: 'error', title: 'Save failed' }),
      },
    );
  }

  return (
    <li className="flex flex-wrap items-end justify-between gap-3 py-3">
      <span className="flex items-center gap-1.5">
        {product.material}
        <ColorSwatch hex={product.colorHex} name={product.colorName} />
      </span>
      <div className="flex items-end gap-2">
        <div>
          <Label className="text-xs">Threshold (g)</Label>
          <Input
            type="number"
            className="w-28 font-mono"
            value={thresholdG}
            onChange={(e) => setThresholdG(e.target.value)}
            aria-label={`Threshold for ${product.colorName}`}
          />
        </div>
        <div>
          <Label className="text-xs">Min spools</Label>
          <Input
            type="number"
            className="w-24 font-mono"
            value={minSpools}
            onChange={(e) => setMinSpools(e.target.value)}
            aria-label={`Min spools for ${product.colorName}`}
          />
        </div>
        <Button size="sm" variant="outline" loading={update.isPending} onClick={save}>
          Save
        </Button>
      </div>
    </li>
  );
}
