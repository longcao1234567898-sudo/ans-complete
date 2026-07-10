/**
 * Error boundary bọc toàn ứng dụng: bắt lỗi render và hiển thị màn hình dự phòng.
 */
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Có thể gửi lỗi lên hệ thống giám sát tại đây
    console.error('ErrorBoundary bắt được lỗi:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-950">
          <AlertTriangle className="h-12 w-12 text-accent-500" />
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Đã xảy ra lỗi không mong muốn</h1>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            Vui lòng tải lại trang. Nếu lỗi tiếp diễn, liên hệ đơn vị quản trị hệ thống.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Tải lại trang
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
