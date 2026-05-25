import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary caught an error", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
          <div className="max-w-lg text-center border border-border bg-card p-8 rounded-sm shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-3">Application Error</p>
            <h1 className="font-display text-3xl font-bold mb-3">Something went wrong</h1>
            <p className="text-muted-foreground mb-6">
              The page crashed while rendering. You can try reloading, or return to the homepage.
            </p>
            {this.state.error?.message && (
              <pre className="text-left text-xs bg-muted p-3 rounded-sm overflow-auto mb-6 whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-foreground text-background rounded-sm font-medium hover:opacity-90"
              >
                Reload
              </button>
              <a
                href="/"
                className="px-4 py-2 border border-border rounded-sm font-medium hover:bg-muted"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
