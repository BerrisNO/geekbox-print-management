import type { Customer } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Pencil, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  useArchiveCustomer,
  useCreateCustomer,
  useCustomers,
  useUpdateCustomer,
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

export function CustomersPage() {
  const customers = useCustomers(true);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Customer | null>(null);
  const archive = useArchiveCustomer();

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      { accessorKey: 'email', header: 'Email', cell: (c) => orDash(c.getValue<string | null>()) },
      { accessorKey: 'phone', header: 'Phone', cell: (c) => orDash(c.getValue<string | null>()) },
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
              aria-label="Edit customer"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive customer"
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
        title="Customers"
        description="The people you make parts for. Archive rather than delete when referenced."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New customer
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={customers.data}
        isLoading={customers.isLoading}
        isError={customers.isError}
        onRetry={() => customers.refetch()}
        empty={
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Add a customer to associate parts with who ordered them."
            action={<Button onClick={() => setEditing('new')}>New customer</Button>}
          />
        }
      />

      {editing ? (
        <CustomerSheet
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) });
        }}
        title="Archive customer?"
        description="Historical references are preserved. The customer is hidden from active lists."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function CustomerSheet({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? '');
  const mutation = customer ? update : create;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      notes: customer?.notes ?? '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const clean = {
        name: value.name,
        email: value.email || undefined,
        phone: value.phone || undefined,
        notes: value.notes || undefined,
      };
      try {
        await mutation.mutateAsync(clean);
        onClose();
      } catch (err) {
        if (err instanceof ApiError && Object.keys(err.fieldErrors).length > 0) {
          applyFieldErrors(
            form as unknown as Parameters<typeof applyFieldErrors>[0],
            err.fieldErrors,
          );
        } else {
          setFormError(
            err instanceof ApiError ? err.message : 'Could not save customer. Please try again.',
          );
        }
      }
    },
  });

  return (
    <Sheet open onClose={onClose} title={customer ? 'Edit customer' : 'New customer'}>
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
        <form.Field name="email">
          {(field) => (
            <FormField field={field} label="Email">
              {({ id, 'aria-invalid': invalid }) => (
                <Input
                  id={id}
                  type="email"
                  value={field.state.value}
                  aria-invalid={invalid}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="phone">
          {(field) => (
            <FormField field={field} label="Phone">
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
            {customer ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
