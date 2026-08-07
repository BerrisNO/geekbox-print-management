import type { SessionInfo } from '@geekbox/shared';
import type { QueryClient } from '@tanstack/react-query';
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { ApiError, api } from './api/client';
import { queryKeys } from './api/query-keys';
import { DefaultErrorFallback } from './components/ErrorBoundary';
import { AppShell } from './components/shell/AppShell';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: lazyRouteComponent(() => import('./routes/NotFound'), 'NotFoundPage'),
});

/* ----------------------------- public (auth) ----------------------------- */
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: lazyRouteComponent(() => import('./routes/Login'), 'LoginPage'),
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: lazyRouteComponent(() => import('./routes/Setup'), 'SetupPage'),
});

/* --------------------------- guarded app layout -------------------------- */
async function requireSession(queryClient: QueryClient, href: string): Promise<void> {
  try {
    await queryClient.ensureQueryData({
      queryKey: queryKeys.auth.session(),
      queryFn: () => api.get<SessionInfo>('/auth/session'),
      staleTime: 30_000,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      throw redirect({ to: '/login', search: { redirect: href } });
    }
    throw err;
  }
}

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_app',
  beforeLoad: async ({ context, location }) => {
    await requireSession(context.queryClient, location.href);
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

/* --------------------- guarded but chrome-less routes -------------------- */
// Session-guarded like the app, but rendered WITHOUT AppShell so the print
// output has no nav chrome (sibling of appRoute, not a child).
const printLabelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/print/labels',
  beforeLoad: async ({ context, location }) => {
    await requireSession(context.queryClient, location.href);
  },
  validateSearch: (search: Record<string, unknown>) => ({
    ids: typeof search.ids === 'string' ? search.ids : '',
    copies: Math.max(1, Number(search.copies) || 1),
  }),
  component: lazyRouteComponent(() => import('./routes/PrintLabels'), 'PrintLabelsPage'),
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./routes/Dashboard'), 'DashboardPage'),
});

const inventoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inventory',
  component: lazyRouteComponent(() => import('./routes/Inventory'), 'InventoryPage'),
});

const spoolDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inventory/spools/$spoolId',
  component: lazyRouteComponent(() => import('./routes/SpoolDetail'), 'SpoolDetailPage'),
});

const productsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/catalog/products',
  component: lazyRouteComponent(() => import('./routes/Products'), 'ProductsPage'),
});

const vendorsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/catalog/vendors',
  component: lazyRouteComponent(() => import('./routes/Vendors'), 'VendorsPage'),
});

const manufacturersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/catalog/manufacturers',
  component: lazyRouteComponent(() => import('./routes/Manufacturers'), 'ManufacturersPage'),
});

const partsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/parts',
  component: lazyRouteComponent(() => import('./routes/Parts'), 'PartsPage'),
});

const customersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/customers',
  component: lazyRouteComponent(() => import('./routes/Customers'), 'CustomersPage'),
});

const inboundRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inbound',
  component: lazyRouteComponent(() => import('./routes/Inbound'), 'InboundPage'),
});

const purchaseOrdersRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/purchase-orders',
  component: lazyRouteComponent(() => import('./routes/PurchaseOrders'), 'PurchaseOrdersPage'),
});

const purchaseOrderDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/purchase-orders/$id',
  component: lazyRouteComponent(
    () => import('./routes/PurchaseOrderDetail'),
    'PurchaseOrderDetailPage',
  ),
});

const receptionRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/purchase-orders/$id/receive',
  component: lazyRouteComponent(() => import('./routes/Reception'), 'ReceptionPage'),
});

const jobsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs',
  validateSearch: (search: Record<string, unknown>) => ({
    printerId: (search.printerId as string) || undefined,
    outcome: (search.outcome as string) || undefined,
    from: (search.from as string) || undefined,
    to: (search.to as string) || undefined,
    sort: (search.sort === 'cost' ? 'cost' : 'date') as 'date' | 'cost',
  }),
  component: lazyRouteComponent(() => import('./routes/Jobs'), 'JobsPage'),
});

const jobDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs/$id',
  component: lazyRouteComponent(() => import('./routes/JobDetail'), 'JobDetailPage'),
});

const manualJobRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/jobs/new',
  component: lazyRouteComponent(() => import('./routes/ManualJob'), 'ManualJobPage'),
});

/* ------------------------------- settings -------------------------------- */
const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./routes/settings/SettingsLayout'), 'SettingsLayout'),
});

const settingsIndexRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/settings/account' });
  },
});

const accountSettingsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/account',
  component: lazyRouteComponent(() => import('./routes/settings/Account'), 'AccountSettings'),
});

const costRatesRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/cost-rates',
  component: lazyRouteComponent(() => import('./routes/settings/CostRates'), 'CostRatesSettings'),
});

const integrationRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/integration',
  component: lazyRouteComponent(
    () => import('./routes/settings/Integration'),
    'IntegrationSettings',
  ),
});

const lowStockRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/low-stock',
  component: lazyRouteComponent(() => import('./routes/settings/LowStock'), 'LowStockSettings'),
});

const backupRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/backup',
  component: lazyRouteComponent(() => import('./routes/settings/Backup'), 'BackupSettings'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  printLabelsRoute,
  appRoute.addChildren([
    dashboardRoute,
    inventoryRoute,
    spoolDetailRoute,
    productsRoute,
    vendorsRoute,
    manufacturersRoute,
    partsRoute,
    customersRoute,
    inboundRoute,
    purchaseOrdersRoute,
    purchaseOrderDetailRoute,
    receptionRoute,
    jobsRoute,
    jobDetailRoute,
    manualJobRoute,
    settingsRoute.addChildren([
      settingsIndexRoute,
      accountSettingsRoute,
      costRatesRoute,
      integrationRoute,
      lowStockRoute,
      backupRoute,
    ]),
  ]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient: undefined as unknown as QueryClient },
  defaultPreload: 'intent',
  // Any route render/loader exception renders a recoverable fallback instead of a
  // blank SPA (frontier C-1).
  defaultErrorComponent: ({ error, reset }) => <DefaultErrorFallback error={error} reset={reset} />,
});
