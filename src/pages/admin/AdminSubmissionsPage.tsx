/** Danh sách ý kiến: lọc theo trạng thái/nhóm, tìm kiếm, phân trang */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Loader2, ChevronLeft, ChevronRight, Flag, Filter} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import SlaBadge from '../../components/admin/SlaBadge';
import { fetchSubmissions } from '../../services/adminService';
import { STATUS_META, CATEGORY_LABEL, formatDateTime } from '../../components/admin/statusMeta';

/* THẺ LỌC TRẠNG THÁI
   Thẻ đầu là MẶC ĐỊNH và chỉ hiện việc CHƯA XONG — hồ sơ đã giải quyết
   hoặc từ chối được ẩn đi để không làm loãng danh sách việc cần làm.
   Muốn xem hồ sơ đã đóng thì bấm đúng thẻ đó, hoặc bấm "Tất cả" ở cuối.

   Nhãn phải nói ĐÚNG những gì đang hiện: gọi "Tất cả" mà lại ẩn bớt
   thì cán bộ tưởng mất dữ liệu. */
const STATUS_TABS = [
  { value: '', label: 'Cần xử lý' },
  { value: 'all', label: 'Tất cả' },
  { value: 'received', label: 'Chờ tiếp nhận' },
  { value: 'processing', label: 'Đang xử lý' },
  { value: 'resolved', label: 'Đã giải quyết' },
  { value: 'rejected', label: 'Từ chối' },
];

/* Ba mức khẩn cấp — khớp với cột `urgency` trong database.
   Việc gấp luôn nổi lên đầu danh sách nhờ ORDER BY FIELD ở backend,
   nhưng cán bộ vẫn cần lọc riêng để xử lý dứt điểm từng nhóm. */
const URGENCY_TABS = [
  { value: '',          label: 'Tất cả',      dot: '',            activeClass: 'bg-primary-600 text-white' },
  { value: 'urgent',    label: 'Khẩn cấp',    dot: 'bg-red-500',  activeClass: 'bg-red-600 text-white' },
  { value: 'important', label: 'Quan trọng',  dot: 'bg-amber-500',activeClass: 'bg-amber-600 text-white' },
  { value: 'normal',    label: 'Bình thường', dot: 'bg-slate-400',activeClass: 'bg-slate-600 text-white' },
];

export default function AdminSubmissionsPage() {
  /* Đọc tham số trên đường dẫn để các ô cảnh báo ở Tổng quan
     bấm vào là lọc sẵn: ?sla=overdue, ?sla=near, ?assigned=none */
  const [searchParams] = useSearchParams();
  const sla = searchParams.get('sla') || '';
  const assigned = searchParams.get('assigned') || '';

  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState('');   // '' | 'urgent' | 'important' | 'normal'
  const [q, setQ] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin-submissions', status, category, urgency, sla, assigned, q, page],
    queryFn: () => fetchSubmissions({ status, category, urgency, sla, assigned, q, page, limit: 15 }),
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

      {/* Dải báo khi đang lọc từ ô cảnh báo ở Tổng quan bấm sang */}
      {(sla || assigned) && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary-50 px-4 py-2.5 text-sm dark:bg-primary-900/20">
          <Filter className="h-4 w-4 shrink-0 text-primary-600" />
          <span className="flex-1 text-primary-800 dark:text-primary-200">
            Đang xem:{' '}
            <b>
              {sla === 'overdue' && 'Ý kiến đã quá hạn xử lý'}
              {sla === 'near' && 'Ý kiến sắp đến hạn (còn dưới 3 ngày)'}
              {assigned === 'none' && 'Ý kiến chưa phân công cán bộ'}
            </b>
          </span>
          <a
            href="/quan-tri/y-kien"
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 transition hover:bg-primary-100 dark:text-primary-300"
          >
            Bỏ lọc
          </a>
        </div>
      )}

      {/* LỌC THEO MỨC KHẨN CẤP — 3 mức + Tất cả */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Mức độ
        </span>
        {URGENCY_TABS.map((u) => (
          <button
            key={u.value}
            onClick={() => { setUrgency(u.value); setPage(1); }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              urgency === u.value
                ? u.activeClass
                : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            {u.dot && <span className={`h-2 w-2 rounded-full ${u.dot}`} />}
            {u.label}
          </button>
        ))}
      </div>

      {/* Lọc nhóm + tìm kiếm */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Tất cả nhóm</option>
          <option value="to_giac">Tố giác tin báo</option>
          <option value="khieu_nai">Khiếu nại, tố cáo</option>
          <option value="phan_anh">Phản ánh, kiến nghị</option>
          <option value="de_xuat">Đề xuất, thắc mắc</option>
        </select>
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            className="w-full bg-transparent py-2 text-base sm:text-sm outline-none"
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
                      {s.urgency === 'urgent' && (
                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          🔴 KHẨN CẤP
                        </span>
                      )}
                      {s.urgency === 'important' && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          🟡 Quan trọng
                        </span>
                      )}
                      {s.is_flagged ? <Flag className="h-3.5 w-3.5 text-rose-500" /> : null}
                  <SlaBadge sla={s.sla} daysLeft={s.daysLeft} compact />
                    </div>
                    <p className="mt-0.5 truncate text-sm text-slate-700 dark:text-slate-200">{s.ai_processed_content || s.original_content}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
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
            <p className="text-xs text-slate-500">
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
        <div className="rounded-2xl bg-white p-10 text-center shadow-soft dark:bg-slate-900">
          {/* Danh sách rỗng ở chế độ MẶC ĐỊNH là TIN VUI — hết việc tồn.
              Không nên báo giống như lỗi hay như tìm không ra. */}
          {!status && !category && !urgency && !q && !sla ? (
            <>
              <p className="text-3xl">✅</p>
              <p className="mt-2 font-semibold text-slate-700 dark:text-slate-200">
                Không còn ý kiến nào chờ xử lý
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Hồ sơ đã giải quyết và từ chối nằm ở thẻ riêng phía trên.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Không có ý kiến nào phù hợp với bộ lọc.</p>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
