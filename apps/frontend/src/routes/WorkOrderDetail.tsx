import type { WorkOrderLine, WorkOrderStatus } from '@geekbox/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, Link2, Unlink } from 'lucide-react';
import { useState } from 'react';
import {
  useArchiveWorkOrder,
  useJobs,
  useLinkJobToLine,
  useUnlinkJobFromLine,
  useUpdateWorkOrder,
  useWorkOrder,
} from '../api/hooks';
import { WorkOrderStatusPill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { ErrorState, Skeleton } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { formatDate, formatMoney, orDash } from '../lib/format';

/** Allowed status transitions from each state (linear + cancel). */
const NEXT_STATUS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  in_production: 'In production',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function WorkOrderDetailPage() {
  const { id } = useParams({ from: '/_app/work-orders/$id' });
  const navigate = useNavigate();
  const wo = useWorkOrder(id);
  const update = useUpdateWorkOrder(id);
  const archive = useArchiveWorkOrder();
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (wo.isLoading) return <Skeleton className="h-96 w-full" />;
  if (wo.isError || !wo.data) return <ErrorState onRetry={() => wo.refetch()} />;

  const data = wo.data;
  const transitions = NEXT_STATUS[data.status];

  return (
    <>
      <PageHeader
        title={`Work order — ${data.customerName}`}
        actions={
          <Link
            to="/work-orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <WorkOrderStatusPill status={data.status} />
          <div className="flex items-center gap-2">
            {transitions.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'cancelled' ? 'outline' : 'primary'}
                loading={update.isPending}
                onClick={() => update.mutate({ status: s })}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
            {!data.archived ? (
              <Button size="sm" variant="ghost" onClick={() => setArchiveOpen(true)}>
                <Ban className="size-4" aria-hidden /> Archive
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <Field label="Customer">{data.customerName}</Field>
            <Field label="Reference">{orDash(data.orderRef)}</Field>
            <Field label="Order date">{formatDate(data.orderDate)}</Field>
            <Field label="Lines">{data.lineCount}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {data.lines.map((l) => (
              <LineRow key={l.id} workOrderId={id} line={l} />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Order totals</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Field label="Sell">{formatMoney(data.totals.sellMinor)}</Field>
              <Field label="Cost">{formatMoney(data.totals.costMinor)}</Field>
              <Field label="Margin">{formatMoney(data.totals.marginMinor)}</Field>
              <Field label="Margin %">{data.totals.marginPct}%</Field>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {data.notes ? data.notes : 'No notes.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() =>
          archive.mutate(id, {
            onSuccess: () => {
              setArchiveOpen(false);
              navigate({ to: '/work-orders' });
            },
          })
        }
        title="Archive work order?"
        description="It will be hidden from the default list. Linked jobs are unaffected."
        confirmLabel="Archive"
        destructive
        loading={archive.isPending}
      />
    </>
  );
}

function LineRow({ workOrderId, line }: { workOrderId: string; line: WorkOrderLine }) {
  const jobs = useJobs();
  const link = useLinkJobToLine(workOrderId);
  const unlink = useUnlinkJobFromLine(workOrderId);
  const [pick, setPick] = useState('');

  // Jobs available to attach: those not yet linked to any work-order line.
  const available = (jobs.data?.jobs ?? []).filter((j) => j.workOrderLineId == null);

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{line.partName}</span>{' '}
          <span className="font-mono text-xs text-muted-foreground">{line.partArticleNo}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Produced{' '}
          <span className="font-mono text-foreground">
            {line.producedQty}/{line.quantity}
          </span>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
        <Field label="Qty">{line.quantity}</Field>
        <Field label="Unit price">{formatMoney(line.unitPriceMinor)}</Field>
        <Field label="Line total">{formatMoney(line.lineSellMinor)}</Field>
        <Field label="Margin">{formatMoney(line.lineMarginMinor)}</Field>
        <Field label="Est. cost">{formatMoney(line.lineCostMinor)}</Field>
        <Field label="Actual cost">
          {formatMoney(line.actualCostMinor)}
          {line.actualIncomplete ? (
            <Badge variant="warning" className="ml-1">
              incomplete
            </Badge>
          ) : null}
        </Field>
      </dl>

      <div className="mt-3">
        <div className="text-xs text-muted-foreground">Linked jobs</div>
        {line.linkedJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-sm">
            {line.linkedJobs.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-2">
                <span>
                  {j.jobName || j.id}{' '}
                  <span className="text-xs text-muted-foreground">
                    {j.outcome} · {formatMoney(j.costMinor)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={unlink.isPending}
                  onClick={() => unlink.mutate({ lineId: line.id, jobId: j.id })}
                >
                  <Unlink className="size-4" aria-hidden /> Unlink
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Attach a print job…</option>
            {available.map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobName || j.id} ({j.outcome})
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          disabled={!pick}
          loading={link.isPending}
          onClick={() =>
            link.mutate({ lineId: line.id, jobId: pick }, { onSuccess: () => setPick('') })
          }
        >
          <Link2 className="size-4" aria-hidden /> Attach
        </Button>
      </div>
    </div>
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
