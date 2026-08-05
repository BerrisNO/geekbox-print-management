import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-surface-muted text-foreground',
        primary: 'border-transparent bg-primary/10 text-primary',
        success:
          'border-transparent bg-[var(--color-status-fresh)]/15 text-[var(--color-status-fresh)]',
        warning:
          'border-transparent bg-[var(--color-status-low)]/15 text-[var(--color-status-low)]',
        danger: 'border-transparent bg-destructive/15 text-destructive',
        info: 'border-transparent bg-info-500/15 text-info-500',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: LucideIcon;
}

/** Status badge — always icon + text + color (WCAG 1.4.1, never color alone). */
export function Badge({ className, variant, icon: Icon, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

export { badgeVariants };
