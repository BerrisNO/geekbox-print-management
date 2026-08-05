import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';

interface Props {
  children: ReactNode;
  /** Optional custom fallback renderer. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-level React error boundary (frontier C-1). A render exception anywhere in
 * the tree would otherwise blank the entire SPA; this catches it, logs it, and
 * shows a recoverable fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for diagnosis; there is no remote telemetry (ADR-013).
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return <DefaultErrorFallback error={error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

/** Default fallback UI, also usable as a TanStack Router errorComponent. */
export function DefaultErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        An unexpected error occurred while rendering this page. You can try again, or reload the
        application.
      </p>
      {error.message ? (
        <pre className="max-w-full overflow-x-auto rounded bg-surface-muted p-2 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      ) : null}
      <div className="flex gap-2">
        {reset ? (
          <Button type="button" variant="outline" onClick={reset}>
            Try again
          </Button>
        ) : null}
        <Button type="button" variant="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
