import type { Customer, FilamentProduct, Part } from '@geekbox/shared';
import { computePartEconomics, partInputSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Textarea } from '../components/ui/input';
import { Label } from '../components/ui/misc';
import { Select } from '../components/ui/select';
import { formatMoney, majorToMinor, minorToMajorInput } from '../lib/format';

interface BomRow {
  filamentProductId: string;
  grams: number | undefined;
}

/** Readable filament name, e.g. "eSUN PLA Blue" (manufacturer + material + color). */
function filamentLabel(p: FilamentProduct): string {
  return [p.manufacturer, p.material, p.colorName]
    .filter((s) => !!s && s.trim().length > 0)
    .join(' ');
}

export function PartForm({
  customers,
  products,
  costRates,
  currencyCode,
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  customers: Customer[];
  products: FilamentProduct[];
  costRates: {
    energyPricePerKwhMinor: number | null;
    machineRatePerHourMinor: number | null;
    laborRatePerHourMinor: number | null;
    defaultMarkupPct: number | null;
    defaultPowerDrawW: number | null;
  } | null;
  currencyCode: string;
  initial?: Part;
  onSubmit: (values: unknown) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const [bom, setBom] = useState<BomRow[]>(() =>
    (initial?.materials ?? []).map((m) => ({
      filamentProductId: m.filamentProductId,
      grams: m.grams,
    })),
  );

  const productById = useMemo(() => {
    const map = new Map<string, FilamentProduct>();
    for (const p of products) map.set(p.id, p);
    return map;
  }, [products]);

  const form = useForm({
    defaultValues: {
      articleNo: initial?.articleNo ?? '',
      name: initial?.name ?? '',
      customerId: initial?.customerId ?? '',
      customerArticleNo: initial?.customerArticleNo ?? '',
      printTimeMin: initial?.printTimeMin ?? undefined,
      laborTimeMin: initial?.laborTimeMin ?? undefined,
      powerDrawW: initial?.powerDrawW ?? undefined,
      markupPct: initial?.markupPct ?? undefined,
      // MAJOR NOK in the input; converted to minor on submit.
      sellPrice: minorToMajorInput(initial?.sellPriceMinor) ?? undefined,
      notes: initial?.notes ?? '',
    },
    onSubmit: ({ value }) => {
      const { sellPrice, ...rest } = value;
      const materials = bom
        .filter((r) => r.filamentProductId && r.grams && r.grams > 0)
        .map((r) => ({ filamentProductId: r.filamentProductId, grams: r.grams as number }));
      const clean = {
        ...rest,
        customerId: value.customerId || undefined,
        customerArticleNo: value.customerArticleNo || undefined,
        printTimeMin: value.printTimeMin ?? undefined,
        laborTimeMin: value.laborTimeMin ?? undefined,
        powerDrawW: value.powerDrawW ?? undefined,
        markupPct: value.markupPct ?? undefined,
        sellPriceMinor: majorToMinor(sellPrice),
        notes: value.notes || undefined,
        materials,
      };
      const parsed = partInputSchema.safeParse(clean);
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
      <div className="grid grid-cols-2 gap-3">
        <form.Field name="articleNo">
          {(field) => (
            <FormRow label="Article no" required>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormRow>
          )}
        </form.Field>
        <form.Field name="name">
          {(field) => (
            <FormRow label="Name" required>
              <Input
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormRow>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="customerId">
          {(field) => (
            <FormRow label="Customer">
              <Select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              >
                <option value="">— Universal (no customer) —</option>
                {customers.map((cst) => (
                  <option key={cst.id} value={cst.id}>
                    {cst.name}
                  </option>
                ))}
              </Select>
            </FormRow>
          )}
        </form.Field>
        <form.Field name="customerArticleNo">
          {(field) => (
            <FormRow label="Customer article no">
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </FormRow>
          )}
        </form.Field>
      </div>

      {/* BOM editor */}
      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-medium text-foreground">Bill of materials</legend>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setBom((prev) => [...prev, { filamentProductId: '', grams: undefined }])}
          >
            <Plus className="size-4" aria-hidden /> Add material
          </Button>
        </div>
        {bom.length === 0 ? (
          <p className="text-sm text-muted-foreground">No materials yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {bom.map((row, i) => (
              // Rows are positional; index key is acceptable for this editable list.
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
              <div key={i} className="flex items-center gap-2">
                <Select
                  className="flex-1"
                  aria-label="Filament"
                  value={row.filamentProductId}
                  onChange={(e) =>
                    setBom((prev) =>
                      prev.map((r, j) =>
                        j === i ? { ...r, filamentProductId: e.target.value } : r,
                      ),
                    )
                  }
                >
                  <option value="">— select filament —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {filamentLabel(p)}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  className="w-28 font-mono"
                  aria-label="Grams"
                  placeholder="grams"
                  value={row.grams ?? ''}
                  onChange={(e) =>
                    setBom((prev) =>
                      prev.map((r, j) =>
                        j === i
                          ? { ...r, grams: e.target.value ? Number(e.target.value) : undefined }
                          : r,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Remove material"
                  onClick={() => setBom((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <form.Field name="printTimeMin">
          {(field) => (
            <FormRow label="Print time (min)">
              <NumberInput field={field} />
            </FormRow>
          )}
        </form.Field>
        <form.Field name="laborTimeMin">
          {(field) => (
            <FormRow label="Labor time (min)">
              <NumberInput field={field} />
            </FormRow>
          )}
        </form.Field>
        <form.Field name="powerDrawW">
          {(field) => (
            <FormRow label="Power draw (W)">
              <NumberInput field={field} />
            </FormRow>
          )}
        </form.Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <form.Field name="markupPct">
          {(field) => (
            <FormRow label="Markup (%)">
              <NumberInput field={field} step="0.1" />
            </FormRow>
          )}
        </form.Field>
        <form.Field name="sellPrice">
          {(field) => (
            <FormRow label="Sell price (NOK)" hint="Fixed override — leave blank to use markup">
              <Input
                type="number"
                step="0.01"
                min="0"
                className="font-mono"
                value={field.state.value ?? ''}
                onChange={(e) =>
                  field.handleChange(e.target.value ? Number(e.target.value) : undefined)
                }
              />
            </FormRow>
          )}
        </form.Field>
      </div>

      {/* Live economics preview */}
      <form.Subscribe
        selector={(s) => ({
          printTimeMin: s.values.printTimeMin,
          laborTimeMin: s.values.laborTimeMin,
          powerDrawW: s.values.powerDrawW,
          markupPct: s.values.markupPct,
          sellPrice: s.values.sellPrice,
        })}
      >
        {(v) => {
          // Resolve each BOM row to its filament price/weight; ignore empty rows.
          const priced = bom
            .map((r) => {
              const p = productById.get(r.filamentProductId);
              if (!p || !r.grams) return null;
              return {
                grams: r.grams,
                defaultPriceMinor: p.defaultPriceMinor,
                nominalNetWeightG: p.nominalNetWeightG,
              };
            })
            .filter((m): m is NonNullable<typeof m> => m !== null);
          const eco = computePartEconomics(
            {
              printTimeMin: v.printTimeMin ?? null,
              laborTimeMin: v.laborTimeMin ?? null,
              powerDrawW: v.powerDrawW ?? null,
              markupPct: v.markupPct ?? null,
              sellPriceMinor: majorToMinor(v.sellPrice) ?? null,
            },
            priced,
            {
              energyPricePerKwhMinor: costRates?.energyPricePerKwhMinor ?? null,
              machineRatePerHourMinor: costRates?.machineRatePerHourMinor ?? null,
              laborRatePerHourMinor: costRates?.laborRatePerHourMinor ?? null,
              defaultMarkupPct: costRates?.defaultMarkupPct ?? null,
              defaultPowerDrawW: costRates?.defaultPowerDrawW ?? null,
            },
          );
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Economics preview</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <EcoRow
                    label="Material"
                    value={formatMoney(eco.materialCostMinor, currencyCode)}
                  />
                  <EcoRow label="Energy" value={formatMoney(eco.energyCostMinor, currencyCode)} />
                  <EcoRow label="Machine" value={formatMoney(eco.machineCostMinor, currencyCode)} />
                  <EcoRow label="Labor" value={formatMoney(eco.laborCostMinor, currencyCode)} />
                  <EcoRow
                    label="Unit cost"
                    value={formatMoney(eco.unitCostMinor, currencyCode)}
                    strong
                  />
                  <EcoRow
                    label="Sell price"
                    value={formatMoney(eco.effectiveSellPriceMinor, currencyCode)}
                    strong
                  />
                  <EcoRow
                    label="Margin"
                    value={`${formatMoney(eco.marginMinor, currencyCode)} (${eco.marginPct}%)`}
                    strong
                  />
                </dl>
              </CardContent>
            </Card>
          );
        }}
      </form.Subscribe>

      <form.Field name="notes">
        {(field) => (
          <FormRow label="Notes">
            <Textarea
              value={field.state.value}
              onChange={(e) => field.handleChange(e.target.value)}
            />
          </FormRow>
        )}
      </form.Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {initial ? 'Save changes' : 'Create part'}
        </Button>
      </div>
    </form>
  );
}

function FormRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NumberInput({
  field,
  step,
}: {
  // TanStack Form field for an optional numeric value.
  field: {
    state: { value: number | undefined };
    handleChange: (v: number | undefined) => void;
  };
  step?: string;
}) {
  return (
    <Input
      type="number"
      min="0"
      step={step}
      className="font-mono"
      value={field.state.value ?? ''}
      onChange={(e) => field.handleChange(e.target.value ? Number(e.target.value) : undefined)}
    />
  );
}

function EcoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'font-medium text-foreground' : 'text-muted-foreground'}>{label}</dt>
      <dd className={`text-right font-mono ${strong ? 'font-medium' : ''}`}>{value}</dd>
    </>
  );
}
