import { Link } from '@tanstack/react-router';
import {
  Boxes,
  ClipboardList,
  Component,
  Factory,
  LayoutDashboard,
  Menu,
  Moon,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Sun,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import { useId } from 'react';
import { useIntegrationStatus, useLowStockAlerts } from '../../api/hooks';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui-store';
import { Button } from '../ui/button';
import { DegradationBanners } from './Banner';
import { UserMenu } from './UserMenu';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/parts', label: 'Products', icon: Component },
  { to: '/work-orders', label: 'Work orders', icon: ClipboardList },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/catalog/products', label: 'Filament', icon: Package },
  { to: '/catalog/vendors', label: 'Vendors', icon: Boxes },
  { to: '/catalog/manufacturers', label: 'Manufacturers', icon: Factory },
  { to: '/inbound', label: 'Inbound', icon: Truck },
  { to: '/purchase-orders', label: 'Purchase orders', icon: ShoppingCart },
  { to: '/jobs', label: 'Print jobs', icon: ReceiptText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navOpen = useUiStore((s) => s.navOpen);
  const setNavOpen = useUiStore((s) => s.setNavOpen);
  const status = useIntegrationStatus();
  const mainContentId = useId();

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        href={`#${mainContentId}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[700] focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Off-canvas backdrop on mobile */}
      {navOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-[290] bg-black/50 md:hidden"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <DegradationBanners status={status.data} />
        <main id={mainContentId} className="flex-1 overflow-x-hidden p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function SideNav() {
  const navOpen = useUiStore((s) => s.navOpen);
  const setNavOpen = useUiStore((s) => s.setNavOpen);
  const alerts = useLowStockAlerts();
  const lowStockCount = alerts.data?.length ?? 0;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-y-0 left-0 z-[300] flex w-64 flex-col border-r border-border bg-surface transition-transform md:static md:translate-x-0',
        navOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Package className="size-5" aria-hidden />
        </div>
        <span className="font-semibold">GeekBOX</span>
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV.map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={() => setNavOpen(false)}
              className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
              activeProps={{
                className: 'bg-primary/10 text-primary',
                'aria-current': 'page',
              }}
              activeOptions={{ exact: item.exact }}
            >
              <item.icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.to === '/inventory' && lowStockCount > 0 ? (
                <NavBadge count={lowStockCount} label="low-stock alerts" />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function NavBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      role="img"
      aria-label={`${count} ${label}`}
      className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-status-low)] px-1.5 text-xs font-semibold text-white"
    >
      {count}
    </span>
  );
}

function TopBar() {
  const toggleNav = useUiStore((s) => s.toggleNav);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <header className="sticky top-0 z-[200] flex h-16 items-center gap-2 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={toggleNav}
      >
        <Menu aria-hidden />
      </Button>
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="icon"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggleTheme}
      >
        {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
      <UserMenu />
    </header>
  );
}
