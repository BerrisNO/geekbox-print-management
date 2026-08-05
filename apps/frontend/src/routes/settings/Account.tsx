import { changePasswordSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { ApiError } from '../../api/client';
import { useChangePassword, useLogout, useSession } from '../../api/hooks';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { FormField } from '../../forms/FormField';
import { useUiStore } from '../../stores/ui-store';

export function AccountSettings() {
  const session = useSession();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();
  const pushToast = useUiStore((s) => s.pushToast);

  const form = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
    validators: { onChange: changePasswordSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await changePassword.mutateAsync(value);
        pushToast({
          variant: 'success',
          title: 'Password changed',
          description: 'Other sessions were signed out.',
        });
        formApi.reset();
      } catch (err) {
        pushToast({
          variant: 'error',
          title: 'Change failed',
          description:
            err instanceof ApiError && err.status === 403
              ? 'Current password is incorrect.'
              : 'Please try again.',
        });
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <p className="text-sm">
            Signed in as <span className="font-medium">{session.data?.username ?? '…'}</span>
          </p>
          <Button
            variant="outline"
            loading={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) })
            }
          >
            <LogOut aria-hidden /> Log out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="currentPassword">
              {(field) => (
                <FormField field={field} label="Current password" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="current-password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
            <form.Field name="newPassword">
              {(field) => (
                <FormField
                  field={field}
                  label="New password"
                  hint="At least 8 characters."
                  required
                >
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="new-password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
            <div className="flex justify-end">
              <Button type="submit" loading={changePassword.isPending}>
                Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
