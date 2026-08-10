/** Trang tổng quan: thẻ thống kê + ý kiến gần đây */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Inbox, Clock3, CheckCircle2, XCircle, Loader2, TrendingUp, Users, Check,
         AlarmClock, CalendarClock, UserX, ChevronRight } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchDashboardStats, ackIncidentGroup } from '../../services/adminService';
import { STATUS_META, formatDateTime } from '../../components/admin/statusMeta';

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 30_000, // tự làm mới mỗi 30 giây
  });

  // Ẩn ngay trên giao diện khi bấm "Đã xem", không cần chờ vòng làm mới 30 giây
  const [daXemCucBo, setDaXemCucBo] = useState<Set<number>>(new Set());
  const nhomChuaXem = (data?.nhomTrungLap ?? []).filter((n) => !daXemCucBo.has(n.id));

  async function handleAckNhom(id: number) {
    setDaXemCucBo((cur) => new Set(cur).add(id));
    try {
      await ackIncidentGroup(id);
    } catch {
      // Lỗi mạng thì thôi, vòng làm mới 30s tự đồng bộ lại — không cần báo lỗi làm phiền cán bộ
    }
  }

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

          {/* Nhóm sự kiện trùng lặp — "nhiều người cùng báo 1 vụ việc" (xem duplicate.js) */}
          {nhomChuaXem.length > 0 && (
            <div className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-300">
                <Users size={16} /> Nghi cùng một sự việc — nhiều người cùng báo
              </h2>
              <div className="space-y-2">
                {nhomChuaXem.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 dark:bg-slate-900">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-700 dark:text-slate-200">{n.preview}...</p>
                      <p className="text-[11px] text-slate-400">
                        {n.ward_name ?? 'Không rõ địa bàn'} · {n.category_name ?? ''} · mã đầu tiên <span className="font-mono">{n.first_tracking_code}</span> · {formatDateTime(n.last_reported_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        {n.submission_count} người báo
                      </span>
                      <button
                        onClick={() => handleAckNhom(n.id)}
                        title="Đánh dấu đã xem"
                        className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-amber-700/80 dark:text-amber-400/80">
                Tự động gộp theo địa bàn + nhóm xử lý + nội dung gần giống trong vòng 30 phút. Vào từng ý kiến để xem đầy đủ trước khi xử lý.
              </p>
            </div>
          )}

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
          {/* ==================================================================
              BA CON SỐ ĐIỀU HÀNH

              Đặt NGAY DƯỚI hàng thống kê chính, trước mọi thứ khác. Đây là ba
              câu hỏi người chỉ huy cần trả lời đầu tiên mỗi sáng:
                · Có việc nào ĐÃ TRỄ chưa?         -> phải giải trình
                · Có việc nào SẮP TRỄ trong 3 ngày? -> còn kịp cứu
                · Có việc nào CHƯA AI NHẬN?        -> đang rơi vào khoảng trống

              Con số thứ ba hay bị bỏ quên nhất: đơn đã tiếp nhận nhưng chưa
              phân công thì không ai thấy mình có trách nhiệm, cứ nằm đó tới
              lúc quá hạn mới lộ ra.

              Số 0 thì hiện màu xám cho nhẹ mắt; khác 0 mới đổi màu cảnh báo —
              để cán bộ nhìn phát là biết hôm nay có việc hay không.

              BẤM VÀO LÀ MỞ THẲNG DANH SÁCH việc đó, không phải con số suông.
              Đặt ở CUỐI trang: hàng thống kê trên là bức tranh chung, khối này
              là danh sách việc phải làm — xem xong tổng thể rồi mới tới hành động.
              ================================================================== */}
          {data.dieuHanh && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { Icon: AlarmClock, nhan: 'Đã quá hạn', so: data.dieuHanh.qua_han,
                  mo: 'Cần giải trình', mau: 'bg-rose-600',
                  vien: 'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20',
                  to: '/quan-tri/y-kien?sla=overdue' },
                { Icon: CalendarClock, nhan: 'Sắp hết hạn', so: data.dieuHanh.sap_han,
                  mo: 'Còn dưới 3 ngày', mau: 'bg-amber-500',
                  vien: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
                  to: '/quan-tri/y-kien?sla=soon' },
                { Icon: UserX, nhan: 'Chưa phân công', so: data.dieuHanh.chua_phan_cong,
                  mo: 'Chưa ai phụ trách', mau: 'bg-slate-600',
                  vien: 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40',
                  to: '/quan-tri/y-kien?assigned=none' },
              ].map((m) => (
                <Link
                  key={m.nhan}
                  to={m.to}
                  className={
                    'flex items-center gap-3 rounded-2xl border-2 p-4 '
                    + (m.so > 0
                      ? m.vien
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900')
                    + ' transition hover:shadow-md hover:-translate-y-0.5'
                  }
                >
                  <span
                    className={
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white '
                      + (m.so > 0 ? m.mau : 'bg-slate-300 dark:bg-slate-700')
                    }
                  >
                    <m.Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-extrabold leading-none text-slate-800 dark:text-slate-100">
                      {m.so}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{m.nhan}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{m.mo}</p>
                  </div>
                  {/* Mũi tên báo bấm được — không có thì cán bộ tưởng chỉ là con số */}
                  <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-slate-400" />
                </Link>
              ))}
            </div>
          )}


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
