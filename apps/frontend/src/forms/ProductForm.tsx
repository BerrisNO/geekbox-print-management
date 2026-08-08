import type { FilamentProduct, Manufacturer, MaterialDef, SpoolType } from '@geekbox/shared';
import { productInputSchema, SPOOL_TYPES, type Vendor } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
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
  manufacturers,
  materials,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  vendors: Vendor[];
  manufacturers: Manufacturer[];
  materials: MaterialDef[];
  initial?: FilamentProduct;
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  // Active materials, plus the product's current one even if since archived.
  const materialOptions = materials
    .filter((m) => !m.archived || m.name === initial?.material)
    .map((m) => m.name);
  const defaultMaterial =
    initial?.material ?? (materialOptions.includes('PLA') ? 'PLA' : (materialOptions[0] ?? ''));
  // Additional suppliers beyond the primary vendor. The primary is always
  // included on submit; this set holds the extras the user has ticked.
  const [additionalVendorIds, setAdditionalVendorIds] = useState<string[]>(() =>
    (initial?.vendors ?? []).map((v) => v.id).filter((id) => id !== (initial?.vendorId ?? '')),
  );

  const form = useForm({
    defaultValues: {
      material: defaultMaterial,
      manufacturerId: initial?.manufacturerId ?? '',
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
      // Full supplier set = primary vendor unioned with the ticked extras (deduped).
      const vendorIds = Array.from(new Set([value.vendorId, ...additionalVendorIds])).filter(
        Boolean,
      );
      const clean = {
        ...rest,
        manufacturerId: value.manufacturerId || undefined,
        name: value.name || undefined,
        category: value.category || undefined,
        colorHex: value.colorHex || undefined,
        sku: value.sku || undefined,
        notes: value.notes || undefined,
        defaultPriceMinor: majorToMinor(defaultPrice),
        lowStockThresholdG: value.lowStockThresholdG || undefined,
        lowStockMinSpools: value.lowStockMinSpools || undefined,
        vendorIds,
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
          <FormField
            field={field}
            label="Material"
            required
            hint="Manage the list on the Materials page"
          >
            {(control) => (
              <Select
                {...control}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as never)}
              >
                {materialOptions.map((m) => (
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
        <form.Field name="manufacturerId">
          {(field) => (
            <FormField field={field} label="Manufacturer" hint="The maker, not the seller">
              {(control) => (
                <Select
                  {...control}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                >
                  <option value="">— none —</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
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
          <FormField field={field} label="Vendor (primary supplier)" required>
            {(control) => (
              <Select
                {...control}
                value={field.state.value}
                onChange={(e) => {
                  const next = e.target.value;
                  field.handleChange(next);
                  // The primary is always a supplier; drop it from the extras.
                  setAdditionalVendorIds((prev) => prev.filter((id) => id !== next));
                }}
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

      <form.Subscribe selector={(s) => s.values.vendorId}>
        {(primaryVendorId) => (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">
              Additional suppliers
            </legend>
            <div className="flex flex-col gap-1.5">
              {vendors.map((v) => {
                const isPrimary = v.id === primaryVendorId;
                const checked = isPrimary || additionalVendorIds.includes(v.id);
                return (
                  <label key={v.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input"
                      checked={checked}
                      disabled={isPrimary}
                      onChange={(e) =>
                        setAdditionalVendorIds((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, v.id]))
                            : prev.filter((id) => id !== v.id),
                        )
                      }
                    />
                    <span>
                      {v.name}
                      {isPrimary ? ' (primary)' : ''}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
      </form.Subscribe>

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
