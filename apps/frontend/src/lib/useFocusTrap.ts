import { type RefObject, useEffect } from 'react';

/** Selector for tabbable elements used by the focus trap. */
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal focus trap (WCAG 2.1.2 keyboard-no-trap done right / 2.4.3
 * focus order — frontier A-2). When `active`:
 *  - remembers the currently-focused element and restores it on deactivate,
 *  - moves focus into the container (first focusable, else the container),
 *  - Esc calls onClose,
 *  - Tab / Shift+Tab wrap within the container,
 *  - locks body scroll.
 *
 * The container element must be focusable (tabIndex={-1}).
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    const restoreTo = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    (focusables()[0] ?? container)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container?.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeEl = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (activeEl === first || activeEl === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.();
    };
  }, [active, containerRef, onClose]);
}
