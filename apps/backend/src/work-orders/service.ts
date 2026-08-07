import type {
  JobOutcome,
  Part,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderInput,
  WorkOrderLine,
  WorkOrderLineInput,
  WorkOrderLinkedJob,
  WorkOrderPatch,
  WorkOrderStatus,
} from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { customer, part } from '../db/schema/inventory.js';
import { printJob } from '../db/schema/jobs.js';
import { workOrder, workOrderLine } from '../db/schema/work-orders.js';
import type { CostingService } from '../jobs/costing/service.js';
import type { PartService } from '../parts/service.js';
import { ConflictError, NotFoundError } from '../shared/errors/index.js';
import { newId, nowMs } from '../shared/ids.js';

/**
 * Work-order CRUD + line economics snapshotting + fulfillment rollups.
 * Mirrors PurchaseOrderService (header + lines with status) but sources its line
 * economics from the parts service so a placed order carries a stable price/cost
 * snapshot that does not re-price when cost rates change later.
 */
export class WorkOrderService {
  constructor(
    private readonly db: Db,
    private readonly parts: PartService,
    private readonly costing: CostingService,
  ) {}

  list(includeArchived = false): WorkOrder[] {
    const rows = this.db.select().from(workOrder).all();
    return rows.filter((r) => includeArchived || r.archived === 0).map((r) => this.toWorkOrder(r));
  }

  get(id: string): WorkOrder {
    const row = this.db.select().from(workOrder).where(eq(workOrder.id, id)).get();
    if (!row) throw new NotFoundError('Work order');
    return this.toWorkOrder(row);
  }

  getDetail(id: string): WorkOrderDetail {
    const row = this.db.select().from(workOrder).where(eq(workOrder.id, id)).get();
    if (!row) throw new NotFoundError('Work order');
    return { ...this.toWorkOrder(row), lines: this.linesFor(id) };
  }

  create(input: WorkOrderInput): WorkOrderDetail {
    this.assertCustomer(input.customerId);
    const id = newId();
    const orderDate = input.orderDate ? new Date(input.orderDate).getTime() : null;
    this.db.transaction(() => {
      this.db
        .insert(workOrder)
        .values({
          id,
          orderRef: input.orderRef ?? null,
          customerId: input.customerId,
          orderDate,
          status: input.status ?? 'draft',
          notes: input.notes ?? null,
          archived: 0,
        })
        .run();
      for (const line of input.lines) this.insertLine(id, line);
    });
    return this.getDetail(id);
  }

  update(id: string, patch: WorkOrderPatch): WorkOrderDetail {
    const row = this.db.select().from(workOrder).where(eq(workOrder.id, id)).get();
    if (!row) throw new NotFoundError('Work order');
    // Validate the replacement lines' parts up front (404 before any write).
    if (patch.lines) for (const line of patch.lines) this.assertPart(line.partId);
    this.db.transaction(() => {
      this.db
        .update(workOrder)
        .set({
          ...(patch.orderRef !== undefined ? { orderRef: patch.orderRef ?? null } : {}),
          ...(patch.orderDate !== undefined
            ? { orderDate: patch.orderDate ? new Date(patch.orderDate).getTime() : null }
            : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes ?? null } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        })
        .where(eq(workOrder.id, id))
        .run();
      if (patch.lines) {
        // Full replace + re-snapshot economics. Detach any linked jobs from lines
        // being removed so we never orphan a FK to a deleted line.
        const existing = this.db
          .select({ id: workOrderLine.id })
          .from(workOrderLine)
          .where(eq(workOrderLine.workOrderId, id))
          .all();
        for (const l of existing) {
          this.db
            .update(printJob)
            .set({ workOrderLineId: null, updatedAt: nowMs() })
            .where(eq(printJob.workOrderLineId, l.id))
            .run();
        }
        this.db.delete(workOrderLine).where(eq(workOrderLine.workOrderId, id)).run();
        for (const line of patch.lines) this.insertLine(id, line);
      }
    });
    return this.getDetail(id);
  }

  archive(id: string): WorkOrder {
    this.get(id);
    this.db.update(workOrder).set({ archived: 1 }).where(eq(workOrder.id, id)).run();
    return this.get(id);
  }

  linkJob(id: string, lineId: string, jobId: string): WorkOrderDetail {
    this.get(id);
    const line = this.assertLine(id, lineId);
    const job = this.db.select().from(printJob).where(eq(printJob.id, jobId)).get();
    if (!job) throw new NotFoundError('Print job');
    if (job.workOrderLineId != null && job.workOrderLineId !== line.id) {
      throw new ConflictError('WO_JOB_ALREADY_LINKED', 'Job is already linked to another line');
    }
    this.db
      .update(printJob)
      .set({ workOrderLineId: line.id, updatedAt: nowMs() })
      .where(eq(printJob.id, jobId))
      .run();
    return this.getDetail(id);
  }

  unlinkJob(id: string, lineId: string, jobId: string): WorkOrderDetail {
    this.get(id);
    const line = this.assertLine(id, lineId);
    const job = this.db.select().from(printJob).where(eq(printJob.id, jobId)).get();
    if (!job) throw new NotFoundError('Print job');
    if (job.workOrderLineId !== line.id) {
      throw new ConflictError('WO_JOB_NOT_LINKED', 'Job is not linked to this line');
    }
    this.db
      .update(printJob)
      .set({ workOrderLineId: null, updatedAt: nowMs() })
      .where(eq(printJob.id, jobId))
      .run();
    return this.getDetail(id);
  }

  /** Snapshot a line's economics from the part and insert it. */
  private insertLine(workOrderId: string, line: WorkOrderLineInput): void {
    const p = this.getPart(line.partId);
    const unitCostMinor = p.economics.unitCostMinor;
    const unitPriceMinor = line.unitPriceMinor ?? p.economics.effectiveSellPriceMinor;
    this.db
      .insert(workOrderLine)
      .values({
        id: newId(),
        workOrderId,
        partId: line.partId,
        quantity: line.quantity,
        unitPriceMinor,
        unitCostMinor,
        notes: line.notes ?? null,
      })
      .run();
  }

  private assertCustomer(customerId: string): void {
    const row = this.db
      .select({ id: customer.id })
      .from(customer)
      .where(eq(customer.id, customerId))
      .get();
    if (!row) throw new NotFoundError('Customer');
  }

  private assertPart(partId: string): void {
    const row = this.db.select({ id: part.id }).from(part).where(eq(part.id, partId)).get();
    if (!row) throw new NotFoundError('Part');
  }

  /** Load the computed part (with economics); 404 when missing. */
  private getPart(partId: string): Part {
    this.assertPart(partId);
    return this.parts.get(partId);
  }

  private assertLine(workOrderId: string, lineId: string): typeof workOrderLine.$inferSelect {
    const row = this.db.select().from(workOrderLine).where(eq(workOrderLine.id, lineId)).get();
    if (!row || row.workOrderId !== workOrderId) throw new NotFoundError('Work order line');
    return row;
  }

  private customerName(customerId: string): string {
    return (
      this.db
        .select({ name: customer.name })
        .from(customer)
        .where(eq(customer.id, customerId))
        .get()?.name ?? ''
    );
  }

  /** Map line rows to DTOs, computing totals + fulfillment rollups. */
  private linesFor(workOrderId: string): WorkOrderLine[] {
    const rows = this.db
      .select()
      .from(workOrderLine)
      .where(eq(workOrderLine.workOrderId, workOrderId))
      .all();
    return rows.map((l) => this.toLine(l));
  }

  private toLine(l: typeof workOrderLine.$inferSelect): WorkOrderLine {
    const p = this.db.select().from(part).where(eq(part.id, l.partId)).get();
    const unitPriceMinor = l.unitPriceMinor ?? 0;
    const unitCostMinor = l.unitCostMinor ?? 0;
    const lineSellMinor = l.quantity * unitPriceMinor;
    const lineCostMinor = l.quantity * unitCostMinor;

    // Fulfillment: all print jobs linked to this line.
    const jobs = this.db.select().from(printJob).where(eq(printJob.workOrderLineId, l.id)).all();
    let actualCostMinor = 0;
    let actualIncomplete = false;
    const linkedJobs: WorkOrderLinkedJob[] = jobs.map((j) => {
      const cost = this.costing.currentCost(j.id);
      const costMinor = cost ? cost.totalCostMinor : null;
      if (costMinor == null || cost?.incomplete) actualIncomplete = true;
      if (costMinor != null) actualCostMinor += costMinor;
      return {
        id: j.id,
        jobName: j.jobName,
        outcome: j.outcome as JobOutcome,
        costMinor,
      };
    });

    return {
      id: l.id,
      partId: l.partId,
      partArticleNo: p?.articleNo ?? '',
      partName: p?.name ?? '',
      quantity: l.quantity,
      unitPriceMinor,
      unitCostMinor,
      lineSellMinor,
      lineCostMinor,
      lineMarginMinor: lineSellMinor - lineCostMinor,
      notes: l.notes,
      producedQty: jobs.length,
      actualCostMinor,
      actualIncomplete,
      linkedJobs,
    };
  }

  private toWorkOrder(r: typeof workOrder.$inferSelect): WorkOrder {
    const lines = this.linesFor(r.id);
    const sellMinor = lines.reduce((a, l) => a + l.lineSellMinor, 0);
    const costMinor = lines.reduce((a, l) => a + l.lineCostMinor, 0);
    const marginMinor = sellMinor - costMinor;
    const marginPct = sellMinor > 0 ? Math.round((marginMinor / sellMinor) * 100) : 0;
    return {
      id: r.id,
      orderRef: r.orderRef,
      customerId: r.customerId,
      customerName: this.customerName(r.customerId),
      orderDate: r.orderDate != null ? new Date(r.orderDate).toISOString().slice(0, 10) : null,
      status: r.status as WorkOrderStatus,
      notes: r.notes,
      archived: r.archived === 1,
      lineCount: lines.length,
      totals: { sellMinor, costMinor, marginMinor, marginPct },
    };
  }
}
