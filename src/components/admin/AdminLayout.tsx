/**
 * Khung khu vực CÁN BỘ — nằm TRONG cùng một trang với khu công dân
 * (dùng chung Header + Footer, không còn tách rời như trước).
 * Chỉ thêm một thanh điều hướng phụ + thông tin cán bộ đang đăng nhập.
 */
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

function roleLabel(role: string) {
  if (role === 'admin') return 'Quản trị viên';
  if (role === 'manager') return 'Cán bộ quản lý';
  return 'Cán bộ xử lý';
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { staff, logout } = useAdminAuth();
  const location = useLocation();

  // Chưa đăng nhập -> chuyển sang trang đăng nhập
  if (!staff) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname }} />;

  return (
    <div className="container-page py-6">
      {/* Dải nhận diện khu vực cán bộ */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-primary-700 to-primary-600 px-5 py-3.5 text-white shadow-soft">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold leading-tight">Khu vực cán bộ</p>
            <p className="text-[11px] text-white/80">Mọi thao tác đều được ghi nhật ký</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs sm:block">
            <span className="block font-semibold">{staff.name}</span>
            <span className="block text-white/75">{roleLabel(staff.role)}</span>
          </span>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold transition hover:bg-white/25"
          >
            <LogOut className="h-4 w-4" /> Đăng xuất
          </button>
        </div>
      </div>

      {/* Thanh điều hướng khu quản trị */}
      <nav className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-soft dark:bg-slate-900">
        {NAV.map(({ to, label, Icon, exact }) => {
          const active = exact ? location.pathname === to : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-primary-600 text-white shadow-soft'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
