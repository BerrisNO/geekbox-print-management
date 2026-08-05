import type { IntegrationStatus } from '@geekbox/shared';
import { Link } from '@tanstack/react-router';
import { AlertTriangle, KeyRound, WifiOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';

/** Integration-degraded (ES-304.1) and reauth-required (FR-307) banners + SSE degradation. */
export function DegradationBanners({ status }: { status: IntegrationStatus | undefined }) {
  const sseDegraded = useUiStore((s) => s.sseDegraded);
  const banners: React.ReactNode[] = [];

  if (status?.state === 'reauth_required') {
    banners.push(
      <BannerBar key="reauth" tone="danger" icon={KeyRound} role="alert">
        <span>Bambu integration needs re-authentication. Live data is paused.</span>
        <Link to="/settings/integration" className="font-medium underline underline-offset-2">
          Re-link now
        </Link>
      </BannerBar>,
    );
  }

  if (status?.enabled && status.state === 'linked' && status.mqtt.listenerState === 'degraded') {
    banners.push(
      <BannerBar key="degraded" tone="warning" icon={AlertTriangle} role="alert">
        <span>Integration degraded — showing last-known data while reconnecting.</span>
      </BannerBar>,
    );
  }

  if (sseDegraded) {
    banners.push(
      <BannerBar key="sse" tone="warning" icon={WifiOff}>
        <span>Live updates degraded — polling every 10s.</span>
      </BannerBar>,
    );
  }

  if (banners.length === 0) return null;
  return <div className="flex flex-col">{banners}</div>;
}

function BannerBar({
  tone,
  icon: Icon,
  role,
  children,
}: {
  tone: 'warning' | 'danger';
  icon: React.ComponentType<{ className?: string }>;
  role?: 'alert';
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        'flex w-full flex-wrap items-center gap-2 px-4 py-2 text-sm',
        tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-[var(--color-status-low)]/10 text-[var(--color-status-low)]',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </div>
  );
}
