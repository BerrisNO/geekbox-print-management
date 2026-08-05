import type { Vendor } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Building2, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useArchiveVendor, useCreateVendor, useUpdateVendor, useVendors } from '../api/hooks';
import { DataTable } from '../components/data/DataTable';
import { PageHeader } from '../components/shell/PageHeader';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/dialog';
import { Input, Textarea } from '../components/ui/input';
import { EmptyState } from '../components/ui/misc';
import { Sheet } from '../components/ui/sheet';
import { FormField } from '../forms/FormField';
import { orDash } from '../lib/format';

export function VendorsPage() {
  const vendors = useVendors(true);
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Vendor | null>(null);
  const archive = useArchiveVendor();

  const columns = useMemo<ColumnDef<Vendor, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      { accessorKey: 'url', header: 'URL', cell: (c) => orDash(c.getValue<string | null>()) },
      {
        accessorKey: 'leadTimeDays',
        header: 'Lead time (days)',
        cell: (c) => orDash(c.getValue<number | null>()),
      },
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
              aria-label="Edit vendor"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive vendor"
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
        title="Vendors"
        description="Filament suppliers. Archive rather than delete when referenced."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New vendor
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={vendors.data}
        isLoading={vendors.isLoading}
        isError={vendors.isError}
        onRetry={() => vendors.refetch()}
        empty={
          <EmptyState
            icon={Building2}
            title="No vendors yet"
            description="Add a vendor to start cataloging products."
            action={<Button onClick={() => setEditing('new')}>New vendor</Button>}
          />
        }
      />

      {editing ? (
        <VendorSheet vendor={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      ) : null}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) });
        }}
        title="Archive vendor?"
        description="Historical references are preserved. The vendor is hidden from active lists."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function VendorSheet({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const create = useCreateVendor();
  const update = useUpdateVendor(vendor?.id ?? '');
  const mutation = vendor ? update : create;

  const form = useForm({
    defaultValues: {
      name: vendor?.name ?? '',
      url: vendor?.url ?? '',
      leadTimeDays: vendor?.leadTimeDays ?? undefined,
      notes: vendor?.notes ?? '',
    },
    onSubmit: ({ value }) => {
      const clean = {
        name: value.name,
        url: value.url || undefined,
        leadTimeDays: value.leadTimeDays ?? undefined,
        notes: value.notes || undefined,
      };
      mutation.mutate(clean, { onSuccess: onClose });
    },
  });

  return (
    <Sheet open onClose={onClose} title={vendor ? 'Edit vendor' : 'New vendor'}>
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
        <form.Field name="leadTimeDays">
          {(field) => (
            <FormField field={field} label="Lead time (days)">
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
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {vendor ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
