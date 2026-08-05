import type { PurchaseOrderLine } from '@geekbox/shared';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { ApiError } from '../api/client';
import { usePostReception, usePurchaseOrder } from '../api/hooks';
import { ColorSwatch } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Textarea } from '../components/ui/input';
import { Checkbox, ErrorState, Label, Skeleton } from '../components/ui/misc';
import { formatMoney } from '../lib/format';
import { useUiStore } from '../stores/ui-store';

interface LineState {
  poLineId: string;
  quantityReceived: number;
  quantityDamaged: number;
  actualUnitPriceMinor: number | '';
  confirmOverDelivery: boolean;
  discrepancyNote: string;
}

/** Goods-reception wizard (FR-205/206/207). Step 1 edit lines, step 2 confirm. */
export function ReceptionPage() {
  const { id } = useParams({ from: '/_app/purchase-orders/$id/receive' });
  const navigate = useNavigate();
  const po = usePurchaseOrder(id);
  const post = usePostReception(id);
  const pushToast = useUiStore((s) => s.pushToast);
  const [step, setStep] = useState<1 | 2>(1);
  const [notes, setNotes] = useState('');
  const notesId = useId();
  const [lines, setLines] = useState<Record<string, LineState>>({});

  const outstanding = useMemo(
    () => (po.data?.lines ?? []).filter((l) => l.quantityOutstanding > 0),
    [po.data],
  );

  // Seed line state once PO loaded.
  if (po.data && Object.keys(lines).length === 0 && outstanding.length > 0) {
    const seeded: Record<string, LineState> = {};
    for (const l of outstanding) {
      seeded[l.id] = {
        poLineId: l.id,
        quantityReceived: l.quantityOutstanding,
        quantityDamaged: 0,
        actualUnitPriceMinor: '',
        confirmOverDelivery: false,
        discrepancyNote: '',
      };
    }
    setLines(seeded);
  }

  if (po.isLoading) return <Skeleton className="h-96 w-full" />;
  if (po.isError || !po.data) return <ErrorState onRetry={() => po.refetch()} />;

  function update(lineId: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [lineId]: { ...prev[lineId], ...patch } as LineState }));
  }

  const activeLines = outstanding.filter((l) => (lines[l.id]?.quantityReceived ?? 0) > 0);

  function validate(): string | null {
    for (const l of activeLines) {
      const s = lines[l.id];
      if (!s) continue;
      if (s.quantityDamaged > s.quantityReceived) {
        return `Damaged qty exceeds received for one line (ES-207.1).`;
      }
      if (s.quantityReceived > l.quantityOutstanding && !s.confirmOverDelivery) {
        return `Over-delivery must be confirmed (ES-205.1).`;
      }
    }
    return null;
  }

  function submit() {
    const body = {
      notes: notes || undefined,
      lines: activeLines.map((l) => {
        const s = lines[l.id];
        return {
          poLineId: l.id,
          quantityReceived: s?.quantityReceived ?? 0,
          quantityDamaged: s?.quantityDamaged ?? 0,
          actualUnitPriceMinor:
            s?.actualUnitPriceMinor === '' ? undefined : s?.actualUnitPriceMinor,
          confirmOverDelivery: s?.confirmOverDelivery ?? false,
          discrepancyNote: s?.discrepancyNote || undefined,
        };
      }),
    };
    post.mutate(body, {
      onSuccess: () => {
        pushToast({
          variant: 'success',
          title: 'Goods received',
          description: 'Spools created and stock updated.',
        });
        navigate({ to: '/purchase-orders/$id', params: { id } });
      },
      onError: (err) =>
        pushToast({
          variant: 'error',
          title: 'Reception failed',
          description: err instanceof ApiError ? err.message : 'Please review the lines.',
        }),
    });
  }

  const validationError = validate();

  return (
    <>
      <PageHeader
        title="Receive goods"
        description={`Step ${step} of 2 — ${step === 1 ? 'enter received quantities' : 'confirm and post'}`}
        actions={
          <Link
            to="/purchase-orders/$id"
            params={{ id }}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to PO
          </Link>
        }
      />

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding lines</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {outstanding.map((l) => (
              <LineEditor
                key={l.id}
                line={l}
                state={lines[l.id]}
                onChange={(p) => update(l.id, p)}
              />
            ))}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={notesId}>Reception notes</Label>
              <Textarea id={notesId} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {validationError ? (
              <p role="alert" className="text-sm text-destructive">
                {validationError}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                disabled={!!validationError || activeLines.length === 0}
                onClick={() => setStep(2)}
              >
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirm — spools to create</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2 text-sm">
              {activeLines.map((l) => {
                const s = lines[l.id];
                const good = (s?.quantityReceived ?? 0) - (s?.quantityDamaged ?? 0);
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                  >
                    <span className="flex items-center gap-1.5">
                      {l.product.material}
                      <ColorSwatch hex={l.product.colorHex} name={l.product.colorName} />
                    </span>
                    <span className="flex items-center gap-3 font-mono text-xs">
                      <span className="flex items-center gap-1 text-[var(--color-status-fresh)]">
                        <CheckCircle2 className="size-3" aria-hidden /> {good} good
                      </span>
                      {(s?.quantityDamaged ?? 0) > 0 ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="size-3" aria-hidden /> {s?.quantityDamaged}{' '}
                          damaged
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">
              Damaged spools are created archived with a note (FR-207). Posting is atomic
              (ES-205.2).
            </p>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button loading={post.isPending} onClick={submit}>
                Post reception
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function LineEditor({
  line,
  state,
  onChange,
}: {
  line: PurchaseOrderLine;
  state: LineState | undefined;
  onChange: (patch: Partial<LineState>) => void;
}) {
  const confirmId = useId();
  if (!state) return null;
  const overDelivery = state.quantityReceived > line.quantityOutstanding;
  const damagedInvalid = state.quantityDamaged > state.quantityReceived;

  return (
    <div className="rounded-md border border-border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-medium">
          {line.product.material}
          <ColorSwatch hex={line.product.colorHex} name={line.product.colorName} />
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          Outstanding: {line.quantityOutstanding} · {formatMoney(line.unitPriceMinor)}/ea
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div>
          <Label className="text-xs">Received</Label>
          <Input
            type="number"
            min={0}
            className="font-mono"
            value={state.quantityReceived}
            onChange={(e) => onChange({ quantityReceived: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Damaged</Label>
          <Input
            type="number"
            min={0}
            className="font-mono"
            aria-invalid={damagedInvalid}
            value={state.quantityDamaged}
            onChange={(e) => onChange({ quantityDamaged: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="text-xs">Actual unit price</Label>
          <Input
            type="number"
            className="font-mono"
            placeholder="(PO price)"
            value={state.actualUnitPriceMinor}
            onChange={(e) =>
              onChange({
                actualUnitPriceMinor: e.target.value === '' ? '' : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <Label className="text-xs">Discrepancy note</Label>
          <Input
            value={state.discrepancyNote}
            onChange={(e) => onChange({ discrepancyNote: e.target.value })}
          />
        </div>
      </div>
      {damagedInvalid ? (
        <p className="mt-1 text-xs text-destructive">Damaged cannot exceed received.</p>
      ) : null}
      {overDelivery ? (
        <label htmlFor={confirmId} className="mt-2 flex items-center gap-2 text-sm">
          <Checkbox
            id={confirmId}
            checked={state.confirmOverDelivery}
            onChange={(e) => onChange({ confirmOverDelivery: e.target.checked })}
          />
          Confirm over-delivery (received &gt; outstanding, ES-205.1)
        </label>
      ) : null}
    </div>
  );
}
