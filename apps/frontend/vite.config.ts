import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

// Vite SPA config (ADR-014). Dev proxy forwards /api → Fastify on :8080.
//
// STACK-LOCK EXCEPTION SLE-1 (see ADR-015 / build stack-lock exceptions):
// the frontend stack-lock specifies Vite 8 (Rolldown), but Vite 8/Rolldown is not
// stably installable (pre-GA), so Vite 6 — the current stable React-19-compatible
// release — is used instead. Same static dist/ output, same proxy semantics, no
// functional or runtime impact (bundle budget verified). This mirrors the backend
// Dev-1/Dev-2/Dev-3 documented-deviation pattern.
//
// STACK-LOCK EXCEPTION SLE-2 (ADR-015): the stack-lock says "React Compiler
// enabled", but babel-plugin-react-compiler is intentionally NOT installed/enabled
// (it is still experimental for React 19 production builds). As a consequence the
// ~18 manual useMemo/useCallback memoizations in the codebase are load-bearing and
// must be preserved — do not remove them assuming the compiler will re-add them.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({ filename: 'dist/stats.html', gzipSize: true, template: 'treemap' }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      output: {
        // Keep the initial (shell) chunk small; route chunks split naturally via lazy routes.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tanstack/react-table') || id.includes('@tanstack/react-virtual')) {
              return 'tanstack-table';
            }
            if (id.includes('@tanstack/react-form')) return 'tanstack-form';
          }
          return undefined;
        },
      },
    },
  },
});
