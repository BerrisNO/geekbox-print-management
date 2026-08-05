import type { AnyFieldApi } from '@tanstack/react-form';
import { Label } from '../components/ui/misc';

/**
 * FormField molecule (spec §7.1). Wraps a TanStack Form field: visible label
 * (always — WCAG 3.3.2), control, hint, and inline error text (3.3.1/3.3.3).
 */
export function FormField({
  field,
  label,
  hint,
  required,
  children,
}: {
  field: AnyFieldApi;
  label: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
    'aria-required'?: boolean;
  }) => React.ReactNode;
}) {
  const id = `field-${field.name}`;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const errors = field.state.meta.errors;
  const touched = field.state.meta.isTouched;
  const showError = touched && errors.length > 0;
  const message = showError ? String(errors[0]?.message ?? errors[0] ?? '') : null;
  const showHint = Boolean(hint) && !showError;
  // Wire the visible hint/error to the control so screen readers announce them
  // (WCAG 1.3.1 / 3.3.1 — frontier A-1). Only reference ids that are rendered.
  const describedBy =
    [showError ? errorId : null, showHint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children({
        id,
        'aria-invalid': showError,
        'aria-describedby': describedBy,
        'aria-required': required,
      })}
      {showHint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {message ? (
        <p id={errorId} className="text-xs text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Map an ApiError's RFC 7807 field errors onto a TanStack Form. */
export function applyFieldErrors(
  form: { setFieldMeta: (name: string, updater: (m: unknown) => unknown) => void },
  fieldErrors: Record<string, string[]>,
): void {
  for (const [name, messages] of Object.entries(fieldErrors)) {
    // Strip a leading "body." / "/" that some RFC 7807 producers prefix.
    const clean = name
      .replace(/^body[./]/, '')
      .replace(/^\//, '')
      .replace(/\//g, '.');
    form.setFieldMeta(clean, (meta) => ({
      ...(meta as object),
      errorMap: { onServer: messages.join(', ') },
      errors: messages,
      isTouched: true,
    }));
  }
}
