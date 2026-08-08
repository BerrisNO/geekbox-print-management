import type { FilamentUsage } from '@geekbox/shared';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Link2 } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useAttributeUsage, useJob, useRecalculateJob, useSpools } from '../api/hooks';
import { JobOutcomePill } from '../components/data/pills';
import { CostBreakdownPanel } from '../components/feature/CostBreakdownPanel';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Combobox } from '../components/ui/combobox';
import { Dialog } from '../components/ui/dialog';
import { ErrorState, Skeleton } from '../components/ui/misc';
import { formatDateTime, formatDuration, formatGrams, orDash } from '../lib/format';
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
        title={data.jobName}
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
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <JobOutcomePill outcome={data.outcome} />
              <Badge>{data.source}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row">
              {data.coverUrl ? (
                <img
                  src={data.coverUrl}
                  alt={`${data.jobName} preview`}
                  className="h-32 w-32 shrink-0 rounded-md border border-border object-cover"
                />
              ) : null}
              <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-3">
                <Field label="Printer">{orDash(data.printerName)}</Field>
                <Field label="Started">{formatDateTime(data.startedAt)}</Field>
                <Field label="Ended">{formatDateTime(data.endedAt)}</Field>
                <Field label="Duration">{formatDuration(data.durationMin)}</Field>
                <Field label="Filament used">{formatGrams(data.totalUsedG)}</Field>
                <Field label="Usage status">{data.usageStatus}</Field>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filament usages</CardTitle>
            </CardHeader>
            <CardContent>
              {data.usages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No usages recorded for this job.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.usages.map((u) => (
                    <UsageRow key={u.id} jobId={id} usage={u} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}

function UsageRow({ jobId, usage }: { jobId: string; usage: FilamentUsage }) {
  const [attrOpen, setAttrOpen] = useState(false);
  const attribute = useAttributeUsage(jobId);
  const pushToast = useUiStore((s) => s.pushToast);

  const slotLabel = usage.slotRef === 'reported' ? 'reported' : `slot ${usage.slotRef}`;
  const filamentDesc = [usage.trayType, usage.colorHex].filter(Boolean).join(' · ');

  function attributeTo(spoolId: string) {
    attribute.mutate(
      { usageId: usage.id, spoolId },
      {
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Attribution failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      },
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center gap-3">
        {usage.colorHex ? (
          <span
            className="size-6 shrink-0 rounded-full border border-border"
            style={{ backgroundColor: usage.colorHex }}
            title={usage.colorHex}
            aria-hidden
          />
        ) : null}
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">
            {slotLabel}
            {filamentDesc ? ` · ${filamentDesc}` : ''}
          </span>
          <span className="font-mono">
            {usage.usedG !== null
              ? formatGrams(usage.usedG)
              : usage.usedMm !== null
                ? `${usage.usedMm} mm`
                : '—'}
            {usage.estimated ? <Badge className="ml-1">estimated</Badge> : null}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {usage.attributed ? (
          <Link
            to="/inventory/spools/$spoolId"
            params={{ spoolId: usage.spoolId ?? '' }}
            className="font-mono text-xs text-primary hover:underline"
          >
            {usage.spoolLabel ?? 'spool'}
          </Link>
        ) : (
          <>
            {usage.suggestedSpoolId ? (
              <Button
                size="sm"
                loading={attribute.isPending}
                onClick={() => attributeTo(usage.suggestedSpoolId as string)}
              >
                <Link2 className="size-3" aria-hidden /> Use{' '}
                {usage.suggestedSpoolLabel ?? 'mapped spool'}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setAttrOpen(true)}>
              {usage.suggestedSpoolId ? (
                'Other…'
              ) : (
                <>
                  <Link2 className="size-3" aria-hidden /> Attribute
                </>
              )}
            </Button>
          </>
        )}
      </div>
      {attrOpen ? (
        <AttributeDialog jobId={jobId} usage={usage} onClose={() => setAttrOpen(false)} />
      ) : null}
    </li>
  );
}

function AttributeDialog({
  jobId,
  usage,
  onClose,
}: {
  jobId: string;
  usage: FilamentUsage;
  onClose: () => void;
}) {
  const spools = useSpools();
  const attribute = useAttributeUsage(jobId);
  const [spoolId, setSpoolId] = useState<string | null>(null);
  const pushToast = useUiStore((s) => s.pushToast);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Attribute usage to spool"
      description={`Assign the ${usage.slotRef} usage to a spool — posts the deduction (ES-402.2).`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!spoolId}
            loading={attribute.isPending}
            onClick={() => {
              if (!spoolId) return;
              attribute.mutate(
                { usageId: usage.id, spoolId },
                {
                  onSuccess: onClose,
                  onError: (err) =>
                    pushToast({
                      variant: 'error',
                      title: 'Attribution failed',
                      description: err instanceof ApiError ? err.message : undefined,
                    }),
                },
              );
            }}
          >
            Attribute
          </Button>
        </>
      }
    >
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
    </Dialog>
  );
}
