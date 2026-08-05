import type { FilamentProduct } from '@geekbox/shared';
import { spoolInputSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Combobox } from '../components/ui/combobox';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/misc';
import { majorToMinor } from '../lib/format';
import { FormField } from './FormField';

/** Manual spool registration (FR-102). */
export function SpoolForm({
  products,
  onSubmit,
  onCancel,
  submitting,
}: {
  products: FilamentProduct[];
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const [productId, setProductId] = useState<string | null>(products[0]?.id ?? null);
  const [productError, setProductError] = useState(false);

  const form = useForm({
    defaultValues: {
      initialNetWeightG: 1000,
      tareWeightG: undefined as number | undefined,
      purchasePrice: undefined as number | undefined,
      acquiredAt: '',
      notes: '',
    },
    onSubmit: ({ value }) => {
      if (!productId) {
        setProductError(true);
        return;
      }
      const clean = {
        productId,
        initialNetWeightG: value.initialNetWeightG,
        tareWeightG: value.tareWeightG || undefined,
        purchasePriceMinor: majorToMinor(value.purchasePrice),
        acquiredAt: value.acquiredAt || undefined,
        notes: value.notes || undefined,
      };
      const parsed = spoolInputSchema.safeParse(clean);
      onSubmit(parsed.success ? parsed.data : clean);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label required>Product</Label>
        <Combobox
          options={products.map((p) => ({
            value: p.id,
            label: `${p.material} ${p.colorName}`,
            hint: p.vendorName,
          }))}
          value={productId}
          onChange={(v) => {
            setProductId(v);
            setProductError(false);
          }}
          placeholder="Select a product…"
          aria-invalid={productError}
        />
        {productError ? <p className="text-xs text-destructive">Select a product.</p> : null}
      </div>

      <form.Field name="initialNetWeightG">
        {(field) => (
          <FormField field={field} label="Initial net weight (g)" required>
            {(control) => (
              <Input
                {...control}
                type="number"
                className="font-mono"
                value={field.state.value}
                onChange={(e) => field.handleChange(Number(e.target.value))}
              />
            )}
          </FormField>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="tareWeightG">
          {(field) => (
            <FormField field={field} label="Tare weight (g)" hint="Spool + core">
              {(control) => (
                <Input
                  {...control}
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
        <form.Field name="purchasePrice">
          {(field) => (
            <FormField field={field} label="Purchase price (NOK)">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  step="0.01"
                  min="0"
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

      <form.Field name="acquiredAt">
        {(field) => (
          <FormField field={field} label="Acquired date">
            {(control) => (
              <Input
                {...control}
                type="date"
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
            {(control) => (
              <Textarea
                {...control}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            )}
          </FormField>
        )}
      </form.Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Register spool
        </Button>
      </div>
    </form>
  );
}
