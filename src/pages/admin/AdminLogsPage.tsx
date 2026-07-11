/**
 * NHẬT KÝ HỆ THỐNG — ai làm gì, lúc nào, từ IP nào.
 * Quan trọng nhất: theo dõi lượt XEM DANH TÍNH người tố giác (chống lạm quyền).
 * Chỉ Quản trị viên / Cán bộ quản lý xem được.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Eye, ShieldAlert, LogIn, LogOut, UserPlus,
  RefreshCw, ScrollText, ChevronLeft, ChevronRight,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchLogs } from '../../services/adminService';

/** Diễn giải mã hành động sang tiếng Việt dễ hiểu */
const ACTION_META: Record<string, { label: string; cls: string; Icon: any }> = {
  reveal_identity: {
    label: 'XEM DANH TÍNH người gửi',
    cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    Icon: Eye,
  },
  update_status: {
    label: 'Đổi trạng thái xử lý',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    Icon: RefreshCw,
  },
  assign: {
    label: 'Phân công cán bộ',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    Icon: UserPlus,
  },
  login: {
    label: 'Đăng nhập',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    Icon: LogIn,
  },
  logout: {
    label: 'Đăng xuất',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    Icon: LogOut,
  },
};

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'reveal_identity', label: 'Xem danh tính' },
  { value: 'update_status', label: 'Đổi trạng thái' },
  { value: 'assign', label: 'Phân công' },
  { value: 'login', label: 'Đăng nhập' },
];

function fmt(dt: string) {
  return new Date(dt).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AdminLogsPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-logs', action, page],
    queryFn: () => fetchLogs({ action, page, limit: 30 }),
  });

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ScrollText className="h-5 w-5 text-primary-600" /> Nhật ký hệ thống
      </h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Mọi thao tác của cán bộ đều được ghi lại: ai làm, lúc nào, từ địa chỉ IP nào.
      </p>

      {/* Cảnh báo số lượt xem danh tính */}
      {data && data.revealCount30d > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/10">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
          <div>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {data.revealCount30d} lượt xem danh tính người gửi trong 30 ngày qua
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-rose-600/80 dark:text-rose-300/80">
              Danh tính người tố giác là thông tin nhạy cảm. Hãy rà soát xem các lượt xem này
              có đúng mục đích công vụ hay không.
            </p>
          </div>
        </div>
      )}

      {/* Bộ lọc */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setAction(f.value); setPage(1); }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              action === f.value
                ? 'bg-primary-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải nhật ký...
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {(error as Error).message}
        </div>
      )}

      {data && data.data.length === 0 && (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
          Chưa có hoạt động nào được ghi nhận.
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
            {data.data.map((log, i) => {
              const meta = ACTION_META[log.action] || {
                label: log.action,
                cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                Icon: ScrollText,
              };
              return (
                <div
                  key={log.id}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                    i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
                  } ${log.action === 'reveal_identity' ? 'bg-rose-50/40 dark:bg-rose-900/5' : ''}`}
                >
                  <span className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.cls}`}>
                    <meta.Icon className="h-3 w-3" /> {meta.label}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {log.staff_name || 'Không rõ'}
                      {log.tracking_code && (
                        <>
                          {' · '}
                          <Link
                            to={`/quan-tri/y-kien/${log.target_id}`}
                            className="font-mono text-primary-600 hover:underline dark:text-primary-300"
                          >
                            {log.tracking_code}
                          </Link>
                        </>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {fmt(log.created_at)}
                      {log.ip_address ? ` · IP ${log.ip_address}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Phân trang */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Trang {data.page}/{data.totalPages} · Tổng {data.total} hoạt động
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
              >
                <ChevronLeft className="h-4 w-4" /> Trước
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-soft disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
              >
                Sau <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
