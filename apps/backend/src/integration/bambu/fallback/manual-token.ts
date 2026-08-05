import { Normalizer } from '../../normalizer.js';
import type { BambuCloudGateway, LinkResult, PrinterDescriptor, TaskRecord } from '../../ports.js';
import { BambuRestAdapter } from '../rest-adapter.js';

/**
 * ManualTokenAdapter (A-01 fallback, ADR-012/Q-06). Implements the same
 * BambuCloudGateway surface minus login — the user supplies uid + access token
 * directly. Device/task calls reuse the REST adapter's normalized paths.
 */
export class ManualTokenAdapter implements BambuCloudGateway {
  private readonly rest: BambuRestAdapter;

  constructor(normalizer: Normalizer, fetchFn: typeof fetch = fetch) {
    this.rest = new BambuRestAdapter(normalizer, fetchFn);
  }

  async login(): Promise<LinkResult> {
    throw new Error('ManualTokenAdapter does not support login; use linkWithManualToken');
  }

  async verifyCode(): Promise<LinkResult> {
    throw new Error('ManualTokenAdapter does not support code verification');
  }

  listDevices(accessToken: string): Promise<PrinterDescriptor[]> {
    return this.rest.listDevices(accessToken);
  }

  fetchTasks(accessToken: string, sinceMs?: number): Promise<TaskRecord[]> {
    return this.rest.fetchTasks(accessToken, sinceMs);
  }
}
