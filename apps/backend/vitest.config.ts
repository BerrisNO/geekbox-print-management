import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/inventory/**',
        'src/procurement/**',
        'src/jobs/**',
        'src/integration/normalizer.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
      },
    },
  },
});
