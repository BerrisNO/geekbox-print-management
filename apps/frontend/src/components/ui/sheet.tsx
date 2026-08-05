import { X } from 'lucide-react';
import { useRef } from 'react';
import { cn } from '../../lib/cn';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { Button } from './button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
}

/** Slide-over drawer for row-detail edit forms (full-screen on mobile via max-w). */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[400]" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'absolute top-0 flex h-full w-full max-w-md flex-col border-border bg-surface shadow-lg outline-none',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-border p-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
