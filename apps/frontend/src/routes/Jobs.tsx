import { JOB_OUTCOMES, type PrintJob } from '@geekbox/shared';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Plus, RefreshCw } from 'lucide-react';
import { useMemo } from 'react';
import { apiUrl } from '../api/client';
import { useJobs, useSyncTaskHistory } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { JobOutcomePill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { EmptyState } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import {
  formatDateTime,
  formatDuration,
  formatGrams,
  formatLength,
  formatMoney,
  formatPct,
} from '../lib/format';

const routeApi = getRouteApi('/_app/jobs');

export function JobsPage() {
  const navigate = useNavigate();
  const search = routeApi.useSearch();
  const jobs = useJobs(search);
  const sync = useSyncTaskHistory();

  const columns = useMemo<ColumnDef<PrintJob, unknown>[]>(
    () => [
      {
        id: 'cover',
        header: '',
        cell: (c) => {
          const url = c.row.original.coverUrl;
          return url ? (
            <img
              src={url}
              alt=""
              loading="lazy"
              className="size-12 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="size-12 rounded-md border border-dashed border-border bg-muted/40" />
          );
        },
      },
      {
        accessorKey: 'jobName',
        header: 'Job',
        cell: (c) => (
          <div className="flex flex-col">
            <span className="font-medium">{c.getValue<string>() || 'Untitled'}</span>
            <span className="text-xs text-muted-foreground">
              {c.row.original.printerName ?? '—'}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'endedAt',
        header: 'Printed',
        cell: (c) => {
          const j = c.row.original;
          return (
            <div className="flex flex-col">
              <span>{formatDateTime(j.endedAt ?? j.startedAt)}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatDuration(j.durationMin)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'outcome',
        header: 'Outcome',
        cell: (c) => <JobOutcomePill outcome={c.row.original.outcome} />,
      },
      {
        id: 'filament',
        header: 'Filament',
        accessorFn: (r) => r.totalUsedG,
        cell: (c) => {
          const j = c.row.original;
          const chips = j.usageSummary.filter((u) => (u.usedG ?? 0) > 0);
          return (
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1">
                {chips.map((u, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: static per-render summary
                    key={i}
                    className="inline-block size-3.5 rounded-full border border-border"
                    style={{ backgroundColor: u.colorHex ?? 'transparent' }}
                    title={`${u.trayType ?? '?'} ${formatGrams(u.usedG)}`}
                  />
                ))}
                <span className="ml-1 font-mono">{formatGrams(j.totalUsedG)}</span>
              </span>
              {j.totalLengthMm != null ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatLength(j.totalLengthMm)}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'linked',
        header: 'Spools',
        accessorFn: (r) => r.unattributedCount,
        cell: (c) => {
          const j = c.row.original;
          const withWeight = j.usageSummary.filter((u) => (u.usedG ?? 0) > 0);
          if (withWeight.length === 0)
            return <span className="text-xs text-muted-foreground">—</span>;
          if (j.unattributedCount > 0) {
            return <Badge variant="warning">{j.unattributedCount} unlinked</Badge>;
          }
          return <Badge variant="success">linked</Badge>;
        },
      },
      {
        id: 'cost',
        header: 'Cost',
        accessorFn: (r) => r.cost?.totalCostMinor ?? null,
        cell: (c) => {
          const cost = c.row.original.cost;
          if (!cost) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="flex items-center gap-1 font-mono">
              {formatMoney(cost.totalCostMinor)}
              {cost.incomplete ? <Badge variant="warning">incomplete</Badge> : null}
            </span>
          );
        },
      },
    ],
    [],
  );

  function setFilter(patch: Partial<typeof search>) {
    navigate({ to: '/jobs', search: { ...search, ...patch } });
  }

  const summary = jobs.data?.summary;

  return (
    <>
      <PageHeader
        title="Print jobs"
        description="History, filament linking, and cost summary."
        actions={
          <>
            <Button variant="outline" loading={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw aria-hidden /> Sync tasks
            </Button>
            <a
              href={apiUrl('/jobs/export.csv', search)}
              className={buttonVariants({ variant: 'outline' })}
              download
            >
              <Download aria-hidden /> Export CSV
            </a>
            <Button onClick={() => navigate({ to: '/jobs/new' })}>
              <Plus aria-hidden /> Manual job
            </Button>
          </>
        }
      />

      {summary ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          <SummaryStat label="Jobs" value={String(summary.count)} />
          <SummaryStat label="Success rate" value={formatPct(summary.successRatePct)} />
          <SummaryStat label="Filament used" value={formatGrams(summary.totalUsedG, 0)} />
          <SummaryStat label="Total cost" value={formatMoney(summary.totalCostMinor)} />
          <SummaryStat label="Incomplete costs" value={String(summary.incompleteCostCount)} />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-2">
        <Select
          value={search.outcome ?? ''}
          onChange={(e) => setFilter({ outcome: e.target.value || undefined })}
          className="max-w-40"
          aria-label="Filter by outcome"
        >
          <option value="">All outcomes</option>
          {JOB_OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Select
          value={search.sort}
          onChange={(e) => setFilter({ sort: e.target.value as 'date' | 'cost' })}
          className="max-w-40"
          aria-label="Sort by"
        >
          <option value="date">Sort by date</option>
          <option value="cost">Sort by cost</option>
        </Select>
        <input
          type="date"
          value={search.from ?? ''}
          onChange={(e) => setFilter({ from: e.target.value || undefined })}
          aria-label="From date"
          className="h-11 rounded-md border border-input bg-surface px-3 text-sm"
        />
        <input
          type="date"
          value={search.to ?? ''}
          onChange={(e) => setFilter({ to: e.target.value || undefined })}
          aria-label="To date"
          className="h-11 rounded-md border border-input bg-surface px-3 text-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={jobs.data?.jobs}
        isLoading={jobs.isLoading}
        isError={jobs.isError}
        onRetry={() => jobs.refetch()}
        onRowClick={(j) => navigate({ to: '/jobs/$id', params: { id: j.id } })}
        virtualize={(jobs.data?.jobs.length ?? 0) > 50}
        getRowId={(j) => j.id}
        empty={
          <EmptyState
            title="No jobs"
            description="Sync task history or add a manual job."
            action={<Button onClick={() => navigate({ to: '/jobs/new' })}>Manual job</Button>}
          />
        }
      />
    </>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 pt-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-mono text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
