import { useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, UserCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLogout, useSession } from '../../api/hooks';
import { useUiStore } from '../../stores/ui-store';
import { Button } from '../ui/button';

/**
 * UserMenu (FR-002 logout home). Dropdown at TopBar trailing edge; "Log out"
 * fires POST /api/auth/logout, clears the query cache, redirects to /login
 * (AC-002.1). A failed logout keeps the user authenticated (session is server truth).
 */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout();
  const pushToast = useUiStore((s) => s.pushToast);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => navigate({ to: '/login' }),
      onError: () =>
        pushToast({ variant: 'error', title: 'Logout failed', description: 'Please try again.' }),
    });
  }

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <UserCircle aria-hidden />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[500] mt-1 w-52 rounded-md border border-border bg-surface p-1 shadow-lg"
        >
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Signed in as{' '}
            <span className="font-medium text-foreground">{session.data?.username ?? '…'}</span>
          </div>
          <MenuItem
            icon={Settings}
            onClick={() => {
              setOpen(false);
              navigate({ to: '/settings/account' });
            }}
          >
            Account settings
          </MenuItem>
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            disabled={logout.isPending}
            aria-busy={logout.isPending}
            className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-destructive hover:bg-surface-muted disabled:opacity-50"
          >
            <LogOut className="size-4" aria-hidden />
            {logout.isPending ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-surface-muted"
    >
      <Icon className="size-4" aria-hidden />
      {children}
    </button>
  );
}
