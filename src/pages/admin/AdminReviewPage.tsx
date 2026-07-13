/**
 * HÀNG CHỜ KIỂM DUYỆT — sàng lọc tin báo ẨN DANH trước khi vào quy trình xử lý.
 *
 * VÌ SAO: ẩn danh không có SĐT/email để chặn -> kẻ xấu có thể đổi IP mà spam.
 * Giải pháp: tin ẩn danh vào hàng chờ riêng, cán bộ liếc qua rồi Duyệt hoặc Xoá rác.
 * Tin rác KHÔNG BAO GIỜ lọt vào danh sách xử lý chính.
 *
 * Đây cũng là cách các cơ quan thật sàng lọc tin báo nặc danh.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, ShieldQuestion, Check, Trash2, Clock, MapPin, Inbox,
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-review-queue'],
    queryFn: () => fetchSubmissions({ status: 'pending_review', page: 1, limit: 50 }),
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'spam' }) =>
      reviewSubmission(id, action),
    onSuccess: (r) => {
      setMsg(r.message);
      qc.invalidateQueries({ queryKey: ['admin-review-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (e: Error) => setMsg(e.message),
    onSettled: () => setBusyId(null),
  });

  function act(id: number, action: 'approve' | 'spam') {
    setBusyId(id);
    setMsg('');
    mutation.mutate({ id, action });
  }

  const items = data?.data ?? [];

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ShieldQuestion className="h-5 w-5 text-amber-600" /> Hàng chờ kiểm duyệt
      </h1>
      <p className="mb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Tin báo <b>ẩn danh</b> được đưa vào đây để sàng lọc trước. Cán bộ đọc qua rồi
        <b> Duyệt</b> (đưa vào xử lý) hoặc <b>Đánh dấu tin rác</b>. Tin rác không lọt vào danh sách chính.
      </p>

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
          <p className="mt-1 text-xs text-slate-400">Hàng chờ đang sạch.</p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((s) => (
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
              <span className="flex items-center gap-1 text-slate-400">
                <Clock className="h-3 w-3" /> {timeAgo(s.created_at)}
              </span>
              {s.ward_name && (
                <span className="flex items-center gap-1 text-slate-400">
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
