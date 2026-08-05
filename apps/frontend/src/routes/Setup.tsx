import { credentialsSchema } from '@geekbox/shared';
import { useForm } from '@tanstack/react-form';
import { useNavigate } from '@tanstack/react-router';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { useSetup } from '../api/hooks';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { FormField } from '../forms/FormField';
import { AuthLayout } from './Login';

/** First-run account creation (AC-001.3). Only reachable while no account exists. */
export function SetupPage() {
  const setup = useSetup();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { username: '', password: '' },
    validators: { onChange: credentialsSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        await setup.mutateAsync(value);
        navigate({ to: '/' });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setFormError('An account already exists. Please sign in instead.');
        } else {
          setFormError('Setup failed. Please try again.');
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>First-run setup — this is the only account.</CardDescription>
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
                <FormField field={field} label="Password" hint="At least 8 characters." required>
                  {({ id, 'aria-invalid': invalid }) => (
                    <Input
                      id={id}
                      type="password"
                      autoComplete="new-password"
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
            <Button type="submit" loading={setup.isPending} className="w-full">
              Create account
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
