import type { IntegrationStatus } from '@geekbox/shared';
import { Activity, PlugZap } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/misc';

/** IntegrationHealthPanel (FR-306). Link state, token age, REST/MQTT health,
 *  last message, next retry, drift counter. */
export function IntegrationHealthPanel({
  status,
  isLoading,
}: {
  status: IntegrationStatus | undefined;
  isLoading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <PlugZap className="size-5 text-muted-foreground" aria-hidden />
        <CardTitle className="text-base">Integration health</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading || !status ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Link state">
              <Badge
                variant={
                  status.state === 'linked'
                    ? 'success'
                    : status.state === 'reauth_required'
                      ? 'danger'
                      : 'neutral'
                }
                icon={Activity}
              >
                {status.state}
              </Badge>
            </Row>
            <Row label="Integration">
              <Badge variant={status.enabled ? 'success' : 'neutral'}>
                {status.enabled ? 'enabled' : 'disabled (kill switch)'}
              </Badge>
            </Row>
            <Row label="MQTT listener">
              <Badge
                variant={
                  status.mqtt.listenerState === 'running'
                    ? 'success'
                    : status.mqtt.listenerState === 'degraded'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {status.mqtt.listenerState}
              </Badge>
            </Row>
            <Row label="Region">
              <span className="font-mono">{status.mqttRegion}</span>
            </Row>
            <Row label="Auth mode">{status.authMode}</Row>
            <Row label="Token issued">{formatDateTime(status.tokenIssuedAt)}</Row>
            <Row label="Last MQTT message">{formatDateTime(status.mqtt.lastMessageAt)}</Row>
            <Row label="Last REST success">{formatDateTime(status.rest.lastSuccessAt)}</Row>
            <Row label="Next retry">{formatDateTime(status.mqtt.nextRetryAt)}</Row>
            <Row label="Drift counter">
              <span className="font-mono">{status.driftCounter}</span>
            </Row>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
