/**
 * App gốc: bọc ErrorBoundary, React Query, Router; dựng layout Header/Footer,
 * hiệu ứng chuyển trang mượt mà và gắn các thành phần toàn cục (chat AI, toast).
 */
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/common/ErrorBoundary';
import AppToaster from './components/common/Toast';
import Header from './components/Layout/Header';
import Footer from './components/Layout/Footer';
import ChatWidget from './components/AIChat/ChatWidget';
import HomePage from './pages/HomePage';
import SendFeedbackPage from './pages/SendFeedbackPage';
import TrackingPage from './pages/TrackingPage';
import NewsPage from './pages/NewsPage';
import AboutPage from './pages/AboutPage';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import AdminSubmissionsPage from './pages/admin/AdminSubmissionsPage';
import AdminSubmissionDetailPage from './pages/admin/AdminSubmissionDetailPage';
import { AdminAuthProvider } from './hooks/useAdminAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

/** Tự động cuộn lên đầu trang mỗi khi chuyển route */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();

  // Khu vực cán bộ (đăng nhập + quản trị) có layout riêng, không dùng Header/Footer/Chat công khai
  const isAdminArea = location.pathname === '/dang-nhap' || location.pathname.startsWith('/quan-tri');

  if (isAdminArea) {
    return (
      <>
        <ScrollToTop />
        <Routes location={location}>
          <Route path="/dang-nhap" element={<AdminLoginPage />} />
          <Route path="/quan-tri" element={<AdminDashboardPage />} />
          <Route path="/quan-tri/y-kien" element={<AdminSubmissionsPage />} />
          <Route path="/quan-tri/y-kien/:id" element={<AdminSubmissionDetailPage />} />
        </Routes>
        <AppToaster />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        {/* Chuyển trang bằng CSS thuần: fade-in 0.18s chỉ dùng opacity — không tốn JS */}
        <div key={location.pathname} className="animate-page">
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/gui-y-kien" element={<SendFeedbackPage />} />
            <Route path="/tra-cuu" element={<TrackingPage />} />
            <Route path="/tin-tuc" element={<NewsPage />} />
            <Route path="/gioi-thieu" element={<AboutPage />} />
          </Routes>
        </div>
      </main>
      <Footer />
      <ChatWidget />
      <AppToaster />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AdminAuthProvider>
            <AppShell />
          </AdminAuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
