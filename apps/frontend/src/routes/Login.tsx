import { credentialsSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useLogin, useSession } from '../api/hooks';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { FormField } from '../forms/FormField';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const session = useSession({ enabled: false });
  const search = useSearch({ strict: false }) as { redirect?: string };
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { username: '', password: '' },
    validators: { onChange: credentialsSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await login.mutateAsync(value);
        await session.refetch();
        navigate({ to: search.redirect ?? '/' });
      } catch (err) {
        if (err instanceof ApiError) {
          setFormError(
            err.status === 429
              ? 'Too many attempts. Please wait and try again.'
              : 'Invalid username or password.',
          );
        } else {
          setFormError('Login failed. Please try again.');
        }
      }
    },
  });

  return (
    <AuthLayout>
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package aria-hidden />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>GeekBOX Print Management</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.Field name="username">
              {(field) => (
                <FormField field={field} label="Username" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      autoComplete="username"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
            <form.Field name="password">
              {(field) => (
                <FormField field={field} label="Password" required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="current-password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={invalid}
                    />
                  )}
                </FormField>
              )}
            </form.Field>
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}
            <Button type="submit" loading={login.isPending} className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      {children}
    </div>
  );
}
