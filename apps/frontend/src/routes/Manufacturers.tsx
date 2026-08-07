import type { Manufacturer } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Factory, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  useArchiveManufacturer,
  useCreateManufacturer,
  useManufacturers,
  useUpdateManufacturer,
} from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/dialog';
import { Input, Textarea } from '../components/ui/input';
import { EmptyState } from '../components/ui/misc';
import { Sheet } from '../components/ui/sheet';
import { applyFieldErrors, FormField } from '../forms/FormField';
import { orDash } from '../lib/format';

export function ManufacturersPage() {
  const manufacturers = useManufacturers(true);
  const [editing, setEditing] = useState<Manufacturer | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Manufacturer | null>(null);
  const archive = useArchiveManufacturer();

  const columns = useMemo<ColumnDef<Manufacturer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      { accessorKey: 'url', header: 'URL', cell: (c) => orDash(c.getValue<string | null>()) },
      {
        accessorKey: 'archived',
        header: 'Status',
        cell: (c) =>
          c.getValue<boolean>() ? <Badge>Archived</Badge> : <Badge variant="success">Active</Badge>,
      },
      {
        id: 'actions',
        header: '',
        cell: (c) => (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="Edit manufacturer"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive manufacturer"
                onClick={() => setArchiving(c.row.original)}
              >
                <Archive className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Manufacturers"
        description="Filament makers. Archive rather than delete when referenced."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New manufacturer
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={manufacturers.data}
        isLoading={manufacturers.isLoading}
        isError={manufacturers.isError}
        onRetry={() => manufacturers.refetch()}
        empty={
          <EmptyState
            icon={Factory}
            title="No manufacturers yet"
            description="Add a manufacturer to tag products with their maker."
            action={<Button onClick={() => setEditing('new')}>New manufacturer</Button>}
          />
        }
      />

      {editing ? (
        <ManufacturerSheet
          manufacturer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) });
        }}
        title="Archive manufacturer?"
        description="Historical references are preserved. The manufacturer is hidden from active lists."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function ManufacturerSheet({
  manufacturer,
  onClose,
}: {
  manufacturer: Manufacturer | null;
  onClose: () => void;
}) {
  const create = useCreateManufacturer();
  const update = useUpdateManufacturer(manufacturer?.id ?? '');
  const mutation = manufacturer ? update : create;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: manufacturer?.name ?? '',
      url: manufacturer?.url ?? '',
      notes: manufacturer?.notes ?? '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const clean = {
        name: value.name,
        url: value.url || undefined,
        notes: value.notes || undefined,
      };
      try {
        await mutation.mutateAsync(clean);
        onClose();
      } catch (err) {
        // Surface validation failures instead of failing silently: map RFC 7807
        // field errors onto the form, or show a general message.
        if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
          applyFieldErrors(
            form as unknown as Parameters<typeof applyFieldErrors>[0],
            err.fieldErrors,
          );
        } else {
          setFormError(
            err instanceof ApiError
              ? err.message
              : 'Could not save manufacturer. Please try again.',
          );
        }
      }
    },
  });

  return (
    <Sheet open onClose={onClose} title={manufacturer ? 'Edit manufacturer' : 'New manufacturer'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
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
        <form.Field name="url">
          {(field) => (
            <FormField field={field} label="URL">
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
        <form.Field name="notes">
          {(field) => (
            <FormField field={field} label="Notes">
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
        {formError ? (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {manufacturer ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
