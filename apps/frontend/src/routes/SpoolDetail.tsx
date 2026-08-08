import { SPOOL_STATUSES, type Spool, spoolAdjustSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Printer, Scale, Settings2 } from 'lucide-react';
import { useId, useState } from 'react';
import { ApiError } from '../api/client';
import {
  useAdjustSpool,
  useSpool,
  useSpoolLedger,
  useTransitionSpoolStatus,
  useUpdateSpool,
} from '../api/hooks';
import { ColorSwatch, SpoolStatusPill } from '../components/data/pills';
import { SpoolLedgerTable } from '../components/data/SpoolLedgerTable';
import { PageHeader } from '../components/shell/PageHeader';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog, Dialog } from '../components/ui/dialog';
import { Input, Textarea } from '../components/ui/input';
import { Label, Skeleton } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { FormField } from '../forms/FormField';
import {
  formatGrams,
  formatMoney,
  formatPct,
  majorToMinor,
  minorToMajorInput,
  orDash,
} from '../lib/format';
import { useUiStore } from '../stores/ui-store';

export function SpoolDetailPage() {
  const { spoolId } = useParams({ from: '/_app/inventory/spools/$spoolId' });
  const spool = useSpool(spoolId);
  const ledger = useSpoolLedger(spoolId);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [calibrateOpen, setCalibrateOpen] = useState(false);

  return (
    <>
      <PageHeader
        title={spool.data ? `Spool ${spool.data.label}` : 'Spool'}
        actions={
          <div className="flex items-center gap-3">
            <Link
              to="/print/labels"
              search={{ ids: spoolId, copies: 1 }}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Printer className="size-4" aria-hidden /> Print label
            </Link>
            <Link
              to="/inventory"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </Link>
          </div>
        }
      />

      {spool.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : spool.data ? (
        <Card className="mb-6">
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div className="flex flex-col gap-2">
              <ColorSwatch
                hex={spool.data.product.colorHex}
                name={`${spool.data.product.material} ${spool.data.product.colorName}`}
              />
              <SpoolStatusPill status={spool.data.status} />
            </div>
            <div className="flex gap-2">
              {spool.data.amsRemainingPct !== null ? (
                <Button size="sm" variant="outline" onClick={() => setCalibrateOpen(true)}>
                  <Scale className="size-4" aria-hidden /> Calibrate from AMS
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" aria-hidden /> Edit details
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                <Scale className="size-4" aria-hidden /> Adjust weight
              </Button>
              <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>
                <Settings2 className="size-4" aria-hidden /> Change status
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
              <Field label="Remaining">
                {formatGrams(spool.data.remainingNetWeightG)} · {formatPct(spool.data.remainingPct)}
                {spool.data.amsRemainingPct !== null ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    AMS: {formatPct(spool.data.amsRemainingPct)}
                  </span>
                ) : null}
              </Field>
              <Field label="Initial">{formatGrams(spool.data.initialNetWeightG)}</Field>
              <Field label="Tare">
                {spool.data.tareWeightG !== null ? formatGrams(spool.data.tareWeightG, 0) : '—'}
              </Field>
              <Field label="Purchase price">
                {spool.data.purchasePriceMinor !== null
                  ? formatMoney(spool.data.purchasePriceMinor)
                  : '— (using product default)'}
              </Field>
              <Field label="Valuation">
                {formatMoney(spool.data.valuationMinor)}
                {spool.data.valuationEstimated ? ' (est.)' : ''}
              </Field>
              <Field label="Source">{spool.data.source}</Field>
              <Field label="Vendor">{spool.data.product.vendorName}</Field>
              <Field label="Location">
                {spool.data.mappedTo
                  ? `${spool.data.mappedTo.printerName} · ${spool.data.mappedTo.slotRef}`
                  : '—'}
              </Field>
              <Field label="Notes">{orDash(spool.data.notes)}</Field>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <SpoolLedgerTable
            entries={ledger.data}
            isLoading={ledger.isLoading}
            isError={ledger.isError}
            onRetry={() => ledger.refetch()}
          />
        </CardContent>
      </Card>

      {calibrateOpen && spool.data ? (
        <CalibrateFromAmsDialog spool={spool.data} onClose={() => setCalibrateOpen(false)} />
      ) : null}
      {editOpen && spool.data ? (
        <EditDetailsDialog spool={spool.data} onClose={() => setEditOpen(false)} />
      ) : null}
      {adjustOpen ? <AdjustDialog spoolId={spoolId} onClose={() => setAdjustOpen(false)} /> : null}
      {statusOpen && spool.data ? (
        <StatusDialog
          spoolId={spoolId}
          current={spool.data.status}
          mapped={!!spool.data.mappedTo}
          onClose={() => setStatusOpen(false)}
        />
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}

/**
 * Set the ledger balance to the AMS-reported remaining % of the product's
 * full-spool weight (posts a manual_adjustment via the existing adjust path —
 * the AMS estimate never writes the book of record without this confirmation).
 */
function CalibrateFromAmsDialog({ spool, onClose }: { spool: Spool; onClose: () => void }) {
  const adjust = useAdjustSpool(spool.id);
  const pushToast = useUiStore((s) => s.pushToast);
  const pct = spool.amsRemainingPct ?? 0;
  const targetG = Math.round((pct / 100) * spool.product.nominalNetWeightG);

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() =>
        adjust.mutate(
          {
            netWeightG: targetG,
            note: `Calibrated from AMS reading (${pct}% of ${spool.product.nominalNetWeightG} g)`,
          },
          {
            onSuccess: onClose,
            onError: (err) =>
              pushToast({
                variant: 'error',
                title: 'Calibration failed',
                description: err instanceof ApiError ? err.message : undefined,
              }),
          },
        )
      }
      title="Calibrate from AMS?"
      description={`The AMS reports ${formatPct(pct)} remaining ≈ ${formatGrams(targetG, 0)} (of a ${spool.product.nominalNetWeightG} g spool). The ledger currently says ${formatGrams(spool.remainingNetWeightG)}. This posts an adjustment entry setting the balance to the AMS estimate.`}
      confirmLabel="Set to AMS estimate"
      loading={adjust.isPending}
    />
  );
}

/**
 * Edit spool metadata (FR-104 adjacent): purchase price, tare, and notes via
 * PATCH /spools/:id. Price input holds MAJOR units (NOK) and converts to minor
 * on submit (money convention). Empty fields are omitted → left unchanged.
 */
function EditDetailsDialog({ spool, onClose }: { spool: Spool; onClose: () => void }) {
  const update = useUpdateSpool(spool.id);
  const pushToast = useUiStore((s) => s.pushToast);
  const baseId = useId();
  const [price, setPrice] = useState(minorToMajorInput(spool.purchasePriceMinor)?.toString() ?? '');
  const [tare, setTare] = useState(spool.tareWeightG?.toString() ?? '');
  const [notes, setNotes] = useState(spool.notes ?? '');

  function submit() {
    const priceMinor = majorToMinor(price);
    if (price.trim() !== '' && (priceMinor === undefined || priceMinor < 0)) {
      pushToast({ variant: 'error', title: 'Price must be a valid amount' });
      return;
    }
    const tareG = tare.trim() === '' ? undefined : Math.round(Number(tare));
    if (tareG !== undefined && (!Number.isFinite(tareG) || tareG < 0)) {
      pushToast({ variant: 'error', title: 'Tare must be a non-negative number' });
      return;
    }
    update.mutate(
      {
        ...(priceMinor !== undefined ? { purchasePriceMinor: priceMinor } : {}),
        ...(tareG !== undefined ? { tareWeightG: tareG } : {}),
        notes: notes || undefined,
      },
      {
        onSuccess: onClose,
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Update failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit spool details"
      description="Purchase price drives valuation and job costing; when unset, the product's default price is used."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={update.isPending} onClick={submit}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${baseId}-price`}>Purchase price (NOK)</Label>
          <Input
            id={`${baseId}-price`}
            type="number"
            min={0}
            step="0.01"
            className="font-mono"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Leave empty to keep current"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${baseId}-tare`}>Tare weight (g)</Label>
          <Input
            id={`${baseId}-tare`}
            type="number"
            min={0}
            step="1"
            className="font-mono"
            value={tare}
            onChange={(e) => setTare(e.target.value)}
            placeholder="Leave empty to keep current"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${baseId}-notes`}>Notes</Label>
          <Textarea
            id={`${baseId}-notes`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}

function AdjustDialog({ spoolId, onClose }: { spoolId: string; onClose: () => void }) {
  const adjust = useAdjustSpool(spoolId);
  const [mode, setMode] = useState<'net' | 'gross'>('net');
  const pushToast = useUiStore((s) => s.pushToast);

  const form = useForm({
    defaultValues: { weight: 0, note: '' },
    onSubmit: ({ value }) => {
      const body =
        mode === 'net'
          ? { netWeightG: value.weight, note: value.note || undefined }
          : { grossWeightG: value.weight, note: value.note || undefined };
      const parsed = spoolAdjustSchema.safeParse(body);
      adjust.mutate(parsed.success ? parsed.data : body, {
        onSuccess: onClose,
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Adjustment rejected',
            description: err instanceof ApiError ? err.message : 'Please try again.',
          }),
      });
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title="Adjust spool weight"
      description="Recalibration posts an adjustment ledger entry (FR-104)."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label>Entry mode</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as 'net' | 'gross')}>
            <option value="net">Net weight</option>
            <option value="gross">Gross weight (tare subtracted)</option>
          </Select>
        </div>
        <form.Field name="weight">
          {(field) => (
            <FormField
              field={field}
              label={mode === 'net' ? 'Net weight (g)' : 'Gross weight (g)'}
              required
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="0.1"
                  className="font-mono"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="note">
          {(field) => (
            <FormField field={field} label="Note">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={adjust.isPending}>
            Post adjustment
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function StatusDialog({
  spoolId,
  current,
  mapped,
  onClose,
}: {
  spoolId: string;
  current: string;
  mapped: boolean;
  onClose: () => void;
}) {
  const transition = useTransitionSpoolStatus(spoolId);
  const [status, setStatus] = useState(current);
  const [confirmUnmap, setConfirmUnmap] = useState(false);
  const pushToast = useUiStore((s) => s.pushToast);

  const needsUnmapConfirm = mapped && status === 'archived';

  function submit(withUnmap: boolean) {
    transition.mutate(
      { status, confirmUnmap: withUnmap },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ApiError && err.status === 409) {
            setConfirmUnmap(true);
          } else {
            pushToast({
              variant: 'error',
              title: 'Transition failed',
              description: err instanceof ApiError ? err.message : undefined,
            });
          }
        },
      },
    );
  }

  return (
    <>
      <Dialog
        open={!confirmUnmap}
        onClose={onClose}
        title="Change spool status"
        description="Lifecycle transitions (FR-107)."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={transition.isPending} onClick={() => submit(false)}>
              Apply
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <Label>New status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {SPOOL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          {needsUnmapConfirm ? (
            <p className="text-xs text-muted-foreground">
              This spool is mapped — archiving will unmap it (ES-107.1).
            </p>
          ) : null}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmUnmap}
        onClose={() => {
          setConfirmUnmap(false);
          onClose();
        }}
        onConfirm={() => submit(true)}
        title="Unmap and archive?"
        description="This spool is mapped to a slot. Confirm to atomically unmap and archive it (ES-107.1)."
        confirmLabel="Unmap & archive"
        destructive
        loading={transition.isPending}
      />
    </>
  );
}
