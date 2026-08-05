import type { Printer, TelemetrySnapshot } from '@geekbox/shared';
import { Layers, Thermometer, Timer } from 'lucide-react';
import { useTelemetry } from '../../api/hooks';
import { cn } from '../../lib/cn';
import { formatDuration, formatPct } from '../../lib/format';
import { computeFreshness } from '../../lib/freshness';
import { DataFreshness } from '../data/DataFreshness';
import { PrinterStatePill } from '../data/pills';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Skeleton } from '../ui/misc';

/**
 * PrinterCard (organism, spec §7.3). SSE-driven telemetry. Uses the DEFAULT
 * two-boundary DataFreshness contract (freshMaxSec=10, staleMinSec=120), so a
 * value >10s old renders aging/stale — never `fresh`. When not fresh the body is
 * dimmed and last-seen labeled; null fields render "—", never a stale value as live.
 */
export function PrinterCard({ printer }: { printer: Printer }) {
  const telemetry = useTelemetry(printer.id);

  if (telemetry.isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  const snap = telemetry.data;
  const connected = printer.online && !telemetry.isError;

  return (
    <Card className="@container">
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex flex-col gap-1">
          <span className="font-semibold">{printer.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{printer.serial}</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <PrinterStatePill state={snap?.printerState ?? (printer.online ? 'idle' : 'offline')} />
          {snap ? (
            <DataFreshness
              capturedAt={snap.capturedAt}
              connected={connected}
              error={telemetry.isError}
            />
          ) : (
            <span className="text-xs text-muted-foreground">no telemetry yet</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {snap ? (
          <PrinterBody snap={snap} connected={connected} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Waiting for the first telemetry snapshot from this printer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PrinterBody({ snap, connected }: { snap: TelemetrySnapshot; connected: boolean }) {
  const { state } = computeFreshness({ capturedAt: snap.capturedAt, connected });
  const dimmed = state !== 'fresh';

  return (
    <div className={cn('flex flex-col gap-3', dimmed && 'opacity-60')}>
      <div>
        <p className="truncate text-sm font-medium">{snap.taskName ?? 'No active job'}</p>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, snap.progressPct ?? 0))}%` }}
            role="progressbar"
            aria-valuenow={snap.progressPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Print progress"
          />
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {snap.progressPct !== null ? formatPct(snap.progressPct) : '—'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm @[16rem]:grid-cols-3">
        <Stat icon={Layers} label="Layer">
          {snap.currentLayer !== null && snap.totalLayers !== null
            ? `${snap.currentLayer}/${snap.totalLayers}`
            : '—'}
        </Stat>
        <Stat icon={Timer} label="Remaining">
          {formatDuration(snap.remainingTimeMin)}
        </Stat>
        <Stat icon={Thermometer} label="Nozzle">
          {snap.nozzleTempC !== null ? `${snap.nozzleTempC.toFixed(0)}°C` : '—'}
        </Stat>
        <Stat icon={Thermometer} label="Bed">
          {snap.bedTempC !== null ? `${snap.bedTempC.toFixed(0)}°C` : '—'}
        </Stat>
        {snap.chamberTempC !== null ? (
          <Stat icon={Thermometer} label="Chamber">
            {`${snap.chamberTempC.toFixed(0)}°C`}
          </Stat>
        ) : null}
      </dl>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3" aria-hidden />
        {label}
      </dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}
