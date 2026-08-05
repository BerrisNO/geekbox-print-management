import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

/** Skeleton loader — matches final dimensions (no CLS, spec §7.2 state 10). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden {...props} />;
}

export function Label({
  className,
  required,
  children,
  htmlFor,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    >
      {children}
      {required ? <span className="ml-0.5 text-destructive">*</span> : null}
    </label>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  id?: string;
}

/** Accessible toggle switch (keyboard operable via native checkbox). */
export function Switch({ checked, onCheckedChange, disabled, id, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={aria['aria-label']}
      aria-labelledby={aria['aria-labelledby']}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-secondary',
      )}
    >
      <span
        className={cn(
          'inline-block size-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** Empty-state (template 17) — always offers a next action (NFR-US-03). */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center">
      {Icon ? <Icon className="size-8 text-muted-foreground" /> : null}
      <div className="flex flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Error-state with retry (ES-105.1) — every failed load offers a next action. */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center"
    >
      <p className="font-medium text-destructive">Something went wrong</p>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
