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
import ChatWidget from './components/AIChat/ChatWidget';
import EmergencyButton from './components/common/EmergencyButton';
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
import AdminQRPage from './pages/admin/AdminQRPage';
import AdminKioskPage from './pages/admin/AdminKioskPage';
import AdminTrashPage from './pages/admin/AdminTrashPage';
import PrivacyPage from './pages/PrivacyPage';
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
      {/* relative z-10: nội dung + footer phải nổi TRÊN lớp nền ảnh
          (PageBackground dùng fixed inset-0 -z-10 phủ toàn màn hình) */}
      <main className="relative z-10 flex-1">
        {/* ⚠️ KHÔNG dùng transform (translateY/scale) để chuyển trang!
            Phần tử có transform trở thành KHUNG THAM CHIẾU MỚI cho position:fixed
            -> PageBackground (nền ảnh An Giang, dùng fixed inset-0) sẽ MẤT HẾT.
            Chỉ dùng opacity: vẫn mượt, mà nền ảnh giữ nguyên. */}
        <div key={location.pathname} className="animate-page">
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/gui-y-kien" element={<SendFeedbackPage />} />
            <Route path="/tra-cuu" element={<TrackingPage />} />
            <Route path="/tin-tuc" element={<NewsPage />} />
            <Route path="/gioi-thieu" element={<AboutPage />} />
            <Route path="/chinh-sach-bao-mat" element={<PrivacyPage />} />

            {/* Khu vực cán bộ — nay nằm CHUNG một trang với khu công dân */}
            <Route path="/dang-nhap" element={<AdminLoginPage />} />
            <Route path="/quan-tri" element={<AdminDashboardPage />} />
            <Route path="/quan-tri/y-kien" element={<AdminSubmissionsPage />} />
            <Route path="/quan-tri/y-kien/:id" element={<AdminSubmissionDetailPage />} />
            <Route path="/quan-tri/bao-cao" element={<AdminReportsPage />} />
            <Route path="/quan-tri/ban-do" element={<AdminMapPage />} />
            <Route path="/quan-tri/nhat-ky" element={<AdminLogsPage />} />
            <Route path="/quan-tri/kiem-duyet" element={<AdminReviewPage />} />
            <Route path="/quan-tri/ma-qr" element={<AdminQRPage />} />
            <Route path="/quan-tri/ki-ot" element={<AdminKioskPage />} />
            <Route path="/quan-tri/thung-rac" element={<AdminTrashPage />} />
          </Routes>
        </div>
      </main>
      <Footer />
      {!isAdminArea && <ChatWidget />}
      {!isAdminArea && <EmergencyButton />}
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
