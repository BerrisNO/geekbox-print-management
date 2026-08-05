import type { Printer } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { PrinterIcon, RefreshCw } from 'lucide-react';
import { ApiError } from '../../api/client';
import {
  usePrinters,
  useRefreshPrinters,
  useRegisterPrinter,
  useUpdatePrinter,
} from '../../api/hooks';
import { FormField } from '../../forms/FormField';
import { formatDateTime } from '../../lib/format';
import { useUiStore } from '../../stores/ui-store';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { EmptyState, Skeleton, Switch } from '../ui/misc';

/** PrintersPanel + PrinterRow (FR-302): discovery/refresh, tracked toggle, manual
 *  serial registration (ADR-012 Q-02 fallback). */
export function PrintersPanel({ linked }: { linked: boolean }) {
  const printers = usePrinters();
  const refresh = useRefreshPrinters();
  const register = useRegisterPrinter();
  const pushToast = useUiStore((s) => s.pushToast);

  const form = useForm({
    defaultValues: { serial: '', name: '', model: '' },
    onSubmit: ({ value, formApi }) => {
      register.mutate(
        { serial: value.serial, name: value.name, model: value.model || undefined },
        {
          onSuccess: () => {
            pushToast({ variant: 'success', title: 'Printer added' });
            formApi.reset();
          },
          onError: (err) =>
            pushToast({
              variant: 'error',
              title: 'Could not add printer',
              description:
                err instanceof ApiError && err.status === 409
                  ? 'That serial already exists.'
                  : undefined,
            }),
        },
      );
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Printers</CardTitle>
        <Button
          size="sm"
          variant="outline"
          loading={refresh.isPending}
          disabled={!linked}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw className="size-4" aria-hidden /> Refresh / discover
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!linked ? (
          <p className="text-sm text-muted-foreground">
            Link your Bambu account first to discover printers.
          </p>
        ) : null}

        {printers.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (printers.data ?? []).length === 0 ? (
          <EmptyState
            icon={PrinterIcon}
            title="No printers discovered"
            description="Refresh to discover printers, or add one by serial below."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {(printers.data ?? []).map((p) => (
              <PrinterRow key={p.id} printer={p} />
            ))}
          </ul>
        )}

        <div className="rounded-md border border-dashed border-border p-3">
          <p className="mb-2 text-sm font-medium">Add printer by serial</p>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <div className="grid grid-cols-3 gap-2">
              <form.Field name="serial">
                {(field) => (
                  <FormField field={field} label="Serial" required>
                    {({ id, 'aria-invalid': invalid }) => (
                      <Input
                        id={id}
                        className="font-mono"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        aria-invalid={invalid}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
              <form.Field name="name">
                {(field) => (
                  <FormField field={field} label="Name" required>
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
              <form.Field name="model">
                {(field) => (
                  <FormField field={field} label="Model">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </FormField>
                )}
              </form.Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={register.isPending}>
                Add printer
              </Button>
            </div>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function PrinterRow({ printer }: { printer: Printer }) {
  const update = useUpdatePrinter(printer.id);

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{printer.name}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {printer.serial}
          {printer.model ? ` · ${printer.model}` : ''}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={printer.online ? 'success' : 'neutral'}>
            {printer.online ? 'online' : 'offline'}
          </Badge>
          <Badge>{printer.registration}</Badge>
          {printer.lastSeenAt ? <span>last seen {formatDateTime(printer.lastSeenAt)}</span> : null}
        </span>
      </div>
      <span className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Tracked</span>
        <Switch
          checked={printer.tracked}
          disabled={update.isPending}
          aria-label={`Track ${printer.name} on dashboard`}
          onCheckedChange={(tracked) => update.mutate({ tracked })}
        />
      </span>
    </li>
  );
}
