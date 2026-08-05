import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: [
    './src/db/schema/identity.ts',
    './src/db/schema/inventory.ts',
    './src/db/schema/procurement.ts',
    './src/db/schema/integration.ts',
    './src/db/schema/jobs.ts',
  ],
  out: './migrations',
});
