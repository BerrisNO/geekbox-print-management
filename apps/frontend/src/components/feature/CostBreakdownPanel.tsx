import type { CostBreakdown } from '@geekbox/shared';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatDateTime, formatDuration, formatMoney } from '../../lib/format';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

/** CostBreakdownPanel (FR-404). Filament/energy/machine/total; "not configured"
 *  and "incomplete" states; frozen inputs snapshot; recalculate action. */
export function CostBreakdownPanel({
  cost,
  onRecalculate,
  recalculating,
}: {
  cost: CostBreakdown | null;
  onRecalculate?: () => void;
  recalculating?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Cost breakdown</CardTitle>
        {onRecalculate ? (
          <Button size="sm" variant="outline" loading={recalculating} onClick={onRecalculate}>
            <RefreshCw className="size-4" aria-hidden /> Recalculate
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!cost ? (
          <p className="text-sm text-muted-foreground">
            Not costed yet. Recalculate once usages are attributed and rates configured.
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            {cost.incomplete ? (
              <Badge variant="warning" icon={AlertTriangle}>
                Incomplete — some inputs missing
              </Badge>
            ) : null}
            <CostLine
              label="Filament"
              value={formatMoney(cost.filamentCostMinor, cost.currencyCode)}
            />
            <CostLine
              label="Energy"
              value={
                cost.energyCostMinor === null
                  ? null
                  : formatMoney(cost.energyCostMinor, cost.currencyCode)
              }
            />
            <CostLine
              label="Machine"
              value={
                cost.machineCostMinor === null
                  ? null
                  : formatMoney(cost.machineCostMinor, cost.currencyCode)
              }
            />
            <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono">
                {formatMoney(cost.totalCostMinor, cost.currencyCode)}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <p>Calculated {formatDateTime(cost.calculatedAt)}</p>
              {cost.inputs.durationMin !== null ? (
                <p>Duration input: {formatDuration(cost.inputs.durationMin)}</p>
              ) : null}
              {cost.inputs.watts !== null ? <p>Power draw: {cost.inputs.watts} W</p> : null}
            </div>
            {cost.inputs.perSpool.length > 0 ? (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Per-spool inputs (frozen snapshot)
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5 font-mono">
                  {cost.inputs.perSpool.map((s) => (
                    <li key={s.spoolId} className="flex justify-between gap-2">
                      <Link
                        to="/inventory/spools/$spoolId"
                        params={{ spoolId: s.spoolId }}
                        className="text-primary hover:underline"
                      >
                        {s.spoolId.slice(0, 8)}…
                      </Link>
                      <span>
                        {s.grams.toFixed(1)}g{s.estimated ? ' (est.)' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostLine({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      {value === null ? (
        <span className="text-xs italic text-muted-foreground">not configured</span>
      ) : (
        <span className="font-mono">{value}</span>
      )}
    </div>
  );
}
