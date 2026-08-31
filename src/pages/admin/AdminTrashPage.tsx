/**
 * TRANG THÙNG RÁC — tin đã bị đánh dấu "Tin rác".
 *
 * Tin được GIỮ 7 NGÀY, trong thời gian đó cán bộ khôi phục lại được.
 * Quá 7 ngày hệ thống tự xoá vĩnh viễn.
 *
 * Chỉ quản trị viên (admin) mới được xoá vĩnh viễn trước hạn —
 * tránh cán bộ thường xoá mất chứng cứ.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2, RotateCcw, Loader2, AlertTriangle, Clock, ShieldOff, Search, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../components/admin/AdminLayout';
import { adminFetch } from '../../services/adminService';
import { formatDateTime } from '../../components/admin/statusMeta';

interface TrashItem {
  id: number;
  tracking_code: string;
  preview: string;
  is_anonymous: boolean;
  created_at: string;
  deleted_at: string;
  deleted_by_name: string | null;
  category_name: string | null;
  daysLeft: number;
  /** Toàn văn để xem chi tiết ngay tại chỗ (máy chủ trả tối đa 5000 ký tự) */
  noiDungDayDu?: string;
  coBiCat?: boolean;
}

interface TrashResponse {
  items: TrashItem[];
  keepDays: number;
  autoDeleted: number;
}

export default function AdminTrashPage() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-trash'],
    queryFn: () => adminFetch<TrashResponse>('/api/admin/trash'),
    staleTime: 0,
  });

  /* ---------------------------------------------------------------------
     CHỐT CHỐNG BẤM HAI LẦN

     setBusyId là hàm ĐẶT TRẠNG THÁI — chỉ có hiệu lực ở lần vẽ lại tiếp theo.
     Bấm nhanh hai cái là cả hai lọt qua trước khi nút kịp mờ. Lần thứ hai gặp
     tin đã rời thùng rác -> máy chủ báo lỗi, cán bộ tưởng hỏng.

     useRef đổi giá trị NGAY, không chờ vẽ lại.
     --------------------------------------------------------------------- */
  const dangGui = useRef<Set<number>>(new Set());

  /* Bỏ một tin khỏi danh sách NGAY trên màn hình, không chờ máy chủ trả lời.
     Đây là thứ tạo cảm giác "mượt": bấm là thấy phản hồi tức thì. Trước đây
     phải chờ gọi máy chủ rồi tải lại cả danh sách nên nhìn như trang bị nạp
     lại từ đầu. */
  function boKhoiDanhSach(id: number) {
    qc.setQueryData(['admin-trash'], (cu: unknown) => {
      const d = cu as { items?: { id: number }[] } | undefined;
      if (!d?.items) return cu;
      return { ...d, items: d.items.filter((x) => x.id !== id) };
    });
  }

  const restore = useMutation({
    mutationFn: (id: number) => adminFetch(`/api/admin/trash/${id}/restore`, { method: 'POST' }),
    onMutate: (id: number) => {
      const truoc = qc.getQueryData(['admin-trash']);
      boKhoiDanhSach(id);            // bỏ NGAY, không chờ máy chủ
      return { truoc };
    },
    onSuccess: () => {
      toast.success('Đã khôi phục tin báo');
      qc.invalidateQueries({ queryKey: ['admin-trash'] });
      qc.invalidateQueries({ queryKey: ['admin-review'] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
    },
    onError: (e, _id, ctx) => {
      const msg = e instanceof Error ? e.message : '';
      /* Tin đã rời thùng rác = việc ĐÃ XONG (cán bộ khác vừa xử lý, hoặc mình
         bấm hai lần). Giữ nguyên việc đã bỏ, chỉ báo nhẹ. */
      if (/không tìm thấy|không nằm trong|đã được/i.test(msg)) {
        toast('Tin này đã được xử lý trước đó.', { icon: 'ℹ️' });
        return;
      }
      if (ctx?.truoc !== undefined) qc.setQueryData(['admin-trash'], ctx.truoc);
      toast.error(msg || 'Khôi phục thất bại');
    },
    onSettled: (_kq, _loi, id) => {
      dangGui.current.delete(id as number);
      setBusyId(null);
    },
  });

  const purge = useMutation({
    mutationFn: (id: number) => adminFetch(`/api/admin/trash/${id}`, { method: 'DELETE' }),
    onMutate: (id: number) => {
      const truoc = qc.getQueryData(['admin-trash']);
      boKhoiDanhSach(id);            // bỏ NGAY, không chờ máy chủ
      return { truoc };
    },
    onSuccess: () => {
      toast.success('Đã xoá vĩnh viễn');
      qc.invalidateQueries({ queryKey: ['admin-trash'] });
    },
    onError: (e, _id, ctx) => {
      const msg = e instanceof Error ? e.message : '';
      if (/không tìm thấy|không nằm trong|đã được/i.test(msg)) {
        toast('Tin này đã được xoá trước đó.', { icon: 'ℹ️' });
        return;
      }
      if (ctx?.truoc !== undefined) qc.setQueryData(['admin-trash'], ctx.truoc);
      toast.error(msg || 'Xoá thất bại');
    },
    onSettled: (_kq, _loi, id) => {
      dangGui.current.delete(id as number);
      setBusyId(null);
    },
  });

  const items = data?.items ?? [];

  /* TÌM KIẾM trong thùng rác. Khi có nhiều tin bị đánh dấu rác, cán bộ cần
     tìm nhanh một tin cụ thể để khôi phục — nhất là khi bà con gọi lên hỏi
     "sao tôi tra mã không thấy". Tìm theo cả mã tra cứu lẫn nội dung xem
     trước, không phân biệt hoa thường. */
  const [tuKhoa, setTuKhoa] = useState('');
  /* Tin nào đang mở xem chi tiết. Mở ngay tại chỗ thay vì chuyển sang trang
     chi tiết, vì tin trong thùng rác đã bị đánh dấu rác — trang chi tiết có
     thể không mở được. Xem tại đây rồi quyết định khôi phục hay xoá hẳn. */
  const [dangMo, setDangMo] = useState<number | null>(null);
  const dsHien = (() => {
    const q = tuKhoa.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.tracking_code.toLowerCase().includes(q) ||
        (it.preview || '').toLowerCase().includes(q) ||
        (it.category_name || '').toLowerCase().includes(q)
    );
  })();
  const keepDays = data?.keepDays ?? 7;

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <Trash2 className="h-5 w-5 text-slate-400" /> Thùng rác
      </h1>
      <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Tin đã đánh dấu "Tin rác" được giữ <b>{keepDays} ngày</b> trước khi xoá vĩnh viễn.
        Trong thời gian này cán bộ vẫn khôi phục lại được nếu bấm nhầm.
      </p>

      {data && data.autoDeleted > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Clock className="h-4 w-4 shrink-0" />
          Hệ thống vừa tự xoá vĩnh viễn <b>{data.autoDeleted}</b> tin quá {keepDays} ngày.
        </div>
      )}

      {/* Ô TÌM KIẾM — chỉ hiện khi có tin, khỏi chiếm chỗ lúc thùng rác trống. */}
      {items.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={tuKhoa}
            onChange={(e) => setTuKhoa(e.target.value)}
            placeholder="Tìm theo mã tra cứu hoặc nội dung..."
            className="min-h-[36px] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          {tuKhoa && (
            <button
              type="button"
              onClick={() => setTuKhoa('')}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Xoá
            </button>
          )}
          <span className="shrink-0 text-xs text-slate-400">
            {dsHien.length}/{items.length}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error instanceof Error ? error.message : 'Không tải được thùng rác.'}
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="rounded-2xl bg-white/80 py-16 text-center backdrop-blur-sm dark:bg-slate-800/80">
          <Trash2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Thùng rác trống</p>
          <p className="mt-1 text-xs text-slate-400">Chưa có tin nào bị đánh dấu là tin rác.</p>
        </div>
      )}

      {!isLoading && items.length > 0 && dsHien.length === 0 && (
        <div className="rounded-2xl bg-white/80 py-12 text-center backdrop-blur-sm dark:bg-slate-800/80">
          <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Không tìm thấy tin nào khớp "{tuKhoa}"
          </p>
        </div>
      )}

      <div className="space-y-3">
        {dsHien.map((it) => {
          const soon = it.daysLeft <= 2;
          return (
            <div
              key={it.id}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/90"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-500 dark:text-slate-400">
                  {it.tracking_code}
                </span>
                {it.is_anonymous && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    ẨN DANH
                  </span>
                )}
                {it.category_name && (
                  <span className="text-xs text-slate-400">{it.category_name}</span>
                )}
                <span
                  className={`ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    soon
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {it.daysLeft > 0 ? `Còn ${it.daysLeft} ngày` : 'Sắp bị xoá'}
                </span>
              </div>

              {dangMo === it.id ? (
                /* ĐANG MỞ — hiện toàn văn, giữ xuống dòng như bà con đã gõ. */
                <div className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                    {it.noiDungDayDu || it.preview}
                  </p>
                  {it.coBiCat && (
                    <p className="mt-2 text-xs italic text-slate-400">
                      Nội dung còn dài — khôi phục tin để đọc đầy đủ.
                    </p>
                  )}
                </div>
              ) : (
                <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {it.preview}
                </p>
              )}

              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <span>Bà con gửi: {formatDateTime(it.created_at)}</span>
                <span>Đưa vào thùng rác: {formatDateTime(it.deleted_at)}</span>
                {it.deleted_by_name && <span>Bởi: {it.deleted_by_name}</span>}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDangMo(dangMo === it.id ? null : it.id)}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition ${dangMo === it.id ? 'rotate-180' : ''}`} />
                  {dangMo === it.id ? 'Thu gọn' : 'Xem chi tiết'}
                </button>

                <button
                  onClick={() => {
                    if (dangGui.current.has(it.id)) return;   // chặn NGAY, không chờ vẽ lại
                    dangGui.current.add(it.id);
                    setBusyId(it.id);
                    restore.mutate(it.id);
                  }}
                  disabled={busyId === it.id}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {busyId === it.id && restore.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Khôi phục
                </button>

                <button
                  onClick={() => {
                    if (!confirm(`Xoá VĨNH VIỄN tin ${it.tracking_code}?\n\nKhông thể lấy lại được nữa.`)) return;
                    if (dangGui.current.has(it.id)) return;   // chặn NGAY
                    dangGui.current.add(it.id);
                    setBusyId(it.id);
                    purge.mutate(it.id);
                  }}
                  disabled={busyId === it.id}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-red-200 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <ShieldOff className="h-3.5 w-3.5" />
                  Xoá vĩnh viễn
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-900/15 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Tin khôi phục sẽ quay lại hàng chờ kiểm duyệt (với tin ẩn danh) hoặc danh sách xử lý.
            Chỉ quản trị viên mới được xoá vĩnh viễn trước hạn {keepDays} ngày.
          </span>
        </p>
      )}
    </AdminLayout>
  );
}
