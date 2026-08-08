import type {
  AdjustResult,
  AttributeResult,
  CostRateSettings,
  Customer,
  FilamentProduct,
  GoodsReceiptDetail,
  InboundRow,
  IntegrationSettings,
  IntegrationStatus,
  JobListResponse,
  LedgerEntry,
  LowStockAlert,
  Manufacturer,
  MaterialDef,
  Part,
  Printer,
  PrintJobDetail,
  ProductDetail,
  ProductStockRow,
  PurchaseOrder,
  PurchaseOrderDetail,
  ReceptionResult,
  SessionInfo,
  SlotView,
  Spool,
  SyncResult,
  TelemetrySnapshot,
  Vendor,
  WorkOrder,
  WorkOrderDetail,
} from '@geekbox/shared';
import { type UseQueryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { type JobFilters, queryKeys, type SpoolFilters } from './query-keys';

/* -------------------------------- auth -------------------------------- */
export function useSession(options?: Partial<UseQueryOptions<SessionInfo>>) {
  return useQuery({
    queryKey: queryKeys.auth.session(),
    queryFn: () => api.get<SessionInfo>('/auth/session'),
    retry: false,
    staleTime: 30_000,
    ...options,
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api.post<void>('/auth/login', body),
  });
}

export function useSetup() {
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api.post<SessionInfo>('/auth/setup', body),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.put<void>('/auth/password', body),
  });
}

/* ------------------------------- vendors ------------------------------ */
export function useVendors(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.vendors.all(includeArchived),
    queryFn: () => api.get<Vendor[]>('/vendors', { query: { includeArchived } }),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Vendor>('/vendors', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useUpdateVendor(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Vendor>(`/vendors/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useArchiveVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Vendor>(`/vendors/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

/* ---------------------------- manufacturers --------------------------- */
export function useManufacturers(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.manufacturers.all(includeArchived),
    queryFn: () => api.get<Manufacturer[]>('/manufacturers', { query: { includeArchived } }),
  });
}

export function useCreateManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Manufacturer>('/manufacturers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manufacturers'] }),
  });
}

export function useUpdateManufacturer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Manufacturer>(`/manufacturers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manufacturers'] }),
  });
}

export function useArchiveManufacturer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Manufacturer>(`/manufacturers/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manufacturers'] }),
  });
}

/* ------------------------------ materials ----------------------------- */
export function useMaterials(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.materials.all(includeArchived),
    queryFn: () => api.get<MaterialDef[]>('/materials', { query: { includeArchived } }),
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<MaterialDef>('/materials', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  });
}

export function useUpdateMaterial(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<MaterialDef>(`/materials/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      // Renames cascade into product/spool display names.
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['spools'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useArchiveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<MaterialDef>(`/materials/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['materials'] }),
  });
}

/* ------------------------------ customers ----------------------------- */
export function useCustomers(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.customers.all(includeArchived),
    queryFn: () => api.get<Customer[]>('/customers', { query: { includeArchived } }),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Customer>('/customers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Customer>(`/customers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useArchiveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Customer>(`/customers/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

/* -------------------------------- parts ------------------------------- */
export function useParts(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.parts.all(includeArchived),
    queryFn: () => api.get<Part[]>('/parts', { query: { includeArchived } }),
  });
}

export function usePart(id: string) {
  return useQuery({
    queryKey: queryKeys.parts.detail(id),
    queryFn: () => api.get<Part>(`/parts/${id}`),
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Part>('/parts', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useUpdatePart(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Part>(`/parts/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useArchivePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Part>(`/parts/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

/* ------------------------------ products ------------------------------ */
export function useProducts(filters?: {
  material?: string;
  vendorId?: string;
  includeArchived?: boolean;
}) {
  return useQuery({
    queryKey: queryKeys.products.all(filters),
    queryFn: () => api.get<FilamentProduct[]>('/products', { query: filters }),
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<FilamentProduct>('/products', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<FilamentProduct>(`/products/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<FilamentProduct>(`/products/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

/* ------------------------------- spools ------------------------------- */
export function useSpools(filters?: SpoolFilters) {
  return useQuery({
    queryKey: queryKeys.spools.all(filters),
    queryFn: () => api.get<Spool[]>('/spools', { query: filters }),
  });
}

export function useSpool(id: string) {
  return useQuery({
    queryKey: queryKeys.spools.detail(id),
    queryFn: () => api.get<Spool>(`/spools/${id}`),
  });
}

export function useSpoolLedger(id: string) {
  return useQuery({
    queryKey: queryKeys.spools.ledger(id),
    queryFn: () => api.get<LedgerEntry[]>(`/spools/${id}/ledger`),
  });
}

export function useRegisterSpool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Spool>('/spools', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['spools'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useUpdateSpool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Spool>(`/spools/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spools.detail(id) });
      qc.invalidateQueries({ queryKey: ['spools'] });
      // Purchase-price edits change valuation → refresh the stock summary too.
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useAdjustSpool(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<AdjustResult>(`/spools/${id}/adjust`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spools.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.spools.ledger(id) });
      qc.invalidateQueries({ queryKey: ['spools'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useTransitionSpoolStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: string; confirmUnmap?: boolean }) =>
      api.post<Spool>(`/spools/${id}/status`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spools.detail(id) });
      qc.invalidateQueries({ queryKey: ['spools'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

/* ------------------------------ inventory ----------------------------- */
export function useInventorySummary() {
  return useQuery({
    queryKey: queryKeys.inventory.summary(),
    queryFn: () => api.get<ProductStockRow[]>('/inventory/summary'),
  });
}

export function useLowStockAlerts() {
  return useQuery({
    queryKey: queryKeys.inventory.alerts(),
    queryFn: () => api.get<LowStockAlert[]>('/inventory/alerts'),
  });
}

/* --------------------------- purchase orders -------------------------- */
export function usePurchaseOrders(status?: string) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.all(status),
    queryFn: () => api.get<PurchaseOrder[]>('/purchase-orders', { query: { status } }),
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.purchaseOrders.detail(id),
    queryFn: () => api.get<PurchaseOrderDetail>(`/purchase-orders/${id}`),
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<PurchaseOrder>('/purchase-orders', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<PurchaseOrder>(`/purchase-orders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
    },
  });
}

export function useTransitionPoStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: 'ordered' | 'cancelled' }) =>
      api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/status`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(id) });
      qc.invalidateQueries({ queryKey: ['inbound'] });
    },
  });
}

export function useInboundOverview() {
  return useQuery({
    queryKey: queryKeys.inbound.overview(),
    queryFn: () => api.get<InboundRow[]>('/inbound'),
  });
}

/* ---------------------------- work orders ----------------------------- */
export function useWorkOrders(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.workOrders.all(includeArchived),
    queryFn: () => api.get<WorkOrder[]>('/work-orders', { query: { includeArchived } }),
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.workOrders.detail(id),
    queryFn: () => api.get<WorkOrderDetail>(`/work-orders/${id}`),
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<WorkOrderDetail>('/work-orders', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-orders'] }),
  });
}

export function useUpdateWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<WorkOrderDetail>(`/work-orders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
    },
  });
}

export function useArchiveWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<WorkOrder>(`/work-orders/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-orders'] }),
  });
}

export function useLinkJobToLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, jobId }: { lineId: string; jobId: string }) =>
      api.post<WorkOrderDetail>(`/work-orders/${id}/lines/${lineId}/link-job`, { jobId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useUnlinkJobFromLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, jobId }: { lineId: string; jobId: string }) =>
      api.post<WorkOrderDetail>(`/work-orders/${id}/lines/${lineId}/unlink-job`, { jobId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

/* ------------------------------ receptions ---------------------------- */
export function usePostReception(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<ReceptionResult>(`/purchase-orders/${poId}/receptions`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(poId) });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['inbound'] });
      qc.invalidateQueries({ queryKey: ['spools'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useGoodsReceipt(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.goodsReceipts.detail(id),
    queryFn: () => api.get<GoodsReceiptDetail>(`/goods-receipts/${id}`),
    enabled,
  });
}

/* ----------------------------- integration ---------------------------- */
export function useIntegrationStatus(options?: Partial<UseQueryOptions<IntegrationStatus>>) {
  return useQuery({
    queryKey: queryKeys.integration.status(),
    queryFn: () => api.get<IntegrationStatus>('/integration/status'),
    ...options,
  });
}

export function useIntegrationSettings() {
  return useQuery({
    queryKey: queryKeys.integration.settings(),
    queryFn: () => api.get<IntegrationSettings>('/integration/settings'),
  });
}

export function useUpdateIntegrationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<IntegrationSettings>('/integration/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.integration.settings() });
      qc.invalidateQueries({ queryKey: queryKeys.integration.status() });
    },
  });
}

export function useLinkBambu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<IntegrationStatus | { state: 'code_required'; challengeId: string }>(
        '/integration/link',
        body,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration'] }),
  });
}

export function useVerifyLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { challengeId: string; code: string }) =>
      api.post<IntegrationStatus>('/integration/link/verify', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration'] }),
  });
}

export function useLinkManualToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<IntegrationStatus>('/integration/link/manual-token', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration'] }),
  });
}

export function useUnlinkBambu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<void>('/integration/link'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integration'] }),
  });
}

/* ------------------------------ printers ------------------------------ */
export function usePrinters() {
  return useQuery({
    queryKey: queryKeys.printers.all(),
    queryFn: () => api.get<Printer[]>('/printers'),
  });
}

export function useTelemetry(id: string, options?: Partial<UseQueryOptions<TelemetrySnapshot>>) {
  return useQuery({
    queryKey: queryKeys.printers.telemetry(id),
    queryFn: () => api.get<TelemetrySnapshot>(`/printers/${id}/telemetry`),
    retry: false,
    ...options,
  });
}

export function useSlots(id: string, options?: Partial<UseQueryOptions<SlotView[]>>) {
  return useQuery({
    queryKey: queryKeys.printers.slots(id),
    queryFn: () => api.get<SlotView[]>(`/printers/${id}/slots`),
    ...options,
  });
}

export function useRefreshPrinters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Printer[]>('/printers/refresh'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  });
}

export function useRegisterPrinter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<Printer>('/printers', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  });
}

export function useUpdatePrinter(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<Printer>(`/printers/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['printers'] }),
  });
}

export function useMapSlot(printerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotRef, spoolId }: { slotRef: string; spoolId: string }) =>
      api.put<SlotView>(`/printers/${printerId}/slots/${encodeURIComponent(slotRef)}/mapping`, {
        spoolId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.printers.slots(printerId) });
      qc.invalidateQueries({ queryKey: ['spools'] });
    },
  });
}

export function useUnmapSlot(printerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotRef: string) =>
      api.delete<void>(`/printers/${printerId}/slots/${encodeURIComponent(slotRef)}/mapping`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.printers.slots(printerId) });
      qc.invalidateQueries({ queryKey: ['spools'] });
    },
  });
}

export function useConfirmMapping(printerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slotRef: string) =>
      api.post<SlotView>(
        `/printers/${printerId}/slots/${encodeURIComponent(slotRef)}/mapping/confirm`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.printers.slots(printerId) }),
  });
}

/* ------------------------------- jobs --------------------------------- */
export function useJobs(filters?: JobFilters) {
  return useQuery({
    queryKey: queryKeys.jobs.all(filters),
    queryFn: () => api.get<JobListResponse>('/jobs', { query: filters }),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(id),
    queryFn: () => api.get<PrintJobDetail>(`/jobs/${id}`),
  });
}

export function useCreateManualJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<PrintJobDetail>('/jobs', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['spools'] });
    },
  });
}

export function useCorrectJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.patch<PrintJobDetail>(`/jobs/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.detail(id) });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['spools'] });
    },
  });
}

export function useAttributeUsage(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ usageId, spoolId }: { usageId: string; spoolId: string }) =>
      api.post<AttributeResult>(`/jobs/${jobId}/usages/${usageId}/attribute`, { spoolId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.detail(jobId) });
      qc.invalidateQueries({ queryKey: ['spools'] });
    },
  });
}

export function useRecalculateJob(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/jobs/${id}/recalculate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.jobs.detail(id) });
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export function useSyncTaskHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SyncResult>('/jobs/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });
}

/* ----------------------------- cost rates ----------------------------- */
export function useCostRates() {
  return useQuery({
    queryKey: queryKeys.settings.costRates(),
    queryFn: () => api.get<CostRateSettings>('/settings/cost-rates'),
  });
}

export function useUpdateCostRates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.put<CostRateSettings>('/settings/cost-rates', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings.costRates() }),
  });
}
