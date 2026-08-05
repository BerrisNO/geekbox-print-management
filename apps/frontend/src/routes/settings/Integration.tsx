import { linkAccountSchema, MQTT_REGIONS } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useId, useState } from 'react';
import { ApiError } from '../../api/client';
import {
  useIntegrationSettings,
  useIntegrationStatus,
  useLinkBambu,
  useLinkManualToken,
  useUnlinkBambu,
  useUpdateIntegrationSettings,
  useVerifyLink,
} from '../../api/hooks';
import { IntegrationHealthPanel } from '../../components/feature/IntegrationHealthPanel';
import { PrintersPanel } from '../../components/feature/PrintersPanel';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ConfirmDialog } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label, Skeleton, Switch } from '../../components/ui/misc';
import { Select } from '../../components/ui/select';
import { TabBar } from '../../components/ui/tabs';
import { FormField } from '../../forms/FormField';
import { useUiStore } from '../../stores/ui-store';

export function IntegrationSettings() {
  const status = useIntegrationStatus();
  const linked = status.data?.state === 'linked' || status.data?.state === 'reauth_required';

  return (
    <div className="flex flex-col gap-6">
      <IntegrationHealthPanel status={status.data} isLoading={status.isLoading} />

      {status.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : linked ? (
        <LinkedControls />
      ) : (
        <LinkForm />
      )}

      <PrintersPanel linked={!!linked} />
    </div>
  );
}

function LinkForm() {
  const [mode, setMode] = useState<'password' | 'manual'>('password');
  const link = useLinkBambu();
  const verify = useVerifyLink();
  const manual = useLinkManualToken();
  const pushToast = useUiStore((s) => s.pushToast);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const codeId = useId();

  const pwForm = useForm({
    defaultValues: { email: '', password: '' },
    validators: { onChange: linkAccountSchema },
    onSubmit: ({ value }) => {
      link.mutate(value, {
        onSuccess: (res) => {
          if ('state' in res && res.state === 'code_required') {
            setChallengeId(res.challengeId);
            pushToast({
              variant: 'info',
              title: 'Verification code required',
              description: 'Check your email and enter the code.',
            });
          } else {
            pushToast({ variant: 'success', title: 'Bambu account linked' });
          }
        },
        onError: (err) =>
          pushToast({
            variant: 'error',
            title: 'Link failed',
            description: err instanceof ApiError ? err.message : undefined,
          }),
      });
    },
  });

  const tokenForm = useForm({
    defaultValues: { bambuUid: '', accessToken: '', refreshToken: '' },
    onSubmit: ({ value }) => {
      manual.mutate(
        {
          bambuUid: value.bambuUid,
          accessToken: value.accessToken,
          refreshToken: value.refreshToken || undefined,
        },
        {
          onSuccess: () => pushToast({ variant: 'success', title: 'Linked with manual token' }),
          onError: (err) =>
            pushToast({
              variant: 'error',
              title: 'Link failed',
              description: err instanceof ApiError ? err.message : undefined,
            }),
        },
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Link Bambu account</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TabBar
          tabs={[
            { value: 'password', label: 'Email & password' },
            { value: 'manual', label: 'Manual token' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {challengeId ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor={codeId}>Verification code</Label>
            <div className="flex gap-2">
              <Input
                id={codeId}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono"
              />
              <Button
                loading={verify.isPending}
                onClick={() =>
                  verify.mutate(
                    { challengeId, code },
                    {
                      onSuccess: () => {
                        setChallengeId(null);
                        pushToast({ variant: 'success', title: 'Bambu account linked' });
                      },
                      onError: () => pushToast({ variant: 'error', title: 'Invalid code' }),
                    },
                  )
                }
              >
                Verify
              </Button>
            </div>
          </div>
        ) : mode === 'password' ? (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              pwForm.handleSubmit();
            }}
          >
            <pwForm.Field name="email">
              {(field) => (
                <FormField field={field} label="Bambu email" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </pwForm.Field>
            <pwForm.Field name="password">
              {(field) => (
                <FormField field={field} label="Bambu password" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </pwForm.Field>
            <div className="flex justify-end">
              <Button type="submit" loading={link.isPending}>
                Link account
              </Button>
            </div>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              tokenForm.handleSubmit();
            }}
          >
            <tokenForm.Field name="bambuUid">
              {(field) => (
                <FormField field={field} label="Bambu UID" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      className="font-mono"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </tokenForm.Field>
            <tokenForm.Field name="accessToken">
              {(field) => (
                <FormField field={field} label="Access token" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      className="font-mono"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </tokenForm.Field>
            <tokenForm.Field name="refreshToken">
              {(field) => (
                <FormField field={field} label="Refresh token">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="password"
                      className="font-mono"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </tokenForm.Field>
            <div className="flex justify-end">
              <Button type="submit" loading={manual.isPending}>
                Link with token
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function LinkedControls() {
  const settings = useIntegrationSettings();
  const update = useUpdateIntegrationSettings();
  const unlink = useUnlinkBambu();
  const pushToast = useUiStore((s) => s.pushToast);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const enabledId = useId();
  const syncIntervalId = useId();

  if (settings.isLoading || !settings.data) return <Skeleton className="h-48 w-full" />;
  const s = settings.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integration settings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-col">
            <span id={enabledId} className="text-sm font-medium">
              Integration enabled
            </span>
            <span className="text-xs text-muted-foreground">
              Kill switch — stops all Bambu traffic.
            </span>
          </span>
          <Switch
            checked={s.enabled}
            aria-labelledby={enabledId}
            onCheckedChange={(enabled) =>
              update.mutate(
                { enabled },
                { onError: () => pushToast({ variant: 'error', title: 'Update failed' }) },
              )
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>MQTT region</Label>
          <Select
            value={s.mqttRegion}
            onChange={(e) =>
              update.mutate(
                { mqttRegion: e.target.value },
                { onError: () => pushToast({ variant: 'error', title: 'Update failed' }) },
              )
            }
          >
            {MQTT_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {!MQTT_REGIONS.includes(s.mqttRegion as (typeof MQTT_REGIONS)[number]) ? (
              <option value={s.mqttRegion}>{s.mqttRegion} (custom)</option>
            ) : null}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={syncIntervalId}>Task sync interval (min)</Label>
          <Input
            id={syncIntervalId}
            type="number"
            min={30}
            className="max-w-32 font-mono"
            defaultValue={s.taskSyncIntervalMin}
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (v >= 30) update.mutate({ taskSyncIntervalMin: v });
            }}
          />
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button variant="destructive" onClick={() => setUnlinkOpen(true)}>
            Unlink Bambu account
          </Button>
        </div>

        <ConfirmDialog
          open={unlinkOpen}
          onClose={() => setUnlinkOpen(false)}
          onConfirm={() =>
            unlink.mutate(undefined, {
              onSuccess: () => {
                setUnlinkOpen(false);
                pushToast({ variant: 'success', title: 'Unlinked' });
              },
            })
          }
          title="Unlink Bambu account?"
          description="Stored tokens are deleted and live data stops (AC-301.3)."
          confirmLabel="Unlink"
          destructive
          loading={unlink.isPending}
        />
      </CardContent>
    </Card>
  );
}
