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
import ScrollProgress from './components/common/ScrollProgress';
import { AnimatePresence, motion } from 'framer-motion';
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
import AdminReportsPage from './pages/admin/AdminReportsPage';
import AdminMapPage from './pages/admin/AdminMapPage';
import AdminLogsPage from './pages/admin/AdminLogsPage';
import AdminReviewPage from './pages/admin/AdminReviewPage';
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

  // Ẩn chatbox AI ở khu vực cán bộ (chỉ dành cho công dân)
  const isAdminArea = location.pathname === '/dang-nhap' || location.pathname.startsWith('/quan-tri');

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <ScrollProgress />
      <ScrollToTop />
      <Header />
      <main className="flex-1">
        {/* Chuyển trang: mờ dần + trượt nhẹ lên. Mượt hơn hẳn fade CSS thô. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.21, 0.65, 0.36, 1] }}
          >
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/gui-y-kien" element={<SendFeedbackPage />} />
            <Route path="/tra-cuu" element={<TrackingPage />} />
            <Route path="/tin-tuc" element={<NewsPage />} />
            <Route path="/gioi-thieu" element={<AboutPage />} />

            {/* Khu vực cán bộ — nay nằm CHUNG một trang với khu công dân */}
            <Route path="/dang-nhap" element={<AdminLoginPage />} />
            <Route path="/quan-tri" element={<AdminDashboardPage />} />
            <Route path="/quan-tri/y-kien" element={<AdminSubmissionsPage />} />
            <Route path="/quan-tri/y-kien/:id" element={<AdminSubmissionDetailPage />} />
            <Route path="/quan-tri/bao-cao" element={<AdminReportsPage />} />
            <Route path="/quan-tri/ban-do" element={<AdminMapPage />} />
            <Route path="/quan-tri/nhat-ky" element={<AdminLogsPage />} />
            <Route path="/quan-tri/kiem-duyet" element={<AdminReviewPage />} />
          </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
      <Footer />
      {!isAdminArea && <ChatWidget />}
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
