import type { Customer, Part } from '@geekbox/shared';
import { workOrderInputSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { formatMoney, majorToMinor } from '../lib/format';

interface LineDraft {
  partId: string;
  quantity: number;
  /** MAJOR NOK override in the form; converted to minor on submit. */
  unitPrice: number | undefined;
}

/** Work-order creation form (Stage 2) with dynamic line editor + live totals. */
export function WorkOrderForm({
  customers,
  parts,
  onSubmit,
  onCancel,
  submitting,
}: {
  customers: Customer[];
  parts: Part[];
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const partById = new Map(parts.map((p) => [p.id, p]));
  /** Effective per-unit sell for a line: the override (NOK) or the part's economics. */
  const unitSellMinor = (line: LineDraft): number => {
    const override = majorToMinor(line.unitPrice);
    if (override != null) return override;
    return partById.get(line.partId)?.economics.effectiveSellPriceMinor ?? 0;
  };

  const form = useForm({
    defaultValues: {
      customerId: customers[0]?.id ?? '',
      orderRef: '',
      orderDate: new Date().toISOString().slice(0, 10),
      notes: '',
      lines: [{ partId: parts[0]?.id ?? '', quantity: 1, unitPrice: undefined }] as LineDraft[],
    },
    onSubmit: ({ value }) => {
      const clean = {
        customerId: value.customerId,
        orderRef: value.orderRef || undefined,
        orderDate: value.orderDate || undefined,
        notes: value.notes || undefined,
        lines: value.lines.map((l) => ({
          partId: l.partId,
          quantity: l.quantity,
          unitPriceMinor: majorToMinor(l.unitPrice),
        })),
      };
      const parsed = workOrderInputSchema.safeParse(clean);
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
      <form.Field name="customerId">
        {(field) => (
          <div className="flex flex-col gap-1">
            <Label required>Customer</Label>
            <Select value={field.state.value} onChange={(e) => field.handleChange(e.target.value)}>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </form.Field>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="orderRef">
          {(field) => (
            <div className="flex flex-col gap-1">
              <Label>Order reference</Label>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="orderDate">
          {(field) => (
            <div className="flex flex-col gap-1">
              <Label>Order date</Label>
              <Input
                type="date"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </div>
          )}
        </form.Field>
      </div>

      <div className="flex flex-col gap-2">
        <Label required>Lines</Label>
        <form.Field name="lines" mode="array">
          {(field) => (
            <div className="flex flex-col gap-2">
              {field.state.value.map((line, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: array field rows
                <div key={i} className="flex items-end gap-2 rounded-md border border-border p-2">
                  <form.Field name={`lines[${i}].partId`}>
                    {(sub) => (
                      <div className="flex-1">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={sub.state.value}
                          onChange={(e) => sub.handleChange(e.target.value)}
                        >
                          {parts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.articleNo} — {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}
                  </form.Field>
                  <form.Field name={`lines[${i}].quantity`}>
                    {(sub) => (
                      <div className="w-20">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          className="font-mono"
                          value={sub.state.value}
                          onChange={(e) => sub.handleChange(Number(e.target.value))}
                        />
                      </div>
                    )}
                  </form.Field>
                  <form.Field name={`lines[${i}].unitPrice`}>
                    {(sub) => (
                      <div className="w-28">
                        <Label className="text-xs">Unit price (NOK)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="font-mono"
                          placeholder={(
                            (partById.get(line.partId)?.economics.effectiveSellPriceMinor ?? 0) /
                            100
                          ).toFixed(2)}
                          value={sub.state.value ?? ''}
                          onChange={(e) =>
                            sub.handleChange(e.target.value ? Number(e.target.value) : undefined)
                          }
                        />
                      </div>
                    )}
                  </form.Field>
                  <div className="w-24 pb-2 text-right">
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="font-mono text-sm">
                      {formatMoney(unitSellMinor(line) * (line.quantity || 0))}
                    </div>
                  </div>
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
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    field.pushValue({
                      partId: parts[0]?.id ?? '',
                      quantity: 1,
                      unitPrice: undefined,
                    })
                  }
                >
                  <Plus className="size-4" aria-hidden /> Add line
                </Button>
                <span className="text-sm text-muted-foreground">
                  Order total:{' '}
                  <span className="font-mono text-foreground">
                    {formatMoney(
                      field.state.value.reduce(
                        (a, l) => a + unitSellMinor(l) * (l.quantity || 0),
                        0,
                      ),
                    )}
                  </span>
                </span>
              </div>
            </div>
          )}
        </form.Field>
      </div>

      <form.Field name="notes">
        {(field) => (
          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Textarea
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </div>
        )}
      </form.Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          Create work order
        </Button>
      </div>
    </form>
  );
}
