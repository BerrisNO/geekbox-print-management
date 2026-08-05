import { create } from 'zustand';

/** Global UI-only state (spec §8): theme, toast queue, nav collapse, SSE degradation. */

export type Theme = 'light' | 'dark';

export interface Toast {
  id: string;
  variant: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface UiState {
  theme: Theme;
  navOpen: boolean;
  sseDegraded: boolean;
  toasts: Toast[];
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setNavOpen: (open: boolean) => void;
  toggleNav: () => void;
  setSseDegraded: (degraded: boolean) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

function initialTheme(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem('gbx-theme', theme);
  } catch {
    /* storage unavailable — ignore */
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  navOpen: false,
  sseDegraded: false,
  toasts: [],
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
  setNavOpen: (navOpen) => set({ navOpen }),
  toggleNav: () => set({ navOpen: !get().navOpen }),
  setSseDegraded: (sseDegraded) => set({ sseDegraded }),
  pushToast: (toast) => {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { ...toast, id }] });
    // Auto-dismiss after 5s.
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
