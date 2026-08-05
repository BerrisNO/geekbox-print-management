import { EventBus } from './bus/event-bus.js';
import type { AppConfig } from './config.js';
import type { Db } from './db/client.js';
import { IdentityService } from './identity/service.js';
import { SessionService } from './identity/session.js';
import { IntegrationService } from './integration/linking/service.js';
import { Normalizer } from './integration/normalizer.js';
import { TelemetrySupervisor } from './integration/supervisor.js';
import { TaskSyncService } from './integration/task-sync.js';
import { AesGcmTokenVault } from './integration/token-vault.js';
import { InventoryReadService } from './inventory/alerts/service.js';
import { AmsMappingService } from './inventory/ams-mapping/service.js';
import { CatalogService } from './inventory/catalog/service.js';
import { LedgerWriter } from './inventory/ledger/ledger-write.js';
import { SpoolService } from './inventory/spool/service.js';
import { CostingService } from './jobs/costing/service.js';
import { JobService } from './jobs/job/service.js';
import { InboundService } from './procurement/inbound/service.js';
import { PurchaseOrderService } from './procurement/po/service.js';
import { ReceptionService } from './procurement/reception/service.js';
import { createLogger, type Logger } from './shared/logger.js';

/**
 * Dependency container. Wires all module services with a single Db + EventBus.
 * Composition root — the only place that knows about all modules at once.
 */
export interface Container {
  config: AppConfig;
  db: Db;
  log: Logger;
  bus: EventBus;
  identity: IdentityService;
  sessions: SessionService;
  ledger: LedgerWriter;
  catalog: CatalogService;
  spools: SpoolService;
  inventoryRead: InventoryReadService;
  ams: AmsMappingService;
  purchaseOrders: PurchaseOrderService;
  inbound: InboundService;
  reception: ReceptionService;
  costing: CostingService;
  jobs: JobService;
  integration: IntegrationService;
  supervisor: TelemetrySupervisor;
  taskSync: TaskSyncService;
  normalizer: Normalizer;
}

export function buildContainer(config: AppConfig, db: Db): Container {
  const log = createLogger(config.logLevel);
  const bus = new EventBus();

  const sessions = new SessionService(db);
  const identity = new IdentityService(db, sessions);

  const ledger = new LedgerWriter(db);
  const catalog = new CatalogService(db);
  const spools = new SpoolService(db, ledger);
  const inventoryRead = new InventoryReadService(db);
  const ams = new AmsMappingService(db);

  const purchaseOrders = new PurchaseOrderService(db);
  const inbound = new InboundService(db);
  const reception = new ReceptionService(db, ledger, spools, purchaseOrders, bus);

  const costing = new CostingService(db, bus);
  const jobs = new JobService(db, ledger, costing, ams, bus);

  const normalizer = new Normalizer((msg) => log.info(msg));
  const vault = new AesGcmTokenVault(config.tokenEncryptionKey);
  const supervisor = new TelemetrySupervisor(db, bus, log);
  const integration = new IntegrationService({
    db,
    bus,
    vault,
    supervisor,
    normalizer,
    mqttRegionOverride: config.mqttRegionOverride,
  });
  const taskSync = new TaskSyncService(db, integration, jobs);

  // Alert evaluator subscribes to stock changes → emits low-stock SSE.
  bus.subscribe((e) => {
    if (e.type === 'SpoolsReceivedIntoStock' || e.type === 'FilamentConsumptionRecorded') {
      // Re-evaluate alerts for affected products on the next status read; the SSE
      // low-stock messages are driven by the InventoryReadService via alert checks.
      try {
        const alerts = inventoryRead.alerts();
        for (const a of alerts) {
          bus.publish({
            type: 'LowStockThresholdCrossed',
            productId: a.productId,
            thresholdG: a.thresholdG,
            currentG: a.currentRemainingG,
            onOrderQty: a.onOrderQty,
            earliestEta: a.earliestEta,
          });
        }
      } catch {
        /* alert re-eval must never break the write path */
      }
    }
  });

  return {
    config,
    db,
    log,
    bus,
    identity,
    sessions,
    ledger,
    catalog,
    spools,
    inventoryRead,
    ams,
    purchaseOrders,
    inbound,
    reception,
    costing,
    jobs,
    integration,
    supervisor,
    taskSync,
    normalizer,
  };
}
