import { Link } from '@tanstack/react-router';
import { PrinterIcon } from 'lucide-react';
import { useIntegrationStatus, usePrinters } from '../api/hooks';
import { AmsSlotPanel } from '../components/feature/AmsSlotPanel';
import { IntegrationHealthPanel } from '../components/feature/IntegrationHealthPanel';
import { LowStockAlertPanel } from '../components/feature/LowStockAlertPanel';
import { PrinterCard } from '../components/feature/PrinterCard';
import { PageHeader } from '../components/shell/PageHeader';
import { buttonVariants } from '../components/ui/button';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/misc';

export function DashboardPage() {
  const printers = usePrinters();
  const status = useIntegrationStatus();
  const tracked = (printers.data ?? []).filter((p) => p.tracked);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live printer status, AMS mapping, and stock alerts."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-label="Printers" className="lg:col-span-2">
          {printers.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          ) : printers.isError ? (
            <ErrorState onRetry={() => printers.refetch()} />
          ) : tracked.length === 0 ? (
            <EmptyState
              icon={PrinterIcon}
              title="No tracked printers"
              description="Link your Bambu account and mark printers as tracked to see live status here."
              action={
                <Link
                  to="/settings/integration"
                  className={buttonVariants({ variant: 'primary', size: 'sm' })}
                >
                  Set up integration
                </Link>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {tracked.map((p) => (
                <PrinterCard key={p.id} printer={p} />
              ))}
            </div>
          )}

          {tracked.length > 0 ? (
            <div className="mt-6 flex flex-col gap-4">
              {tracked.map((p) => (
                <AmsSlotPanel key={p.id} printerId={p.id} />
              ))}
            </div>
          ) : null}
        </section>

        <aside aria-label="Alerts and health" className="flex flex-col gap-6">
          <LowStockAlertPanel />
          <IntegrationHealthPanel status={status.data} isLoading={status.isLoading} />
        </aside>
      </div>
    </>
  );
}
