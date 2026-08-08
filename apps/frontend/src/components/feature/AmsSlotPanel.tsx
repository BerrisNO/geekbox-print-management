import { EXTERNAL_SLOT_REF, type SlotView, type Spool } from '@geekbox/shared';
import { AlertTriangle, Droplets, Link2, Link2Off, PackageX } from 'lucide-react';
import { useState } from 'react';
import {
  useConfirmMapping,
  useMapSlot,
  useSlots,
  useSpools,
  useTelemetry,
  useUnmapSlot,
} from '../../api/hooks';
import { cn } from '../../lib/cn';
import { formatGrams } from '../../lib/format';
import { ProgressRing } from '../data/ProgressRing';
import { ColorSwatch } from '../data/pills';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Combobox } from '../ui/combobox';
import { Dialog } from '../ui/dialog';
import { ErrorState, Skeleton } from '../ui/misc';

/** AmsSlotPanel + SlotTile (organism, FR-305). One tile per physical slot plus
 *  the virtual external holder 254:0. Live spool data, verify flag, map/unmap. */
export function AmsSlotPanel({ printerId }: { printerId: string }) {
  const slots = useSlots(printerId);
  const telemetry = useTelemetry(printerId);
  const humidUnits = (telemetry.data?.ams?.units ?? []).filter(
    (u) => u.humidityLevel != null || u.humidityPct != null,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">AMS &amp; external spools</CardTitle>
        {humidUnits.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {humidUnits.map((u) => (
              <Badge key={u.unitIndex} variant={humidityVariant(u)} icon={Droplets}>
                {humidUnits.length > 1 ? `AMS ${u.unitIndex} · ` : ''}
                {u.humidityPct != null ? `${u.humidityPct}%` : `${u.humidityLevel}/5`}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {slots.isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : slots.isError ? (
          <ErrorState onRetry={() => slots.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(slots.data ?? []).map((slot) => (
              <SlotTile key={slot.slotRef} printerId={printerId} slot={slot} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Badge color by dryness: Bambu levels run 1 (driest) to 5 (wettest); raw
 * percent thresholds mirror the level bands. Dry = green, middling = amber,
 * wet = red (filament should be dried).
 */
function humidityVariant(u: {
  humidityLevel: number | null;
  humidityPct: number | null;
}): 'success' | 'warning' | 'danger' {
  if (u.humidityPct != null) {
    if (u.humidityPct < 40) return 'success';
    if (u.humidityPct < 60) return 'warning';
    return 'danger';
  }
  if ((u.humidityLevel ?? 5) <= 2) return 'success';
  if (u.humidityLevel === 3) return 'warning';
  return 'danger';
}

function SlotTile({ printerId, slot }: { printerId: string; slot: SlotView }) {
  const [mapOpen, setMapOpen] = useState(false);
  const unmap = useUnmapSlot(printerId);
  const confirm = useConfirmMapping(printerId);
  const isExternal = slot.slotRef === EXTERNAL_SLOT_REF;
  const label = isExternal ? 'External 254:0' : `Slot ${slot.slotRef}`;
  const spool = slot.spool;
  const spoolUnavailable =
    slot.mapping && (!spool || spool.status === 'depleted' || spool.status === 'archived');

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border p-3 isolate',
        slot.mapping?.verifyFlag && 'border-[var(--color-status-verify)]',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{label}</span>
        {slot.observation?.trayColorHex || slot.observation?.trayType ? (
          <ColorSwatch
            hex={slot.observation.trayColorHex}
            name={slot.observation.trayType ?? undefined}
          />
        ) : null}
      </div>

      {slot.mapping?.verifyFlag ? (
        <Badge variant="warning" icon={AlertTriangle}>
          Verify: {slot.mapping.verifyReason ?? 'review'}
        </Badge>
      ) : null}

      {spoolUnavailable ? (
        <Badge variant="danger" icon={PackageX}>
          Mapped spool unavailable
        </Badge>
      ) : null}

      {spool && !spoolUnavailable ? (
        <div className="flex items-center gap-2">
          <ProgressRing
            pct={spool.remainingPct}
            color={spool.colorHex}
            label={`${spool.remainingPct}% of ${spool.material} ${spool.colorName} remaining`}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-sm">{spool.label}</span>
            <ColorSwatch hex={spool.colorHex} name={`${spool.material} ${spool.colorName}`} />
            <span className="font-mono text-xs text-muted-foreground">
              {formatGrams(spool.remainingNetWeightG)} left
            </span>
          </div>
        </div>
      ) : !slot.mapping ? (
        <span className="text-xs text-muted-foreground">Unmapped</span>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-1 pt-1">
        {slot.mapping ? (
          <>
            {slot.mapping.verifyFlag ? (
              <Button
                size="sm"
                variant="outline"
                loading={confirm.isPending}
                onClick={() => confirm.mutate(slot.slotRef)}
              >
                Confirm
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              loading={unmap.isPending}
              onClick={() => unmap.mutate(slot.slotRef)}
            >
              <Link2Off className="size-3" aria-hidden /> Unmap
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setMapOpen(true)}>
            <Link2 className="size-3" aria-hidden /> Map spool
          </Button>
        )}
      </div>

      <MapSpoolDialog
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        printerId={printerId}
        slot={slot}
      />
    </div>
  );
}

function MapSpoolDialog({
  open,
  onClose,
  printerId,
  slot,
}: {
  open: boolean;
  onClose: () => void;
  printerId: string;
  slot: SlotView;
}) {
  const spools = useSpools({ status: 'in_stock' });
  const map = useMapSlot(printerId);
  const [selected, setSelected] = useState<string | null>(null);

  // Suggest spools matching the observed tray material/color first (AC-305.1).
  const suggested = suggestSpools(spools.data ?? [], slot);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Map spool to ${slot.slotRef}`}
      description="Pick an in-stock spool. Matching material/color are suggested first."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={map.isPending}
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              map.mutate({ slotRef: slot.slotRef, spoolId: selected }, { onSuccess: onClose });
            }}
          >
            Map spool
          </Button>
        </>
      }
    >
      <Combobox
        options={suggested.map((s) => ({
          value: s.id,
          label: `${s.label} — ${s.product.material} ${s.product.colorName}`,
          hint: `${formatGrams(s.remainingNetWeightG)} remaining`,
        }))}
        value={selected}
        onChange={setSelected}
        placeholder="Select a spool…"
        emptyText="No in-stock spools"
      />
    </Dialog>
  );
}

function suggestSpools(spools: Spool[], slot: SlotView): Spool[] {
  const trayColor = slot.observation?.trayColorHex?.toLowerCase();
  return [...spools].sort((a, b) => {
    const aMatch = trayColor && a.product.colorHex?.toLowerCase() === trayColor ? 1 : 0;
    const bMatch = trayColor && b.product.colorHex?.toLowerCase() === trayColor ? 1 : 0;
    return bMatch - aMatch;
  });
}
