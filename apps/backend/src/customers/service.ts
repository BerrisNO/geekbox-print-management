import type { Customer, CustomerInput } from '@geekbox/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { customer } from '../db/schema/inventory.js';
import { NotFoundError } from '../shared/errors/index.js';
import { newId } from '../shared/ids.js';

/** Customer CRUD — the customer-facing side of the catalog (mirrors CatalogService). */
export class CustomerService {
  constructor(private readonly db: Db) {}

  list(includeArchived = false): Customer[] {
    const rows = this.db.select().from(customer).all();
    return rows.filter((r) => includeArchived || r.archived === 0).map(this.toCustomer);
  }

  get(id: string): Customer {
    const row = this.db.select().from(customer).where(eq(customer.id, id)).get();
    if (!row) throw new NotFoundError('Customer');
    return this.toCustomer(row);
  }

  create(input: CustomerInput): Customer {
    const id = newId();
    this.db
      .insert(customer)
      .values({
        id,
        name: input.name,
        email: input.email ? input.email : null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        archived: 0,
      })
      .run();
    return this.get(id);
  }

  update(id: string, input: Partial<CustomerInput>): Customer {
    this.get(id);
    this.db
      .update(customer)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email ? input.email : null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      })
      .where(eq(customer.id, id))
      .run();
    return this.get(id);
  }

  archive(id: string): Customer {
    this.get(id);
    this.db.update(customer).set({ archived: 1 }).where(eq(customer.id, id)).run();
    return this.get(id);
  }

  private toCustomer = (r: typeof customer.$inferSelect): Customer => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    notes: r.notes,
    archived: r.archived === 1,
  });
}
