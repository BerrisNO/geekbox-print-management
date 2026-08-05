import { useForm } from '@tanstack/react-form';
import { ApiError } from '../../api/client';
import { useCostRates, useUpdateCostRates } from '../../api/hooks';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { ErrorState, Label, Skeleton } from '../../components/ui/misc';
import { FormField } from '../../forms/FormField';
import { useUiStore } from '../../stores/ui-store';

export function CostRatesSettings() {
  const rates = useCostRates();
  const update = useUpdateCostRates();
  const pushToast = useUiStore((s) => s.pushToast);

  if (rates.isLoading) return <Skeleton className="h-72 w-full" />;
  if (rates.isError || !rates.data) return <ErrorState onRetry={() => rates.refetch()} />;

  return <CostRatesForm data={rates.data} update={update} pushToast={pushToast} />;
}

function CostRatesForm({
  data,
  update,
  pushToast,
}: {
  data: NonNullable<ReturnType<typeof useCostRates>['data']>;
  update: ReturnType<typeof useUpdateCostRates>;
  pushToast: ReturnType<typeof useUiStore.getState>['pushToast'];
}) {
  const form = useForm({
    defaultValues: {
      energyPricePerKwhMinor: data.energyPricePerKwhMinor ?? undefined,
      machineRatePerHourMinor: data.machineRatePerHourMinor ?? undefined,
      currencyCode: data.currencyCode,
      printerPowerDraw: data.printerPowerDraw.map((p) => ({
        printerId: p.printerId,
        printerName: p.printerName,
        watts: p.watts,
      })),
    },
    onSubmit: ({ value }) => {
      const body = {
        energyPricePerKwhMinor: value.energyPricePerKwhMinor ?? null,
        machineRatePerHourMinor: value.machineRatePerHourMinor ?? null,
        currencyCode: value.currencyCode || undefined,
        printerPowerDraw: value.printerPowerDraw.map((p) => ({
          printerId: p.printerId,
          watts: p.watts,
        })),
      };
      update.mutate(body, {
        onSuccess: () => pushToast({ variant: 'success', title: 'Cost rates saved' }),
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Save failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cost rates</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <form.Field name="energyPricePerKwhMinor">
              {(field) => (
                <FormField
                  field={field}
                  label="Energy price / kWh (minor)"
                  hint="Leave blank to disable energy cost"
                >
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
            <form.Field name="machineRatePerHourMinor">
              {(field) => (
                <FormField
                  field={field}
                  label="Machine rate / hour (minor)"
                  hint="Leave blank to disable machine cost"
                >
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

          <form.Field name="currencyCode">
            {(field) => (
              <FormField field={field} label="Currency code" hint="Display-only, 3-letter ISO code">
                {({ id, 'aria-invalid': invalid }) => (
                  <Input
                    id={id}
                    maxLength={3}
                    className="max-w-24 font-mono uppercase"
                    value={field.state.value}
                    aria-invalid={invalid}
                    onChange={(e) => field.handleChange(e.target.value.toUpperCase())}
                  />
                )}
              </FormField>
            )}
          </form.Field>

          <div className="flex flex-col gap-2">
            <Label>Per-printer power draw (watts)</Label>
            <form.Field name="printerPowerDraw" mode="array">
              {(field) =>
                field.state.value.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No printers registered yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {field.state.value.map((p, i) => (
                      <div key={p.printerId} className="flex items-center gap-2">
                        <span className="flex-1 text-sm">{p.printerName}</span>
                        <form.Field name={`printerPowerDraw[${i}].watts`}>
                          {(sub) => (
                            <Input
                              type="number"
                              className="w-28 font-mono"
                              value={sub.state.value}
                              onChange={(e) => sub.handleChange(Number(e.target.value))}
                              aria-label={`Watts for ${p.printerName}`}
                            />
                          )}
                        </form.Field>
                      </div>
                    ))}
                  </div>
                )
              }
            </form.Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={update.isPending}>
              Save cost rates
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
