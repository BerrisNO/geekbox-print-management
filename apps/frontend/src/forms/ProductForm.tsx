import type { FilamentProduct, SpoolType } from '@geekbox/shared';
import { MATERIALS, productInputSchema, SPOOL_TYPES, type Vendor } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Button } from '../components/ui/button';
import { Input, Textarea } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { majorToMinor, minorToMajorInput } from '../lib/format';
import { FormField } from './FormField';

const SPOOL_TYPE_LABELS: Record<SpoolType, string> = {
  plastic: 'Plastic spool',
  cardboard: 'Cardboard spool',
  refill: 'Refill (no spool)',
  reusable: 'Reusable/Masterspool',
};

export function ProductForm({
  vendors,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  vendors: Vendor[];
  initial?: FilamentProduct;
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm({
    defaultValues: {
      material: initial?.material ?? 'PLA',
      manufacturer: initial?.manufacturer ?? '',
      name: initial?.name ?? '',
      category: initial?.category ?? '',
      spoolType: initial?.spoolType ?? 'plastic',
      colorName: initial?.colorName ?? '',
      colorHex: initial?.colorHex ?? '',
      vendorId: initial?.vendorId ?? vendors[0]?.id ?? '',
      diameterMm: initial?.diameterMm ?? 1.75,
      nominalNetWeightG: initial?.nominalNetWeightG ?? 1000,
      // MAJOR NOK in the input; converted to minor on submit.
      defaultPrice: minorToMajorInput(initial?.defaultPriceMinor) ?? undefined,
      lowStockThresholdG: initial?.lowStockThresholdG ?? undefined,
      lowStockMinSpools: initial?.lowStockMinSpools ?? undefined,
      sku: initial?.sku ?? '',
      notes: initial?.notes ?? '',
    },
    onSubmit: ({ value }) => {
      const { defaultPrice, ...rest } = value;
      const clean = {
        ...rest,
        manufacturer: value.manufacturer || undefined,
        name: value.name || undefined,
        category: value.category || undefined,
        colorHex: value.colorHex || undefined,
        sku: value.sku || undefined,
        notes: value.notes || undefined,
        defaultPriceMinor: majorToMinor(defaultPrice),
        lowStockThresholdG: value.lowStockThresholdG || undefined,
        lowStockMinSpools: value.lowStockMinSpools || undefined,
      };
      const parsed = productInputSchema.safeParse(clean);
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
      <form.Field name="material">
        {(field) => (
          <FormField field={field} label="Material" required>
            {(control) => (
              <Select
                {...control}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as never)}
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="manufacturer">
          {(field) => (
            <FormField
              field={field}
              label="Manufacturer"
              hint="e.g. eSUN (the maker, not the seller)"
            >
              {(control) => (
                <Input
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="spoolType">
          {(field) => (
            <FormField field={field} label="Spool type" required>
              {(control) => (
                <Select
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as SpoolType)}
                >
                  {SPOOL_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {SPOOL_TYPE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="name">
          {(field) => (
            <FormField field={field} label="Name" hint="Leave blank to auto-name">
              {(control) => (
                <Input
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <FormField field={field} label="Category">
              {(control) => (
                <Input
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="colorName">
          {(field) => (
            <FormField field={field} label="Color name" required>
              {(control) => (
                <Input
                  {...control}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="colorHex">
          {(field) => (
            <FormField field={field} label="Color" hint="Pick from the wheel or type #RRGGBB">
              {(control) => (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Color picker"
                    className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(field.state.value) ? field.state.value : '#1e90ff'
                    }
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  <Input
                    {...control}
                    placeholder="#1E90FF"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                </div>
              )}
            </FormField>
          )}
        </form.Field>
      </div>

      <form.Field name="vendorId">
        {(field) => (
          <FormField field={field} label="Vendor" required>
            {(control) => (
              <Select
                {...control}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="diameterMm">
          {(field) => (
            <FormField field={field} label="Diameter (mm)" required>
              {(control) => (
                <Select
                  {...control}
                  value={String(field.state.value)}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                >
                  <option value="1.75">1.75</option>
                  <option value="2.85">2.85</option>
                </Select>
              )}
            </FormField>
          )}
        </form.Field>
        <form.Field name="nominalNetWeightG">
          {(field) => (
            <FormField field={field} label="Nominal net weight (g)" required>
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="defaultPrice">
          {(field) => (
            <FormField field={field} label="Default price (NOK)">
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
        <form.Field name="sku">
          {(field) => (
            <FormField field={field} label="SKU">
              {(control) => (
                <Input
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              )}
            </FormField>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="lowStockThresholdG">
          {(field) => (
            <FormField field={field} label="Low-stock threshold (g)">
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
        <form.Field name="lowStockMinSpools">
          {(field) => (
            <FormField field={field} label="Low-stock min spools">
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
      </div>

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
          {initial ? 'Save changes' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}
