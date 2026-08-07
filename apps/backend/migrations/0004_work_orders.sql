CREATE TABLE work_order (
  id TEXT PRIMARY KEY,
  order_ref TEXT,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  order_date INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  CHECK (status IN ('draft','confirmed','in_production','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE work_order_line (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_order(id),
  part_id TEXT NOT NULL REFERENCES part(id),
  quantity INTEGER NOT NULL,
  unit_price_minor INTEGER,
  unit_cost_minor INTEGER,
  notes TEXT,
  CHECK (quantity > 0),
  CHECK (unit_price_minor IS NULL OR unit_price_minor >= 0),
  CHECK (unit_cost_minor IS NULL OR unit_cost_minor >= 0)
);
--> statement-breakpoint
ALTER TABLE print_job ADD COLUMN work_order_line_id TEXT REFERENCES work_order_line(id);
