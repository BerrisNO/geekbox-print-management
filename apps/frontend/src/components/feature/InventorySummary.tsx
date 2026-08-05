import { useInventorySummary } from '../../api/hooks';
import { formatGrams, formatMoney } from '../../lib/format';
import { Card, CardContent } from '../ui/card';
import { ErrorState, Skeleton } from '../ui/misc';

/** Inventory summary strip (FR-105/108): totals across all products. */
export function InventorySummary() {
  const summary = useInventorySummary();

  if (summary.isLoading) return <Skeleton className="h-20 w-full" />;
  if (summary.isError) return <ErrorState onRetry={() => summary.refetch()} />;

  const rows = summary.data ?? [];
  const totalRemaining = rows.reduce((a, r) => a + r.totalRemainingG, 0);
  const totalValuation = rows.reduce((a, r) => a + r.valuationMinor, 0);
  const usableSpools = rows.reduce((a, r) => a + r.usableSpools, 0);
  const lowStock = rows.filter((r) => r.lowStockActive).length;
  const estimated = rows.some((r) => r.valuationEstimated);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Products tracked" value={String(rows.length)} />
      <Stat label="Usable spools" value={String(usableSpools)} />
      <Stat label="Total remaining" value={formatGrams(totalRemaining, 0)} />
      <Stat
        label="Total valuation"
        value={`${formatMoney(totalValuation)}${estimated ? ' *' : ''}`}
        hint={
          estimated
            ? '* includes default-priced spools'
            : lowStock
              ? `${lowStock} low-stock`
              : undefined
        }
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
