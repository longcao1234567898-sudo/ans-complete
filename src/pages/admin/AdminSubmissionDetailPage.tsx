/** Chi tiết một ý kiến: thông tin đầy đủ, timeline, và bảng điều khiển đổi trạng thái */
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Phone, Mail, User, Clock, CheckCircle2, XCircle, PlayCircle } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchSubmissionDetail, updateSubmissionStatus } from '../../services/adminService';
import { STATUS_META, CATEGORY_LABEL, formatDateTime } from '../../components/admin/statusMeta';

export default function AdminSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const submissionId = Number(id);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-submission', submissionId],
    queryFn: () => fetchSubmissionDetail(submissionId),
    enabled: Number.isFinite(submissionId),
  });

  const [note, setNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: { status: string; note?: string; rejectionReason?: string }) =>
      updateSubmissionStatus(submissionId, payload),
    onSuccess: (res) => {
      setFeedback(res.message || 'Đã cập nhật.');
      setNote('');
      setRejectionReason('');
      qc.invalidateQueries({ queryKey: ['admin-submission', submissionId] });
      qc.invalidateQueries({ queryKey: ['admin-submissions'] });
      qc.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (e) => setFeedback((e as Error).message),
  });

  function changeStatus(status: string) {
    if (status === 'rejected' && !rejectionReason.trim()) {
      setFeedback('Vui lòng nhập lý do từ chối.');
      return;
    }
    mutation.mutate({ status, note: note.trim() || undefined, rejectionReason: rejectionReason.trim() || undefined });
  }

  return (
    <AdminLayout>
      <Link to="/quan-tri/y-kien" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-600">
        <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
      </Link>

      {isLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải...</div>}
      {error && <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>}

      {data && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Cột trái: nội dung + timeline */}
          <div className="space-y-5 lg:col-span-2">
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-lg font-extrabold text-primary-600 dark:text-primary-300">{data.tracking_code}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_META[data.status]?.badge}`}>{STATUS_META[data.status]?.label}</span>
              </div>
              <p className="text-xs font-semibold text-slate-400">Nhóm: {CATEGORY_LABEL[data.category_code || ''] || data.category_name}</p>

              <h3 className="mb-1 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Nội dung công dân gửi</h3>
              <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{data.original_content}</p>

              {data.ai_processed_content && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Nội dung AI chuẩn hoá</h3>
                  <p className="rounded-xl bg-primary-50 p-3 text-sm text-slate-700 dark:bg-primary-900/20 dark:text-slate-200">{data.ai_processed_content}</p>
                </>
              )}

              {data.rejection_reason && (
                <>
                  <h3 className="mb-1 mt-4 text-sm font-bold text-rose-600">Lý do từ chối</h3>
                  <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-900/20">{data.rejection_reason}</p>
                </>
              )}

              {data.images.length > 0 && (
                <>
                  <h3 className="mb-2 mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">Ảnh đính kèm ({data.images.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.images.map((img, i) => (
                      <img key={i} src={img.image_url} alt={`Ảnh ${i + 1}`} className="h-24 w-24 rounded-xl object-cover" />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Timeline */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-4 text-sm font-bold text-slate-700 dark:text-slate-200">Lịch sử xử lý</h3>
              <div className="space-y-4">
                {data.history.map((h, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`h-3 w-3 rounded-full ${STATUS_META[h.new_status]?.dot || 'bg-slate-400'}`} />
                      {i < data.history.length - 1 && <span className="mt-1 h-full w-px flex-1 bg-slate-200 dark:bg-slate-700" />}
                    </div>
                    <div className="pb-1">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{STATUS_META[h.new_status]?.label || h.new_status}</p>
                      <p className="text-[11px] text-slate-400">{formatDateTime(h.changed_at)}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</p>
                      {h.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{h.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cột phải: thông tin liên hệ + xử lý */}
          <div className="space-y-5">
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Thông tin người gửi</h3>
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><User className="h-4 w-4 text-slate-400" /> {data.sender_name}</p>
                <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone className="h-4 w-4 text-slate-400" /> {data.sender_phone}</p>
                {data.sender_email && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail className="h-4 w-4 text-slate-400" /> {data.sender_email}</p>}
                <p className="flex items-center gap-2 text-slate-400"><Clock className="h-4 w-4" /> {formatDateTime(data.created_at)}</p>
              </div>
            </div>

            {/* Bảng điều khiển xử lý */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 text-sm font-bold text-slate-700 dark:text-slate-200">Xử lý ý kiến</h3>

              <label className="mb-1 block text-xs font-semibold text-slate-500">Ghi chú (tuỳ chọn)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="VD: Đã cử lực lượng xuống hiện trường..."
                className="mb-3 w-full rounded-xl border border-slate-300 bg-white p-2.5 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800"
              />

              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => changeStatus('processing')} disabled={mutation.isPending} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                  <PlayCircle className="h-4 w-4" /> Đang xử lý
                </button>
                <button onClick={() => changeStatus('resolved')} disabled={mutation.isPending} className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle2 className="h-4 w-4" /> Giải quyết
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-rose-200 p-3 dark:border-rose-900/40">
                <label className="mb-1 block text-xs font-semibold text-rose-600">Lý do từ chối (bắt buộc khi từ chối)</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={2}
                  placeholder="VD: Không thuộc thẩm quyền Công an cấp xã..."
                  className="mb-2 w-full rounded-lg border border-rose-200 bg-white p-2 text-sm outline-none dark:border-rose-900/40 dark:bg-slate-800"
                />
                <button onClick={() => changeStatus('rejected')} disabled={mutation.isPending} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  <XCircle className="h-4 w-4" /> Từ chối
                </button>
              </div>

              {mutation.isPending && <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> Đang cập nhật...</p>}
              {feedback && !mutation.isPending && <p className="mt-3 text-xs font-semibold text-primary-600 dark:text-primary-300">{feedback}</p>}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
