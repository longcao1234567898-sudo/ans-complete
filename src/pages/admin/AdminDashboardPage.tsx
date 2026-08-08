/** Trang tổng quan: thẻ thống kê + ý kiến gần đây */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Inbox, Clock3, CheckCircle2, XCircle, Loader2, TrendingUp, AlertTriangle, UserX, Users, Check } from 'lucide-react';
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
          {/* ===== SỐ LIỆU TỔNG QUAN =====
              Gộp 6 thẻ vào MỘT lưới thay vì chia 4+2 lệch như trước.
              Điện thoại 2 cột, máy tính bảng 3, màn lớn 6 — luôn cân đối.
              Đây là số liệu THAM KHẢO, nên để gọn; phần việc cần làm
              nằm ngay dưới mới là thứ cán bộ cần nhìn trước. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard Icon={Inbox} label="Tổng ý kiến" value={data.overview.total_submissions} color="bg-secondary-100 text-secondary-600 dark:bg-secondary-500/20 dark:text-secondary-300" />
            <StatCard Icon={Clock3} label="Chờ tiếp nhận" value={data.overview.pending_count} color="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" />
            <StatCard Icon={Loader2} label="Đang xử lý" value={data.overview.processing_count} color="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300" />
            <StatCard Icon={CheckCircle2} label="Đã giải quyết" value={data.overview.resolved_count} color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300" />
            <StatCard Icon={XCircle} label="Từ chối" value={data.overview.rejected_count} color="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300" />
            <StatCard Icon={TrendingUp} label="Hôm nay" value={data.overview.today_count} color="bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300" />
          </div>

          {/* ═══ Ô CẢNH BÁO VIỆC CẦN XỬ LÝ GẤP ═══
              Đặt ngay dưới số liệu tổng quan để cán bộ mở dashboard là thấy đầu tiên.
              Bấm vào là nhảy thẳng sang danh sách đã lọc sẵn. */}
          {data.sla && (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {/* QUÁ HẠN — đỏ, nghiêm trọng nhất */}
              <Link
                to="/quan-tri/y-kien?sla=overdue"
                className={`group rounded-2xl border-2 p-4 transition hover:shadow-soft ${
                  Number(data.sla.overdue_count) > 0
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle
                    className={`h-5 w-5 ${
                      Number(data.sla.overdue_count) > 0 ? 'text-red-600' : 'text-slate-500'
                    }`}
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Đã quá hạn
                  </span>
                </div>
                <p
                  className={`mt-2 text-3xl font-extrabold ${
                    Number(data.sla.overdue_count) > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-500'
                  }`}
                >
                  {data.sla.overdue_count ?? 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {Number(data.sla.overdue_count) > 0
                    ? 'Cần xử lý ngay — bấm để xem'
                    : 'Không có việc nào quá hạn'}
                </p>
              </Link>

              {/* SẮP HẠN — vàng */}
              <Link
                to="/quan-tri/y-kien?sla=near"
                className={`group rounded-2xl border-2 p-4 transition hover:shadow-soft ${
                  Number(data.sla.near_due_count) > 0
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
                    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Clock3
                    className={`h-5 w-5 ${
                      Number(data.sla.near_due_count) > 0 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Sắp đến hạn
                  </span>
                </div>
                <p
                  className={`mt-2 text-3xl font-extrabold ${
                    Number(data.sla.near_due_count) > 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500'
                  }`}
                >
                  {data.sla.near_due_count ?? 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Còn dưới 3 ngày</p>
              </Link>

              {/* CHƯA PHÂN CÔNG */}
              <Link
                to="/quan-tri/y-kien?assigned=none"
                className="group rounded-2xl border-2 border-slate-200 bg-white p-4 transition hover:shadow-soft dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-center gap-2">
                  <UserX className="h-5 w-5 text-slate-500" />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    Chưa phân công
                  </span>
                </div>
                <p className="mt-2 text-3xl font-extrabold text-slate-600 dark:text-slate-300">
                  {data.sla.unassigned_count ?? 0}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">Chưa có cán bộ phụ trách</p>
              </Link>
            </div>
          )}

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
                      <p className="text-[11px] text-slate-500">
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
                        aria-label="Đánh dấu đã xem nhóm sự việc này"
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
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
          {/* ===== VIỆC CẦN GIẢI QUYẾT GẤP =====
              Hiện thẳng danh sách quá hạn và sắp hạn, không bắt bấm sang trang khác.
              Sắp xếp: khẩn cấp trước, rồi quá hạn lâu nhất. */}
          {Array.isArray(data.canGap) && data.canGap.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Việc cần giải quyết gấp
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  {data.canGap.length}
                </span>
              </h2>

              <div className="space-y-2">
                {data.canGap.map((v) => (
                  <Link
                    key={v.id}
                    to={`/quan-tri/y-kien/${v.id}`}
                    className={`block rounded-xl border-l-4 bg-white/80 p-3 backdrop-blur-sm transition hover:bg-white dark:bg-slate-800/80 dark:hover:bg-slate-800 ${
                      v.quaHan ? 'border-red-500' : 'border-amber-400'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                        {v.tracking_code}
                      </span>

                      {/* Huy hiệu mức khẩn cấp */}
                      {v.urgency === 'urgent' && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          KHẨN CẤP
                        </span>
                      )}
                      {v.urgency === 'important' && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          Quan trọng
                        </span>
                      )}

                      <span className="text-[11px] text-slate-500">{v.category_name}</span>

                      {/* Còn mấy ngày / quá hạn mấy ngày */}
                      <span
                        className={`ml-auto shrink-0 text-[11px] font-semibold ${
                          v.quaHan ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {v.quaHan ? `Quá hạn ${v.soNgay} ngày` : `Còn ${v.soNgay} ngày`}
                      </span>
                    </div>

                    <p className="line-clamp-1 text-sm text-slate-600 dark:text-slate-300">
                      {v.preview}
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      {v.assigned_name ? `Phụ trách: ${v.assigned_name}` : 'Chưa phân công'}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 className="mb-3 mt-8 text-base font-bold text-slate-800 dark:text-slate-100">Theo nhóm phân loại</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.byCategory.map((c) => (
              <div key={c.code} className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.name}</p>
                <p className="mt-1 text-2xl font-extrabold text-primary-600 dark:text-primary-300">{c.total_count}</p>
                <p className="mt-1 text-[11px] text-slate-500">
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
                    <p className="text-[11px] text-slate-500">{r.category_name} · {formatDateTime(r.created_at)}</p>
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
        <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
