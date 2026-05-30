import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-5 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-danger-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-content-primary mb-2">
              {this.props.fallbackTitle || 'حدث خطأ غير متوقع'}
            </h2>
            <p className="text-sm text-content-secondary max-w-sm">
              {this.state.error?.message || 'فشل تحميل هذه الصفحة. يرجى المحاولة مرة أخرى.'}
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <RefreshCw size={14} />
            إعادة المحاولة
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
