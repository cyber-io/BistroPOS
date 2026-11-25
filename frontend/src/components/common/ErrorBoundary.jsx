import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      try { this.props.onReset(); } catch {}
    }
    // Hard refresh resets any stale React fiber state / HMR hook mismatch
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({ error: this.state.error, resetError: this.resetError });
      }

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-rose-100 flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Something went wrong</h2>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
            </p>
            <div className="w-full flex gap-3">
              <button
                type="button"
                onClick={this.resetError}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
              >
                <RefreshCw size={14} /> Try again
              </button>
              <button
                type="button"
                onClick={() => { window.location.href = '/pos'; }}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
              >
                <Home size={14} /> POS Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
