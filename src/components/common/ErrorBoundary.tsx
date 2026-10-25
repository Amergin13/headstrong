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
      <div role="alert" className="wk-card space-y-3 text-center">
        <h2 className="wk-h1">
          {this.props.area ? `${this.props.area} couldn't load` : "Something didn't load"}
        </h2>
        <p className="wk-body">
          Your workouts and history are safe. Try again, or switch tabs and come back.
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="wk-button"
          style={{ background: 'var(--wk-accent)', color: '#13181C' }}
        >
          Try again
        </button>
      </div>
    );
  }
}

