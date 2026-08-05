import type { FilamentProduct, Vendor } from '@geekbox/shared';
import { purchaseOrderInputSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { FormField } from './FormField';

interface LineDraft {
  productId: string;
  quantityOrdered: number;
  unitPriceMinor: number;
}

/** PO creation form (FR-202) with dynamic line editor. */
export function PurchaseOrderForm({
  vendors,
  products,
  onSubmit,
  onCancel,
  submitting,
}: {
  vendors: Vendor[];
  products: FilamentProduct[];
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm({
    defaultValues: {
      vendorId: vendors[0]?.id ?? '',
      orderDate: new Date().toISOString().slice(0, 10),
      expectedArrival: '',
      externalRef: '',
      shippingCostMinor: undefined as number | undefined,
      notes: '',
      lines: [
        { productId: products[0]?.id ?? '', quantityOrdered: 1, unitPriceMinor: 0 },
      ] as LineDraft[],
    },
    onSubmit: ({ value }) => {
      const clean = {
        vendorId: value.vendorId,
        orderDate: value.orderDate,
        expectedArrival: value.expectedArrival || undefined,
        externalRef: value.externalRef || undefined,
        shippingCostMinor: value.shippingCostMinor || undefined,
        notes: value.notes || undefined,
        lines: value.lines,
      };
      const parsed = purchaseOrderInputSchema.safeParse(clean);
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
        <form.Field name="orderDate">
          {(field) => (
            <FormField field={field} label="Order date" required>
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
        <form.Field name="expectedArrival">
          {(field) => (
            <FormField field={field} label="Expected arrival">
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="externalRef">
          {(field) => (
            <FormField field={field} label="External reference">
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
        <form.Field name="shippingCostMinor">
          {(field) => (
            <FormField field={field} label="Shipping cost (minor)">
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

      <div className="flex flex-col gap-2">
        <Label required>Lines</Label>
        <form.Field name="lines" mode="array">
          {(field) => (
            <div className="flex flex-col gap-2">
              {field.state.value.map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: array field rows
                <div key={i} className="flex items-end gap-2 rounded-md border border-border p-2">
                  <form.Field name={`lines[${i}].productId`}>
                    {(sub) => (
                      <div className="flex-1">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={sub.state.value}
                          onChange={(e) => sub.handleChange(e.target.value)}
                        >
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.material} {p.colorName}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name={`lines[${i}].quantityOrdered`}>
                    {(sub) => (
                      <div className="w-20">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          className="font-mono"
                          value={sub.state.value}
                          onChange={(e) => sub.handleChange(Number(e.target.value))}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name={`lines[${i}].unitPriceMinor`}>
                    {(sub) => (
                      <div className="w-28">
                        <Label className="text-xs">Unit price</Label>
                        <Input
                          type="number"
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
                    aria-label="Remove line"
                    disabled={field.state.value.length <= 1}
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
                onClick={() =>
                  field.pushValue({
                    productId: products[0]?.id ?? '',
                    quantityOrdered: 1,
                    unitPriceMinor: 0,
                  })
                }
              >
                <Plus className="size-4" aria-hidden /> Add line
              </Button>
            </div>
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
          Create purchase order
        </Button>
      </div>
    </form>
  );
}
