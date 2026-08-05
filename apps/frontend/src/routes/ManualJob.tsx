import { JOB_OUTCOMES, manualJobInputSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '../api/client';
import { useCreateManualJob, usePrinters, useSpools } from '../api/hooks';
import { PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Combobox } from '../components/ui/combobox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { FormField } from '../forms/FormField';
import { formatGrams } from '../lib/format';
import { useUiStore } from '../stores/ui-store';

interface UsageDraft {
  spoolId: string | null;
  usedG: number;
}

export function ManualJobPage() {
  const navigate = useNavigate();
  const printers = usePrinters();
  const spools = useSpools();
  const create = useCreateManualJob();
  const pushToast = useUiStore((s) => s.pushToast);

  const form = useForm({
    defaultValues: {
      jobName: '',
      printerId: '',
      startedAt: '',
      endedAt: '',
      durationMin: undefined as number | undefined,
      outcome: 'success' as (typeof JOB_OUTCOMES)[number],
      usages: [] as UsageDraft[],
    },
    onSubmit: ({ value }) => {
      const clean = {
        jobName: value.jobName,
        printerId: value.printerId || undefined,
        startedAt: value.startedAt || undefined,
        endedAt: value.endedAt || undefined,
        durationMin: value.durationMin || undefined,
        outcome: value.outcome,
        usages: value.usages
          .filter((u) => u.usedG > 0)
          .map((u) => ({ spoolId: u.spoolId ?? undefined, usedG: u.usedG })),
      };
      const parsed = manualJobInputSchema.safeParse(clean);
      create.mutate(parsed.success ? parsed.data : clean, {
        onSuccess: (job) => navigate({ to: '/jobs/$id', params: { id: job.id } }),
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Could not create job',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      });
    },
  });

  return (
    <>
      <PageHeader
        title="Manual job entry"
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
      <Card>
        <CardContent className="p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="jobName">
              {(field) => (
                <FormField field={field} label="Job name" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </form.Field>

            <div className="grid grid-cols-2 gap-3">
              <form.Field name="printerId">
                {(field) => (
                  <FormField field={field} label="Printer">
                    {({ id }) => (
                      <Select
                        id={id}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      >
                        <option value="">(none)</option>
                        {(printers.data ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                )}
              </form.Field>
              <form.Field name="outcome">
                {(field) => (
                  <FormField field={field} label="Outcome" required>
                    {({ id }) => (
                      <Select
                        id={id}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value as never)}
                      >
                        {JOB_OUTCOMES.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormField>
                )}
              </form.Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <form.Field name="startedAt">
                {(field) => (
                  <FormField field={field} label="Started">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="datetime-local"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
              <form.Field name="endedAt">
                {(field) => (
                  <FormField field={field} label="Ended">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="datetime-local"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
              <form.Field name="durationMin">
                {(field) => (
                  <FormField field={field} label="Duration (min)">
                    {({ id }) => (
                      <Input
                        id={id}
                        type="number"
                        className="font-mono"
                        value={field.state.value ?? ''}
                        onChange={(e) =>
                          field.handleChange(e.target.value ? Number(e.target.value) : undefined)
                        }
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Filament usages</Label>
              <form.Field name="usages" mode="array">
                {(field) => (
                  <div className="flex flex-col gap-2">
                    {field.state.value.map((_, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: stable array-field row order
                        key={i}
                        className="flex items-end gap-2 rounded-md border border-border p-2"
                      >
                        <form.Field name={`usages[${i}].spoolId`}>
                          {(sub) => (
                            <div className="flex-1">
                              <Label className="text-xs">Spool</Label>
                              <Combobox
                                options={(spools.data ?? []).map((s) => ({
                                  value: s.id,
                                  label: `${s.label} — ${s.product.material} ${s.product.colorName}`,
                                  hint: formatGrams(s.remainingNetWeightG),
                                }))}
                                value={sub.state.value}
                                onChange={(v) => sub.handleChange(v)}
                                placeholder="Select a spool…"
                              />
                            </div>
                          )}
                        </form.Field>
                        <form.Field name={`usages[${i}].usedG`}>
                          {(sub) => (
                            <div className="w-28">
                              <Label className="text-xs">Used (g)</Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="font-mono"
                                value={sub.state.value}
                                onChange={(e) => sub.handleChange(Number(e.target.value))}
                              />
                            </div>
                          )}
                        </form.Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove usage"
                          onClick={() => field.removeValue(i)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => field.pushValue({ spoolId: null, usedG: 0 })}
                    >
                      <Plus className="size-4" aria-hidden /> Add usage
                    </Button>
                  </div>
                )}
              </form.Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  navigate({
                    to: '/jobs',
                    search: {
                      sort: 'date',
                      printerId: undefined,
                      outcome: undefined,
                      from: undefined,
                      to: undefined,
                    },
                  })
                }
              >
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Create job
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
