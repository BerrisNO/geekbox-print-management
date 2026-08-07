/**
 * Query-key factory (frontend spec §8). One key per API resource; filters are
 * folded into the key so SSE-driven invalidation can target precisely.
 */

export interface SpoolFilters {
  productId?: string;
  material?: string;
  status?: string;
  vendorId?: string;
  [key: string]: string | undefined;
}

export interface JobFilters {
  printerId?: string;
  outcome?: string;
  from?: string;
  to?: string;
  sort?: 'date' | 'cost';
  [key: string]: string | undefined;
}

export const queryKeys = {
  auth: {
    session: () => ['auth', 'session'] as const,
  },
  vendors: {
    all: (includeArchived?: boolean) =>
      ['vendors', { includeArchived: !!includeArchived }] as const,
  },
  manufacturers: {
    all: (includeArchived?: boolean) =>
      ['manufacturers', { includeArchived: !!includeArchived }] as const,
  },
  products: {
    all: (filters?: { material?: string; vendorId?: string; includeArchived?: boolean }) =>
      ['products', filters ?? {}] as const,
    detail: (id: string) => ['products', id] as const,
  },
  spools: {
    all: (filters?: SpoolFilters) => ['spools', filters ?? {}] as const,
    detail: (id: string) => ['spool', id] as const,
    ledger: (id: string) => ['spool', id, 'ledger'] as const,
  },
  inventory: {
    summary: () => ['inventory', 'summary'] as const,
    alerts: () => ['inventory', 'alerts'] as const,
  },
  purchaseOrders: {
    all: (status?: string) => ['purchase-orders', { status: status ?? null }] as const,
    detail: (id: string) => ['purchase-order', id] as const,
    receptions: (id: string) => ['purchase-order', id, 'receptions'] as const,
  },
  inbound: {
    overview: () => ['inbound'] as const,
  },
  goodsReceipts: {
    detail: (id: string) => ['goods-receipt', id] as const,
  },
  integration: {
    status: () => ['integration', 'status'] as const,
    settings: () => ['integration', 'settings'] as const,
  },
  printers: {
    all: () => ['printers'] as const,
    telemetry: (id: string) => ['printer', id, 'telemetry'] as const,
    slots: (id: string) => ['printer', id, 'slots'] as const,
  },
  jobs: {
    all: (filters?: JobFilters) => ['jobs', filters ?? {}] as const,
    detail: (id: string) => ['job', id] as const,
  },
  settings: {
    costRates: () => ['settings', 'cost-rates'] as const,
  },
} as const;
