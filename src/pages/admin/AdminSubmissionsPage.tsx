/** Danh sách ý kiến: lọc theo trạng thái/nhóm, tìm kiếm, phân trang */
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Loader2, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import SlaBadge from '../../components/admin/SlaBadge';
import { fetchSubmissions } from '../../services/adminService';
import { STATUS_META, CATEGORY_LABEL, formatDateTime } from '../../components/admin/statusMeta';

const STATUS_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'received', label: 'Chờ tiếp nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'resolved', label: 'Đã giải quyết' },
  { value: 'rejected', label: 'Từ chối' },
];

export default function AdminSubmissionsPage() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin-submissions', status, category, q, page],
    queryFn: () => fetchSubmissions({ status, category, q, page, limit: 15 }),
    placeholderData: keepPreviousData,
  });

  function applySearch() {
    setQ(searchInput.trim());
    setPage(1);
  }

  return (
    <AdminLayout>
      <h1 className="mb-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">Danh sách ý kiến</h1>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Tiếp nhận và xử lý ý kiến công dân gửi đến.</p>

      {/* Tab trạng thái */}
      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => { setStatus(t.value); setPage(1); }}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              status === t.value
                ? 'bg-primary-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Lọc nhóm + tìm kiếm */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Tất cả nhóm</option>
          <option value="to_giac">Tố giác tin báo</option>
          <option value="khieu_nai">Khiếu nại, tố cáo</option>
          <option value="phan_anh">Phản ánh, kiến nghị</option>
          <option value="de_xuat">Đề xuất, thắc mắc</option>
        </select>
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            className="w-full bg-transparent py-2 text-sm outline-none"
            placeholder="Tìm theo nội dung hoặc mã tra cứu..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applySearch()}
          />
          <button onClick={applySearch} className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white">Tìm</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>}

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải...</div>
      ) : data && data.data.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
            {data.data.map((s, i) => {
              const meta = STATUS_META[s.status];
              return (
                <Link
                  key={s.id}
                  to={`/quan-tri/y-kien/${s.id}`}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-primary-600 dark:text-primary-300">{s.tracking_code}</span>
                      {s.is_flagged ? <Flag className="h-3.5 w-3.5 text-rose-500" /> : null}
                  <SlaBadge sla={s.sla} daysLeft={s.daysLeft} compact />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-200">{s.ai_processed_content || s.original_content}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {s.sender_name} · {CATEGORY_LABEL[s.category_code || ''] || s.category_name} · {formatDateTime(s.created_at)}
                      {s.assigned_name ? ` · phụ trách: ${s.assigned_name}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta?.badge}`}>{meta?.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Phân trang */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Trang {data.page}/{data.totalPages} · Tổng {data.total} ý kiến
              {isFetching && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
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
      ) : (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-soft dark:bg-slate-900">
          Không có ý kiến nào phù hợp.
        </div>
      )}
    </AdminLayout>
  );
}
