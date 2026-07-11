/** Khung quản trị: chặn nếu chưa đăng nhập, có thanh trên cùng + nội dung */
import { ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Inbox, LogOut, ShieldCheck, BarChart3, Map } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const NAV = [
  { to: '/quan-tri', label: 'Tổng quan', Icon: LayoutDashboard, exact: true },
  { to: '/quan-tri/y-kien', label: 'Danh sách ý kiến', Icon: Inbox, exact: false },
  { to: '/quan-tri/bao-cao', label: 'Báo cáo', Icon: BarChart3, exact: false },
  { to: '/quan-tri/ban-do', label: 'Bản đồ điểm nóng', Icon: Map, exact: false },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { staff, logout } = useAdminAuth();
  const location = useLocation();

  // Chưa đăng nhập -> chuyển sang trang login
  if (!staff) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Thanh trên */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/quan-tri" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-sm font-extrabold leading-tight text-slate-800 dark:text-slate-100">
              Quản trị Hộp Thư An Ninh Số
              <span className="block text-[11px] font-normal text-slate-400">Công an thị xã Tân Châu</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs sm:block">
              <span className="block font-semibold text-slate-700 dark:text-slate-200">{staff.name}</span>
              <span className="block text-slate-400">{roleLabel(staff.role)}</span>
            </span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          </div>
        </div>

        {/* Menu ngang */}
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {NAV.map(({ to, label, Icon, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-primary-600 text-primary-600 dark:text-primary-300'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

function roleLabel(role: string): string {
  return role === 'admin' ? 'Quản trị viên' : role === 'manager' ? 'Cán bộ quản lý' : 'Cán bộ xử lý';
}
