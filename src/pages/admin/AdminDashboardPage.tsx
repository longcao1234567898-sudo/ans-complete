/** Trang tổng quan: thẻ thống kê + ý kiến gần đây */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Inbox, Clock3, CheckCircle2, XCircle, Loader2, TrendingUp } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchDashboardStats } from '../../services/adminService';
import { STATUS_META, formatDateTime } from '../../components/admin/statusMeta';

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30_000, // tự làm mới mỗi 30 giây
  });

  return (
    <AdminLayout>
      <h1 className="mb-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">Tổng quan</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Tình hình tiếp nhận và xử lý ý kiến công dân.</p>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải số liệu...</div>
      )}
      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>}

      {data && (
        <>
          {/* Thẻ số liệu */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard Icon={Inbox} label="Tổng ý kiến" value={data.overview.total_submissions} color="bg-secondary-100 text-secondary-600 dark:bg-secondary-500/20 dark:text-secondary-300" />
            <StatCard Icon={Clock3} label="Chờ tiếp nhận" value={data.overview.pending_count} color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" />
            <StatCard Icon={Loader2} label="Đang xử lý" value={data.overview.processing_count} color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" />
            <StatCard Icon={CheckCircle2} label="Đã giải quyết" value={data.overview.resolved_count} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard Icon={XCircle} label="Từ chối" value={data.overview.rejected_count} color="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300" />
            <StatCard Icon={TrendingUp} label="Hôm nay" value={data.overview.today_count} color="bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300" />
          </div>

          {/* Thống kê theo nhóm */}
          <h2 className="mb-3 mt-8 text-base font-bold text-slate-800 dark:text-slate-100">Theo nhóm phân loại</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.byCategory.map((c) => (
              <div key={c.code} className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.name}</p>
                <p className="mt-1 text-2xl font-extrabold text-primary-600 dark:text-primary-300">{c.total_count}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {c.processing_count} đang xử lý · {c.resolved_count} đã xong
                </p>
              </div>
            ))}
          </div>

          {/* Ý kiến gần đây */}
          <div className="mb-3 mt-8 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Ý kiến gần đây</h2>
            <Link to="/quan-tri/y-kien" className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-300">Xem tất cả →</Link>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
            {data.recent.map((r, i) => {
              const meta = STATUS_META[r.status];
              return (
                <div key={r.tracking_code + i} className={`flex items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      <span className="font-mono text-primary-600 dark:text-primary-300">{r.tracking_code}</span> · {r.sender_name}
                    </p>
                    <p className="text-[11px] text-slate-400">{r.category_name} · {formatDateTime(r.created_at)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta?.badge}`}>{meta?.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function StatCard({ Icon, label, value, color }: { Icon: typeof Inbox; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-2xl font-extrabold leading-none text-slate-800 dark:text-slate-100">{value}</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">{label}</p>
      </div>
    </div>
  );
}
