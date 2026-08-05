import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const STYLES = {
  success: 'border-[var(--color-status-fresh)]/40',
  error: 'border-destructive/40',
  info: 'border-info-500/40',
} as const;

/** Toast host — role="status" (polite) live region (spec §12.4). */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);

  return (
    <output
      className="fixed bottom-4 right-4 z-[600] flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-md border bg-surface p-3 shadow-lg',
              STYLES[t.variant],
            )}
          >
            <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description ? (
                <p className="text-sm text-muted-foreground">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </output>
  );
}
