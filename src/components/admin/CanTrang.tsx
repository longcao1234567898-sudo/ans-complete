/**
 * LỚP CANH ĐƯỜNG DẪN KHU CÁN BỘ — bọc mọi route /quan-tri ở App.tsx (ND-046).
 *
 * Mỗi trang cán bộ tự bọc AdminLayout, nên hook gọi API của trang chạy ngay khi
 * trang dựng — TRƯỚC khi AdminLayout biết phiên đã khôi phục xong hay vai trò là
 * gì. Hậu quả: cán bộ gõ thẳng đường dẫn trang chỉ lãnh đạo thấy khung trang,
 * nút "Xuất Excel", rồi mới báo không có quyền; tải lại trang nào cũng bắn một
 * loạt yêu cầu chưa có token (401) rồi mới gửi lại.
 *
 * Lớp này quyết TRƯỚC khi trang dựng: chờ khôi phục phiên, chưa đăng nhập thì
 * về /dang-nhap (giữ chỗ đang làm), sai vai trò thì báo rõ — trang không dựng
 * nên không gọi API nào.
 *
 * ⚠️ Không phải lớp bảo vệ (luật 2): chặn thật vẫn ở máy chủ.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { duocVaoTrang } from '../../utils/quyenTrang';
import AdminLayout from './AdminLayout';

export default function CanTrang({ children }: { children: ReactNode }) {
  const { staff, loading } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        Đang kiểm tra phiên đăng nhập…
      </div>
    );
  }
  if (!staff) return <Navigate to="/dang-nhap" replace state={{ from: location.pathname + location.search }} />;

  if (!duocVaoTrang(location.pathname, staff.role)) {
    return (
      <AdminLayout>
        <div className="rounded-2xl bg-white p-6 text-center shadow-soft dark:bg-slate-900">
          <Lock className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <p className="font-bold text-slate-800 dark:text-slate-100">Trang này chỉ dành cho lãnh đạo</p>
          <p className="mt-1 text-sm text-slate-500">
            Tài khoản cán bộ không mở được trang này. Cần xem thông tin ở đây thì báo lãnh đạo đơn vị.
          </p>
        </div>
      </AdminLayout>
    );
  }
  return <>{children}</>;
}
