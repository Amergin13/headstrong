import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional label used in the fallback message, e.g. "Progress". */
  area?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one broken screen from blanking the whole app. Saved data is untouched, so
 * "Try again" simply re-renders the screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="biometric-card p-5 space-y-3 text-center">
        <h2 className="text-base font-bold text-white">
          {this.props.area ? `${this.props.area} couldn't load` : "Something didn't load"}
        </h2>
        <p className="text-xs text-slate-400">
          Your workouts and history are safe. Try again, or switch tabs and come back.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="min-h-[44px] px-4 rounded-2xl bg-white text-slate-950 text-xs font-bold"
        >
          Try again
        </button>
      </div>
    );
  }
}
