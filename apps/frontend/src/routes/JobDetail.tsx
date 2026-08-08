import type { FilamentUsage, PrintJobDetail } from '@geekbox/shared';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Link2, Pencil } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  useAttributeUsage,
  useCorrectJob,
  useJob,
  useRecalculateJob,
  useSpools,
} from '../api/hooks';
import { JobOutcomePill } from '../components/data/pills';
import { CostBreakdownPanel } from '../components/feature/CostBreakdownPanel';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Combobox } from '../components/ui/combobox';
import { Dialog } from '../components/ui/dialog';
import { ErrorState, Skeleton } from '../components/ui/misc';
import { formatDateTime, formatDuration, formatGrams, formatLength, orDash } from '../lib/format';
import { useUiStore } from '../stores/ui-store';

export function JobDetailPage() {
  const { id } = useParams({ from: '/_app/jobs/$id' });
  const job = useJob(id);
  const recalc = useRecalculateJob(id);

  if (job.isLoading) return <Skeleton className="h-96 w-full" />;
  if (job.isError || !job.data) return <ErrorState onRetry={() => job.refetch()} />;

  const data = job.data;

  return (
    <>
      <PageHeader
        title={data.jobName || 'Untitled job'}
        actions={
          <Link
            to="/jobs"
            search={{
              sort: 'date',
              printerId: undefined,
              outcome: undefined,
              from: undefined,
              to: undefined,
            }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <JobInfoCard data={data} />
          <FilamentCard data={data} jobId={id} />
        </div>

        <aside>
          <CostBreakdownPanel
            cost={data.costBreakdown}
            onRecalculate={() => recalc.mutate()}
            recalculating={recalc.isPending}
          />
        </aside>
      </div>
    </>
  );
}

function JobInfoCard({ data }: { data: PrintJobDetail }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        {data.source === 'telemetry' && !data.endedAt ? (
          <Badge variant="info">printing…</Badge>
        ) : (
          <JobOutcomePill outcome={data.outcome} />
        )}
        <div className="flex items-center gap-2">
          {data.bambuTaskId ? (
            <span className="font-mono text-xs text-muted-foreground">#{data.bambuTaskId}</span>
          ) : null}
          <Badge>{data.source}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 sm:flex-row">
        {data.coverUrl ? (
          <img
            src={data.coverUrl}
            alt={`${data.jobName} preview`}
            className="h-44 w-44 shrink-0 self-start rounded-lg border border-border bg-muted/30 object-cover"
          />
        ) : null}
        <dl className="grid flex-1 grid-cols-2 content-start gap-x-6 gap-y-3 text-sm md:grid-cols-3">
          <Field label="Printer">{orDash(data.printerName)}</Field>
          <Field label="Started">{formatDateTime(data.startedAt)}</Field>
          <Field label="Ended">{formatDateTime(data.endedAt)}</Field>
          <Field label="Duration">{formatDuration(data.durationMin)}</Field>
          <Field label="Filament (linked)">{formatGrams(data.totalUsedG)}</Field>
          <Field label="Filament (Bambu)">{formatGrams(data.totalWeightG)}</Field>
          <Field label="Length">{formatLength(data.totalLengthMm)}</Field>
          <Field label="Plate">
            {data.bedType
              ? `${data.bedType.replace(/_/g, ' ')}${data.plateIndex != null ? ` · #${data.plateIndex}` : ''}`
              : data.plateIndex != null
                ? `#${data.plateIndex}`
                : '—'}
          </Field>
          <Field label="Usage status">{data.usageStatus}</Field>
        </dl>
      </CardContent>
    </Card>
  );
}

function FilamentCard({ data, jobId }: { data: PrintJobDetail; jobId: string }) {
  const unlinked = data.usages.filter((u) => !u.attributed && (u.usedG ?? 0) > 0).length;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Filament</CardTitle>
        {unlinked > 0 ? (
          <Badge variant="warning">{unlinked} not linked to a spool</Badge>
        ) : data.usages.length > 0 ? (
          <Badge variant="success">all linked</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {data.usages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No filament reported for this job. Use a correction to add usage manually.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.usages.map((u) => (
              <UsageRow key={u.id} jobId={jobId} usage={u} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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

function UsageRow({ jobId, usage }: { jobId: string; usage: FilamentUsage }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const attribute = useAttributeUsage(jobId);
  const pushToast = useUiStore((s) => s.pushToast);

  const slotLabel = usage.slotRef === 'reported' ? 'reported total' : `slot ${usage.slotRef}`;
  const filamentDesc = [usage.trayType, usage.filamentId].filter(Boolean).join(' · ');

  function quickAttribute(spoolId: string) {
    attribute.mutate(
      { usageId: usage.id, spoolId },
      {
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Linking failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center gap-3">
        <span
          className="size-8 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: usage.colorHex ?? 'transparent' }}
          title={usage.colorHex ?? undefined}
          aria-hidden
        />
        <div className="flex flex-col">
          <span className="font-medium">
            {usage.trayType ?? 'Filament'}
            {usage.colorHex ? (
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                {usage.colorHex}
              </span>
            ) : null}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {slotLabel}
            {filamentDesc && usage.trayType !== filamentDesc ? ` · ${usage.filamentId ?? ''}` : ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-base">
          {usage.usedG !== null
            ? formatGrams(usage.usedG)
            : usage.usedMm !== null
              ? `${usage.usedMm} mm`
              : '—'}
          {usage.estimated ? <Badge className="ml-1">estimated</Badge> : null}
        </span>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {usage.attributed ? (
            <>
              <Link
                to="/inventory/spools/$spoolId"
                params={{ spoolId: usage.spoolId ?? '' }}
                className="font-mono text-xs text-primary hover:underline"
              >
                {usage.spoolLabel ?? 'spool'}
              </Link>
              <Button size="sm" variant="ghost" onClick={() => setDialogOpen(true)}>
                <Pencil className="size-3" aria-hidden /> Change
              </Button>
            </>
          ) : (
            <>
              {usage.suggestedSpoolId ? (
                <Button
                  size="sm"
                  loading={attribute.isPending}
                  onClick={() => quickAttribute(usage.suggestedSpoolId as string)}
                >
                  <Link2 className="size-3" aria-hidden /> Use{' '}
                  {usage.suggestedSpoolLabel ?? 'mapped spool'}
                </Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                {usage.suggestedSpoolId ? (
                  'Other…'
                ) : (
                  <>
                    <Link2 className="size-3" aria-hidden /> Link spool
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {dialogOpen ? (
        <LinkSpoolDialog jobId={jobId} usage={usage} onClose={() => setDialogOpen(false)} />
      ) : null}
    </li>
  );
}

/**
 * Link (or re-link) a usage to a spool with an optional gram override. Runs
 * through the correction endpoint, which handles both fresh attribution and
 * reverse-and-repost when the usage is already linked (override on older jobs).
 */
function LinkSpoolDialog({
  jobId,
  usage,
  onClose,
}: {
  jobId: string;
  usage: FilamentUsage;
  onClose: () => void;
}) {
  const spools = useSpools();
  const correct = useCorrectJob(jobId);
  const [spoolId, setSpoolId] = useState<string | null>(usage.spoolId);
  const [grams, setGrams] = useState<string>(usage.usedG != null ? String(usage.usedG) : '');
  const pushToast = useUiStore((s) => s.pushToast);

  function submit(confirmArchived = false) {
    if (!spoolId) return;
    const usedG = grams.trim() === '' ? undefined : Number(grams);
    if (usedG !== undefined && (!Number.isFinite(usedG) || usedG <= 0)) {
      pushToast({ variant: 'error', title: 'Grams must be a positive number' });
      return;
    }
    correct.mutate(
      {
        usages: [
          {
            usageId: usage.id,
            spoolId,
            ...(usedG !== undefined ? { usedG } : {}),
            ...(confirmArchived ? { confirmArchivedSpool: true } : {}),
          },
        ],
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'SPOOL_ARCHIVED') {
            if (window.confirm('That spool is archived. Link it anyway?')) {
              submit(true);
              return;
            }
            return;
          }
          pushToast({
            variant: 'error',
            title: 'Linking failed',
            description: err instanceof ApiError ? err.message : undefined,
          });
        },
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={usage.attributed ? 'Change linked spool' : 'Link usage to spool'}
      description={
        usage.attributed
          ? 'Re-links this usage: the old deduction is reversed and a new one posted.'
          : 'Links this usage to a spool and posts the filament deduction.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!spoolId} loading={correct.isPending} onClick={() => submit()}>
            {usage.attributed ? 'Re-link' : 'Link'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Combobox
          options={(spools.data ?? []).map((s) => ({
            value: s.id,
            label: `${s.label} — ${s.product.material} ${s.product.colorName}`,
            hint: formatGrams(s.remainingNetWeightG),
          }))}
          value={spoolId}
          onChange={setSpoolId}
          placeholder="Select a spool…"
        />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs text-muted-foreground">
            Grams used {usage.usedG != null ? `(Bambu reported ${formatGrams(usage.usedG)})` : ''}
          </span>
          <input
            type="number"
            min={0}
            step="0.1"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="h-11 rounded-md border border-input bg-surface px-3 font-mono text-sm"
            placeholder="Keep reported weight"
          />
        </label>
      </div>
    </Dialog>
  );
}
