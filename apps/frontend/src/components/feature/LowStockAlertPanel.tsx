import type { LowStockAlert } from '@geekbox/shared';
import { AlertTriangle, PackageCheck } from 'lucide-react';
import { useLowStockAlerts } from '../../api/hooks';
import { formatDate, formatGrams } from '../../lib/format';
import { ColorSwatch } from '../data/pills';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { EmptyState, ErrorState, Skeleton } from '../ui/misc';

/** LowStockAlertPanel (FR-106). Alerts with on-order qty + earliest ETA. */
export function LowStockAlertPanel() {
  const alerts = useLowStockAlerts();

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <AlertTriangle className="size-5 text-[var(--color-status-low)]" aria-hidden />
        <CardTitle className="text-base">Low-stock alerts</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : alerts.isError ? (
          <ErrorState onRetry={() => alerts.refetch()} />
        ) : (alerts.data ?? []).length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="All stocked up"
            description="No products are below their low-stock threshold."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {(alerts.data ?? []).map((a) => (
              <AlertRow key={a.productId} alert={a} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({ alert }: { alert: LowStockAlert }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-status-low)]/30 bg-[var(--color-status-low)]/5 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{alert.material}</span>
        <ColorSwatch hex={null} name={alert.colorName} />
        <span className="font-mono text-xs text-muted-foreground">
          {formatGrams(alert.currentRemainingG)} · {alert.currentUsableSpools} usable spool(s)
        </span>
      </div>
      <div className="text-right text-xs text-muted-foreground">
        <p>On order: {alert.onOrderQty}</p>
        <p>ETA: {formatDate(alert.earliestEta)}</p>
      </div>
    </li>
  );
}
