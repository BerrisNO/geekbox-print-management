import type { MaterialDef } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import type { ColumnDef } from '@tanstack/react-table';
import { Archive, Layers, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import {
  useArchiveMaterial,
  useCreateMaterial,
  useMaterials,
  useUpdateMaterial,
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

export function MaterialsPage() {
  const materials = useMaterials(true);
  const [editing, setEditing] = useState<MaterialDef | 'new' | null>(null);
  const [archiving, setArchiving] = useState<MaterialDef | null>(null);
  const archive = useArchiveMaterial();

  const columns = useMemo<ColumnDef<MaterialDef, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: (c) => <span className="font-medium">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'densityGCm3',
        header: 'Density (g/cm³)',
        cell: (c) => <span className="font-mono">{c.getValue<number>().toFixed(2)}</span>,
      },
      {
        accessorKey: 'productCount',
        header: 'Filaments',
        cell: (c) => {
          const n = c.getValue<number>();
          return n > 0 ? (
            <span className="font-mono">{n}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        cell: (c) => (
          <span className="line-clamp-1 max-w-64 text-muted-foreground">
            {orDash(c.getValue<string | null>())}
          </span>
        ),
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
              aria-label="Edit material"
              onClick={() => setEditing(c.row.original)}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            {!c.row.original.archived ? (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Archive material"
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
        title="Materials"
        description="Your material types (PLA, PETG, …). Renames update every filament that uses the material; density is the default for new filaments."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> New material
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={materials.data}
        isLoading={materials.isLoading}
        isError={materials.isError}
        onRetry={() => materials.refetch()}
        empty={
          <EmptyState
            icon={Layers}
            title="No materials yet"
            description="Add a material type to categorize your filaments."
            action={<Button onClick={() => setEditing('new')}>New material</Button>}
          />
        }
      />

      {editing ? (
        <MaterialSheet
          material={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <ConfirmDialog
        open={!!archiving}
        onClose={() => setArchiving(null)}
        onConfirm={() => {
          if (archiving) archive.mutate(archiving.id, { onSuccess: () => setArchiving(null) });
        }}
        title="Archive material?"
        description="Existing filaments keep the material; it is hidden from pickers for new filaments."
        confirmLabel="Archive"
        loading={archive.isPending}
      />
    </>
  );
}

function MaterialSheet({
  material,
  onClose,
}: {
  material: MaterialDef | null;
  onClose: () => void;
}) {
  const create = useCreateMaterial();
  const update = useUpdateMaterial(material?.id ?? '');
  const mutation = material ? update : create;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: material?.name ?? '',
      densityGCm3: material?.densityGCm3 ?? ('' as number | ''),
      notes: material?.notes ?? '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const clean = {
        name: value.name,
        densityGCm3: value.densityGCm3 === '' ? undefined : Number(value.densityGCm3),
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
            err instanceof ApiError ? err.message : 'Could not save material. Please try again.',
          );
        }
      }
    },
  });

  return (
    <Sheet open onClose={onClose} title={material ? 'Edit material' : 'New material'}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <FormField
              field={field}
              label="Name"
              required
              hint={
                material && material.productCount > 0
                  ? `Renaming updates ${material.productCount} filament(s)`
                  : undefined
              }
            >
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
        <form.Field name="densityGCm3">
          {(field) => (
            <FormField
              field={field}
              label="Density (g/cm³)"
              hint="Default for new filaments of this material; blank picks a sensible default"
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  className="font-mono"
                  value={field.state.value}
                  onChange={(e) =>
                    field.handleChange(e.target.value === '' ? '' : Number(e.target.value))
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
            {material ? 'Save' : 'Create'}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
