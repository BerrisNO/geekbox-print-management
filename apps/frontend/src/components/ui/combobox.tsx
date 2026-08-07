import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary text shown dimmed. */
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  'aria-invalid'?: boolean;
}

/** Searchable single-select combobox (spool/product/vendor pickers, AC-305.1).
 *  Arrow-key navigable; no drag interactions (WCAG 2.5.7). */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  emptyText = 'No results',
  disabled,
  id,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={aria['aria-invalid']}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-md border border-input bg-surface px-3 text-sm shadow-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-50',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden />
      </button>
      {open ? (
        <div className="absolute z-[500] mt-1 w-full rounded-md border border-border bg-surface shadow-lg">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const opt = filtered[active];
                if (opt) choose(opt.value);
              } else if (e.key === 'Escape') {
                // Close only the dropdown, not an enclosing dialog.
                if (open) e.stopPropagation();
                setOpen(false);
              }
            }}
            placeholder="Search…"
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((opt, i) => (
                <div
                  key={opt.value}
                  role="option"
                  tabIndex={-1}
                  aria-selected={opt.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(opt.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      choose(opt.value);
                    }
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                    i === active && 'bg-surface-muted',
                  )}
                >
                  <span className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.hint ? (
                      <span className="text-xs text-muted-foreground">{opt.hint}</span>
                    ) : null}
                  </span>
                  {opt.value === value ? (
                    <Check className="size-4 text-primary" aria-hidden />
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
