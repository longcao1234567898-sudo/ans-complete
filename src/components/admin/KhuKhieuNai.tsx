/**
 * KhuKhieuNai — cán bộ xem và quyết định các khiếu nại mở khoá.
 *
 * MỌI vai trò cán bộ XEM được (để nắm tình hình và trả lời khi bà con gọi hỏi),
 * nhưng chỉ chỉ huy và quản trị mới QUYẾT ĐỊNH gỡ hay từ chối.
 *
 * ⚠️ Gỡ khoá là xoá THẬT khỏi danh sách chặn, không chỉ đổi trạng thái đơn.
 *    Máy chủ lo việc đó; ở đây chỉ cần nạp lại danh sách khoá sau khi gỡ để
 *    cán bộ thấy ngay kết quả.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquareWarning, Loader2, Check, X, Smartphone, Globe } from 'lucide-react';
import { fetchKhieuNai, xuLyKhieuNai } from '../../services/adminService';
import { useAdminAuth } from '../../hooks/useAdminAuth';

export default function KhuKhieuNai() {
  const qc = useQueryClient();
  const { staff } = useAdminAuth();
  const laLanhDao = staff?.role === 'admin' || staff?.role === 'manager';

  const [xemTatCa, setXemTatCa] = useState(false);
  const [dangMo, setDangMo] = useState<number | null>(null);
  const [ghiChu, setGhiChu] = useState('');
  const [thongBao, setThongBao] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-khieu-nai', xemTatCa],
    queryFn: () => fetchKhieuNai(xemTatCa),
  });

  const xuLy = useMutation({
    mutationFn: ({ id, quyetDinh }: { id: number; quyetDinh: 'go_khoa' | 'tu_choi' }) =>
      xuLyKhieuNai(id, quyetDinh, ghiChu),
    onSuccess: (r) => {
      setThongBao(r.message);
      setDangMo(null);
      setGhiChu('');
      qc.invalidateQueries({ queryKey: ['admin-khieu-nai'] });
      /* Gỡ khoá xong phải nạp lại danh sách khoá, nếu không cán bộ vẫn thấy
         thiết bị đó trong danh sách và tưởng gỡ chưa ăn. */
      qc.invalidateQueries({ queryKey: ['admin-blacklist'] });
    },
    onError: (e: Error) => setThongBao(e.message),
  });

  /* Bảng chưa tạo (chưa chạy nang_cap_v17.sql) -> ẩn hẳn khu này thay vì hiện
     một ô lỗi đỏ làm cán bộ tưởng hệ thống hỏng. */
  if (error) return null;

  const ds = data ?? [];
  const soChoXuLy = ds.filter((k) => k.status === 'cho_xu_ly').length;

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">
          <MessageSquareWarning className="h-5 w-5 text-amber-500" />
          Khiếu nại mở khoá
          {soChoXuLy > 0 && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
              {soChoXuLy} chờ xử lý
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={() => setXemTatCa((v) => !v)}
          className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {xemTatCa ? 'Chỉ xem đang chờ' : 'Xem cả đã xử lý'}
        </button>
      </div>

      <p className="mb-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Bà con bị khoá nhầm gửi khiếu nại về đây. Máy có thể khoá nhầm khi nhiều người
        dùng chung một điện thoại, hoặc nhà mạng cấp chung địa chỉ cho nhiều nhà.
      </p>

      {thongBao && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
          {thongBao}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {!isLoading && ds.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          {xemTatCa ? 'Chưa có khiếu nại nào.' : 'Không có khiếu nại nào đang chờ.'}
        </p>
      )}

      <div className="space-y-3">
        {ds.map((k) => (
          <div
            key={k.id}
            className={`rounded-2xl border-2 p-4 ${
              k.status === 'cho_xu_ly'
                ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/10'
                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
            }`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {k.kind === 'device' ? <Smartphone className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                {k.kind === 'device' ? 'Thiết bị' : 'Địa chỉ mạng'}
              </span>
              <span className="font-mono text-xs text-slate-500">
                {k.identifier.length > 20 ? k.identifier.slice(0, 20) + '…' : k.identifier}
              </span>
              {!k.con_bi_khoa && k.status === 'cho_xu_ly' && (
                <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  Khoá đã tự hết hạn
                </span>
              )}
              {k.status === 'da_go_khoa' && (
                <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Đã gỡ khoá
                </span>
              )}
              {k.status === 'tu_choi' && (
                <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  Đã từ chối
                </span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {new Date(k.created_at).toLocaleString('vi-VN')}
              </span>
            </div>

            <p className="whitespace-pre-wrap rounded-xl bg-white/70 p-3 text-sm leading-relaxed text-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              {k.content}
            </p>

            {/* Ý KIẾN BỊ ĐÁNH DẤU RÁC của chính thiết bị/địa chỉ này.

                Cán bộ cần thấy người này đã gửi gì mới quyết định được: toàn
                tin rác thật thì từ chối, tin báo nghiêm túc bị đánh nhầm thì
                gỡ khoá. Không có phần này thì quyết định mò. */}
            {k.tinLienQuan && k.tinLienQuan.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  {k.tinLienQuan.length} ý kiến bị đánh dấu rác từ {k.kind === 'device' ? 'máy' : 'địa chỉ'} này
                </p>
                <div className="space-y-2">
                  {k.tinLienQuan.map((t) => (
                    <div key={t.id} className="rounded-lg bg-white p-2 dark:bg-slate-900">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Link
                          to={`/quan-tri/y-kien/${t.id}`}
                          className="font-mono text-xs font-bold text-primary-600 hover:underline dark:text-primary-400"
                        >
                          {t.tracking_code}
                        </Link>
                        <span className="text-xs text-slate-400">
                          {new Date(t.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs leading-snug text-slate-600 dark:text-slate-300">
                        {t.trich}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {k.status !== 'cho_xu_ly' && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {k.handled_by_name ? `${k.handled_by_name} xử lý` : 'Đã xử lý'}
                {k.handled_at ? ` lúc ${new Date(k.handled_at).toLocaleString('vi-VN')}` : ''}
                {k.handler_note ? ` · ${k.handler_note}` : ''}
              </p>
            )}

            {k.status === 'cho_xu_ly' && laLanhDao && (
              <div className="mt-3">
                {dangMo === k.id ? (
                  <>
                    <input
                      type="text"
                      value={ghiChu}
                      onChange={(e) => setGhiChu(e.target.value)}
                      maxLength={255}
                      placeholder="Ghi chú (không bắt buộc)"
                      className="mb-2 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => xuLy.mutate({ id: k.id, quyetDinh: 'go_khoa' })}
                        disabled={xuLy.isPending}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {xuLy.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Gỡ khoá
                      </button>
                      <button
                        type="button"
                        onClick={() => xuLy.mutate({ id: k.id, quyetDinh: 'tu_choi' })}
                        disabled={xuLy.isPending}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" /> Từ chối
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDangMo(null); setGhiChu(''); }}
                        className="inline-flex min-h-[40px] items-center rounded-xl border-2 border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        Thôi
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setDangMo(k.id); setGhiChu(''); }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-primary-700"
                  >
                    Quyết định
                  </button>
                )}
              </div>
            )}

            {k.status === 'cho_xu_ly' && !laLanhDao && (
              <p className="mt-2 text-xs italic text-slate-500 dark:text-slate-400">
                Chỉ chỉ huy và quản trị mới quyết định gỡ khoá.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
