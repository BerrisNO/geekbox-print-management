import { ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/** Native <select> wrapper — accessible by default, zero JS overhead. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'flex h-11 w-full appearance-none rounded-md border border-input bg-surface px-3 py-2 pr-9 text-sm text-foreground shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = 'Select';
