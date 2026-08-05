import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem {
  label: string;
  to: string;
}

/** Route-driven tabs (settings). Uses router Links so state is URL-correct. */
export function TabsNav({ items }: { items: TabItem[] }) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border"
      aria-label="Settings sections"
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="whitespace-nowrap border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{
            className: 'border-primary text-foreground',
            'aria-current': 'page',
          }}
          activeOptions={{ exact: false }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Local (non-routed) tab bar with a proper roving tabindex and arrow-key
 * navigation per the WAI-ARIA Tabs pattern (WCAG 2.1.1 — frontier A-3): only the
 * selected tab is in the tab order; Left/Right (and Home/End) move focus and
 * selection between tabs.
 */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const clamped = (index + tabs.length) % tabs.length;
    const next = tabs[clamped];
    if (!next) return;
    onChange(next.value);
    refs.current[clamped]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        focusTab(currentIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        focusTab(currentIndex - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="flex gap-1 border-b border-border" role="tablist">
      {tabs.map((t, i) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
