import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Toaster } from './components/ui/toaster';
import { router } from './router';
import { startEventBridge } from './sse/event-bridge';
import './tailwind.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Register the query client on the router so beforeLoad guards can use it.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Single app-level SSE bridge (ADR-005). Opened once for the SPA lifetime.
startEventBridge(queryClient);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} context={{ queryClient }} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);

export { queryClient };
