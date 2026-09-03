/**
 * HÀNG CHỜ KIỂM DUYỆT — sàng lọc tin báo ẨN DANH trước khi vào quy trình xử lý.
 *
 * VÌ SAO: ẩn danh không có SĐT/email để chặn -> kẻ xấu có thể đổi IP mà spam.
 * Giải pháp: tin ẩn danh vào hàng chờ riêng, cán bộ liếc qua rồi Duyệt hoặc Xoá rác.
 * Tin rác KHÔNG BAO GIỜ lọt vào danh sách xử lý chính.
 *
 * Đây cũng là cách các cơ quan thật sàng lọc tin báo nặc danh.
 */
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, ShieldQuestion, Check, Trash2, Clock, MapPin, Inbox,
  Search,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchSubmissions, reviewSubmission } from '../../services/adminService';

function timeAgo(dt: string) {
  const h = Math.floor((Date.now() - new Date(dt).getTime()) / 3600000);
  if (h < 1) return 'Vừa gửi';
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export default function AdminReviewPage() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [tuKhoa, setTuKhoa] = useState('');

  /* ---------------------------------------------------------------------
     CHỐT CHỐNG BẤM HAI LẦN

     Nút có disabled={busyId === s.id}, nhưng setBusyId là hàm ĐẶT TRẠNG THÁI
     — chỉ có hiệu lực ở lần vẽ lại tiếp theo. Bấm nhanh hai cái liên tiếp thì
     cả hai lần bấm đều lọt qua trước khi nút kịp mờ đi.

     Lần gửi thứ hai gặp ý kiến đã rời hàng chờ, máy chủ trả về "Ý kiến này
     không nằm trong hàng chờ kiểm duyệt" — hiện ra như lỗi dù việc đầu đã
     thành công. Cán bộ tưởng hỏng, bấm tiếp, càng rối.

     useRef đổi giá trị NGAY LẬP TỨC, không chờ vẽ lại, nên chặn được.
     --------------------------------------------------------------------- */
  const dangGui = useRef<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-review-queue'],
    queryFn: () => fetchSubmissions({ status: 'pending_review', page: 1, limit: 50 }),
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'spam' }) =>
      reviewSubmission(id, action),

    /* -------------------------------------------------------------------
       BỎ THẺ KHỎI DANH SÁCH NGAY KHI BẤM (cập nhật lạc quan)

       Trước đây phải chờ máy chủ trả lời xong mới thấy thẻ biến mất. Trên
       gói máy chủ miễn phí, lần gọi đầu có thể chờ tới 50 giây — cán bộ
       tưởng bấm hụt nên bấm lại. Lần bấm thứ hai gặp ý kiến đã rời hàng chờ
       nên máy chủ trả về "Ý kiến này không nằm trong hàng chờ kiểm duyệt",
       hiện ra như một lỗi dù việc đầu đã thành công.

       Nay bỏ thẻ khỏi danh sách ngay lúc bấm. Nếu máy chủ báo lỗi thật thì
       trả thẻ về chỗ cũ ở onError.
       ------------------------------------------------------------------- */
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: ['admin-review-queue'] });
      const truoc = qc.getQueryData(['admin-review-queue']);
      qc.setQueryData(['admin-review-queue'], (cu: unknown) => {
        const d = cu as { data?: { id: number }[]; total?: number } | undefined;
        if (!d?.data) return cu;
        const conLai = d.data.filter((x) => x.id !== id);
        /* Trừ cả TỔNG SỐ, nếu không thì con số trên đầu trang vẫn đếm ý kiến
           vừa duyệt xong — cán bộ nhìn tưởng chưa ăn. */
        return { ...d, data: conLai, total: Math.max(0, (d.total ?? conLai.length + 1) - 1) };
      });
      return { truoc };
    },

    onSuccess: (r) => {
      setMsg(r.message);
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },

    onError: (e: Error, _bien, ctx) => {
      /* Ý kiến đã rời hàng chờ = việc ĐÃ XONG, không phải lỗi.
         Xảy ra khi cán bộ khác vừa duyệt cùng lúc, hoặc chính mình bấm hai
         lần. Giữ nguyên thẻ đã bỏ, chỉ báo nhẹ nhàng — hiện chữ đỏ "lỗi"
         trong tình huống này chỉ làm cán bộ hoang mang. */
      if (/không nằm trong hàng chờ/i.test(e.message)) {
        setMsg('Ý kiến này đã được xử lý (có thể cán bộ khác vừa duyệt).');
        return;
      }
      /* Lỗi thật: trả thẻ về chỗ cũ để cán bộ thử lại */
      if (ctx?.truoc !== undefined) qc.setQueryData(['admin-review-queue'], ctx.truoc);
      setMsg(e.message);
    },

    onSettled: (_kq, _loi, bien) => {
      dangGui.current.delete(bien.id);
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ['admin-review-queue'] });
    },
  });

  function act(id: number, action: 'approve' | 'spam') {
    /* Chặn ngay, không chờ vẽ lại */
    if (dangGui.current.has(id)) return;
    /* Đánh dấu tin rác là việc KHÓ LÙI: ý kiến vào thùng rác, chỉ giữ 7 ngày.
       Hỏi lại một câu trước khi làm. Nút "Duyệt" thì không hỏi vì duyệt nhầm
       chỉ tốn công xử lý thêm, không mất dữ liệu. */
    if (action === 'spam') {
      const dongY = window.confirm(
        'Đánh dấu tin rác sẽ đưa ý kiến này vào Thùng rác và chỉ giữ 7 ngày.\n\n'
        + 'Bà con gửi tố giác ẩn danh thường viết ngắn và thiếu chi tiết — '
        + 'nếu chưa chắc, nên bấm Duyệt để cán bộ xác minh thay vì loại bỏ.\n\n'
        + 'Vẫn muốn đánh dấu tin rác?'
      );
      if (!dongY) return;
    }
    dangGui.current.add(id);
    setBusyId(id);
    setMsg('');
    mutation.mutate({ id, action });
  }

  const items = data?.data ?? [];

  /* TÌM KIẾM trong hàng chờ. Khi có vài chục tin chờ duyệt, cán bộ cần tìm
     nhanh một tin cụ thể — nhất là khi bà con gọi lên hỏi "sao tin tôi chưa
     thấy đâu". Tìm theo cả mã tra cứu lẫn nội dung, không phân biệt hoa thường. */
  const q = tuKhoa.trim().toLowerCase();
  const dsHien = q
    ? items.filter((s) =>
        (s.tracking_code || '').toLowerCase().includes(q) ||
        (s.ai_processed_content || s.original_content || '').toLowerCase().includes(q))
    : items;

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ShieldQuestion className="h-5 w-5 text-amber-600" /> Hàng chờ kiểm duyệt
      </h1>
      <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Tin báo <b>ẩn danh</b> được đưa vào đây để sàng lọc trước. Cán bộ đọc qua rồi
        <b> Duyệt</b> (chuyển sang danh sách xử lý) hoặc <b>Tin rác</b> (đưa vào thùng rác). Tin trong thùng rác được giữ <b>7 ngày</b>, lỡ bấm nhầm vẫn khôi phục được.
      </p>

      {/* Ô TÌM KIẾM — chỉ hiện khi có tin, khỏi chiếm chỗ lúc hàng chờ trống. */}
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
          <span className="shrink-0 text-xs text-slate-400">{dsHien.length}/{items.length}</span>
        </div>
      )}

      {msg && (
        <div className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
          {msg}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải hàng chờ...
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {(error as Error).message}
        </div>
      )}

      {data && items.length === 0 && (
        <div className="rounded-2xl bg-white p-12 text-center shadow-soft dark:bg-slate-900">
          <Inbox className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Không có tin báo nào chờ duyệt.
          </p>
          <p className="mt-1 text-xs text-slate-500">Hàng chờ đang sạch.</p>
        </div>
      )}

      <div className="space-y-4">
        {dsHien.map((s) => (
          <div
            key={s.id}
            className="rounded-2xl border-l-4 border-amber-400 bg-white p-5 shadow-soft dark:bg-slate-900"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-slate-800 px-2.5 py-1 font-mono font-bold text-white">
                {s.tracking_code}
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                🕶️ Ẩn danh
              </span>
              {s.category_name && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {s.category_name}
                </span>
              )}
              <span className="flex items-center gap-1 text-slate-500">
                <Clock className="h-3 w-3" /> {timeAgo(s.created_at)}
              </span>
              {s.ward_name && (
                <span className="flex items-center gap-1 text-slate-500">
                  <MapPin className="h-3 w-3" /> {s.ward_name}
                </span>
              )}
            </div>

            <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {s.ai_processed_content || s.original_content}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => act(s.id, 'approve')}
                disabled={busyId === s.id}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Duyệt — đưa vào xử lý
              </button>

              <button
                onClick={() => act(s.id, 'spam')}
                disabled={busyId === s.id}
                className="flex items-center gap-1.5 rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-900/20"
              >
                <Trash2 className="h-4 w-4" /> Tin rác
              </button>

              <Link
                to={`/quan-tri/y-kien/${s.id}`}
                className="ml-auto text-xs font-semibold text-primary-600 hover:underline dark:text-primary-300"
              >
                Xem chi tiết →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {items.length > 0 && (
        <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          <b>Lưu ý:</b> tin báo ẩn danh không có danh tính người gửi nên cán bộ không thể liên hệ
          hỏi thêm. Hãy đọc kỹ nội dung — nếu có thông tin cụ thể (thời gian, địa điểm, đối tượng)
          thì nên duyệt để xác minh, dù chưa rõ người báo là ai.
        </p>
      )}
    </AdminLayout>
  );
}
