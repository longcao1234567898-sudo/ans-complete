/**
 * KHUNG TRAO ĐỔI VỚI NGƯỜI GỬI Ý KIẾN — phía cán bộ
 * ============================================================================
 *
 * VÌ SAO CẦN:
 * Đơn ẩn danh không có số điện thoại. Cán bộ đọc thấy thiếu thông tin —
 * "đối tượng mặc áo màu gì", "khoảng mấy giờ", "xe biển số bao nhiêu" — trước
 * đây đành xếp lại. Nay hỏi thẳng qua kênh này.
 *
 * ⚠️ KÊNH NÀY KHÔNG LỘ DANH TÍNH.
 * Hệ thống chỉ lưu nội dung tin nhắn và bên gửi. Cán bộ trao đổi với người tố
 * giác mà vẫn không biết đó là ai — đúng tinh thần bảo vệ người tố cáo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Send, Lock, Loader2, ShieldCheck } from 'lucide-react';
import { fetchChatMessages, sendChatMessage } from '../../services/adminService';

interface Props {
  submissionId: number;
}

export default function AdminChatPanel({ submissionId }: Props) {
  const [soanThao, setSoanThao] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const cuoiRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-chat', submissionId],
    queryFn: () => fetchChatMessages(submissionId),
    /* Tự tải lại mỗi 20 giây. Không dùng kết nối thời gian thực vì máy chủ
       chạy gói miễn phí, mà trao đổi kiểu này cũng không cần tức thời. */
    refetchInterval: 20_000,
    retry: false,
  });

  const tin = data?.messages ?? [];
  const daDong = Boolean(data?.daDong);

  useEffect(() => {
    cuoiRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [tin.length]);

  const gui = useCallback(async () => {
    const nd = soanThao.trim();
    if (!nd || dangGui) return;
    setDangGui(true);
    setLoi('');
    try {
      await sendChatMessage(submissionId, nd);
      setSoanThao('');
      await refetch();
    } catch (e) {
      setLoi((e as Error).message || 'Không gửi được tin nhắn.');
    } finally {
      setDangGui(false);
    }
  }, [soanThao, dangGui, submissionId, refetch]);

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 bg-primary-50/60 px-4 py-3 dark:border-slate-800 dark:bg-primary-900/15">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <MessageSquare className="h-4 w-4 text-primary-600" />
          Trao đổi với người gửi
          {tin.length > 0 && (
            <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {tin.length}
            </span>
          )}
        </h3>
        {data?.isAnonymous && (
          <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <ShieldCheck className="h-3 w-3" />
            Ẩn danh
          </span>
        )}
      </div>

      <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-4">
        {isLoading && (
          <p className="py-4 text-center text-xs text-slate-500">Đang tải…</p>
        )}

        {!isLoading && tin.length === 0 && (
          <div className="py-4 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chưa có trao đổi nào.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Cán bộ có thể hỏi thêm để làm rõ vụ việc. Người gửi vào bằng mã tra cứu
              kèm mã PIN đã được cấp lúc gửi ý kiến.
            </p>
          </div>
        )}

        {tin.map((m) => {
          const cuaCanBo = m.sender_type === 'staff';
          return (
            <div key={m.id} className={cuaCanBo ? 'flex justify-end' : 'flex justify-start'}>
              <div
                className={
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed '
                  + (cuaCanBo
                    ? 'bg-primary-600 text-white'
                    : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')
                }
              >
                <p className={'mb-0.5 text-[10px] font-bold ' + (cuaCanBo ? 'text-white/80' : 'text-primary-700 dark:text-primary-300')}>
                  {cuaCanBo ? (m.staff_name || 'Cán bộ') : 'Người gửi'}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.message}</p>
                <p className={'mt-1 text-[10px] ' + (cuaCanBo ? 'text-white/70' : 'text-slate-500 dark:text-slate-400')}>
                  {new Date(m.created_at).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={cuoiRef} />
      </div>

      {/* Hồ sơ đã đóng thì khoá ô nhập ở CẢ HAI phía — nếu chỉ khoá một bên
          thì bên kia nhắn vào khoảng không. Chặn thật nằm ở máy chủ (403). */}
      {daDong ? (
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/50">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <b>Kênh trao đổi đã đóng</b> do hồ sơ đã giải quyết xong hoặc bị từ chối.
            Muốn trao đổi tiếp, cần chuyển hồ sơ về trạng thái <b>Đang xử lý</b>.
          </p>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          {loi && <p className="mb-2 text-xs font-medium text-rose-600 dark:text-rose-400">{loi}</p>}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              maxLength={1000}
              className="flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Hỏi thêm thông tin để làm rõ vụ việc…"
              value={soanThao}
              onChange={(e) => setSoanThao(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gui(); }
              }}
            />
            <button
              type="button"
              onClick={gui}
              disabled={dangGui || !soanThao.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:opacity-50"
              aria-label="Gửi tin nhắn"
            >
              {dangGui ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            Mọi tin nhắn đều được ghi nhật ký. Kênh này không hiển thị danh tính người gửi.
          </p>
        </div>
      )}
    </section>
  );
}
