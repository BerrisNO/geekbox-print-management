import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Ban, PackagePlus, Truck } from 'lucide-react';
import { useState } from 'react';
import { usePurchaseOrder, useTransitionPoStatus } from '../api/hooks';
import { ColorSwatch, PoStatusPill } from '../components/data/pills';
import { PageHeader } from '../components/shell/PageHeader';
import { Button, buttonVariants } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { ErrorState, Skeleton } from '../components/ui/misc';
import { formatDate, formatDateTime, formatMoney, orDash } from '../lib/format';

export function PurchaseOrderDetailPage() {
  const { id } = useParams({ from: '/_app/purchase-orders/$id' });
  const navigate = useNavigate();
  const po = usePurchaseOrder(id);
  const transition = useTransitionPoStatus(id);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (po.isLoading) return <Skeleton className="h-96 w-full" />;
  if (po.isError || !po.data) return <ErrorState onRetry={() => po.refetch()} />;

  const data = po.data;
  const canOrder = data.status === 'draft';
  const canCancel = data.status === 'draft' || data.status === 'ordered';
  const canReceive = data.status === 'ordered' || data.status === 'partially_received';

  return (
    <>
      <PageHeader
        title={`PO — ${data.vendorName}`}
        actions={
          <Link
            to="/purchase-orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <PoStatusPill status={data.status} />
          <div className="flex gap-2">
            {canOrder ? (
              <Button
                size="sm"
                loading={transition.isPending}
                onClick={() => transition.mutate({ status: 'ordered' })}
              >
                <Truck className="size-4" aria-hidden /> Mark ordered
              </Button>
            ) : null}
            {canReceive ? (
              <Link
                to="/purchase-orders/$id/receive"
                params={{ id }}
                className={buttonVariants({ variant: 'primary', size: 'sm' })}
              >
                <PackagePlus className="size-4" aria-hidden /> Receive goods
              </Link>
            ) : null}
            {canCancel ? (
              <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4" aria-hidden /> Cancel
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
            <Field label="Order date">{formatDate(data.orderDate)}</Field>
            <Field label="Expected arrival">{formatDate(data.expectedArrival)}</Field>
            <Field label="External ref">{orDash(data.externalRef)}</Field>
            <Field label="Goods value">{formatMoney(data.totals.goodsValueMinor)}</Field>
          </dl>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Product</th>
                  <th className="py-2 pr-3 font-medium">Ordered</th>
                  <th className="py-2 pr-3 font-medium">Received</th>
                  <th className="py-2 pr-3 font-medium">Outstanding</th>
                  <th className="py-2 font-medium">Unit price</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={l.id} className="border-b border-border">
                    <td className="py-2 pr-3">
                      <span className="flex items-center gap-1.5">
                        {l.product.material}
                        <ColorSwatch hex={l.product.colorHex} name={l.product.colorName} />
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono">{l.quantityOrdered}</td>
                    <td className="py-2 pr-3 font-mono">{l.quantityReceived}</td>
                    <td className="py-2 pr-3 font-mono">{l.quantityOutstanding}</td>
                    <td className="py-2 font-mono">{formatMoney(l.unitPriceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status history</CardTitle>
          </CardHeader>
          <CardContent>
            {data.statusEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transitions yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.statusEvents.map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span>
                      {e.fromStatus} → {e.toStatus}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(e.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {data.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No goods received yet.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between">
                    <span>{r.lines.length} line(s)</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(r.receivedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          transition.mutate(
            { status: 'cancelled' },
            {
              onSuccess: () => {
                setCancelOpen(false);
                navigate({ to: '/purchase-orders' });
              },
            },
          )
        }
        title="Cancel purchase order?"
        description="This cannot be undone. Received goods are unaffected."
        confirmLabel="Cancel PO"
        destructive
        loading={transition.isPending}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono">{children}</dd>
    </div>
  );
}
