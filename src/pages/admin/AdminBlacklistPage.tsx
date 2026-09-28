/**
 * TRANG DANH SÁCH KHOÁ — thiết bị
 * ============================================================================
 *
 *   THIẾT BỊ — do cán bộ đánh dấu tin rác một đơn có tên, khoá 24 giờ.
 *
 *   ĐỊA CHỈ MẠNG — KHÔNG CÒN KHOÁ (BUG-016, SEC-DEC-008 G1). Nhà mạng di động
 *              dùng CGNAT: hàng trăm thuê bao chung một IP, khoá là chặn oan
 *              cả vùng. Mục này chỉ còn để hiện dòng cũ do phiên bản trước để
 *              lại (không chặn ai) cho tới khi chạy nang_cap_v23.sql. Đừng viết
 *              lại lời hứa "hệ thống khoá IP" ở đây — cán bộ tin là đã khoá thì
 *              không dùng biện pháp khác (đúng hậu quả của BUG-016).
 *
 * Trang này để cán bộ NHÌN THẤY và GỠ được. Khoá ngầm mà không ai xem lại được
 * thì đến lúc chặn oan người thật cũng không ai biết mà sửa.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldOff, Smartphone, Globe, Unlock, Loader2, Search } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import KhuKhieuNai from '../../components/admin/KhuKhieuNai';
import { fetchBlacklist, removeBlacklist, type BlacklistItem } from '../../services/adminService';

function conLai(phut: number): string {
  if (phut <= 0) return 'sắp hết';
  if (phut < 60) return `còn ${phut} phút`;
  const gio = Math.floor(phut / 60);
  const du = phut % 60;
  return du > 0 ? `còn ${gio} giờ ${du} phút` : `còn ${gio} giờ`;
}

export default function AdminBlacklistPage() {
  const qc = useQueryClient();
  const [tuKhoa, setTuKhoa] = useState('');
  const [dangGo, setDangGo] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-blacklist'],
    queryFn: fetchBlacklist,
    retry: false,
  });

  const goKhoa = useMutation({
    mutationFn: (id: number) => removeBlacklist(id),
    onMutate: (id: number) => {
      /* Bỏ khỏi danh sách NGAY, không chờ máy chủ — bấm là thấy phản hồi */
      const truoc = qc.getQueryData(['admin-blacklist']);
      qc.setQueryData(['admin-blacklist'], (cu: unknown) =>
        Array.isArray(cu) ? (cu as BlacklistItem[]).filter((x) => x.id !== id) : cu);
      return { truoc };
    },
    onSuccess: () => {
      setMsg('Đã gỡ khoá.');
      qc.invalidateQueries({ queryKey: ['admin-blacklist'] });
    },
    onError: (e: Error, _id, ctx) => {
      if (/không tìm thấy/i.test(e.message)) {
        setMsg('Mục này đã được gỡ trước đó.');
        return;
      }
      if (ctx?.truoc !== undefined) qc.setQueryData(['admin-blacklist'], ctx.truoc);
      setMsg(e.message || 'Không gỡ khoá được.');
    },
    onSettled: () => setDangGo(null),
  });

  const tatCaGoc = data ?? [];

  /* TÌM KIẾM trong danh sách khoá, theo lý do khoá. Không tìm theo mã máy/địa
     chỉ: máy chủ cố ý không trả mã (BUG-014), và người dân cũng không nhìn thấy
     mã máy của mình để đọc cho cán bộ. */
  const q = tuKhoa.trim().toLowerCase();
  const tatCa = q
    ? tatCaGoc.filter((x) => (x.reason || '').toLowerCase().includes(q))
    : tatCaGoc;

  const thietBi = tatCa.filter((x) => x.kind === 'device');
  const ip = tatCa.filter((x) => x.kind === 'ip');

  function bang(ds: BlacklistItem[], loai: 'device' | 'ip') {
    if (ds.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {loai === 'device'
            ? 'Chưa khoá thiết bị nào. Khoá được tạo khi cán bộ bấm "Tin rác" trên một hồ sơ.'
            : 'Không có dòng nào.'}
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2 pr-3 font-semibold">Lý do</th>
              <th className="py-2 pr-3 font-semibold">Người khoá</th>
              <th className="py-2 pr-3 font-semibold">Thời hạn</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {ds.map((x) => (
              <tr key={x.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                  {x.reason || '—'}
                </td>
                <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-300">
                  {x.nguoi_khoa || <span className="italic text-slate-400">hệ thống tự khoá</span>}
                </td>
                <td className="py-2.5 pr-3">
                  <span className={
                    'rounded-lg px-2 py-0.5 font-semibold '
                    + (x.con_lai_phut < 60
                      ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300')
                  }>
                    {conLai(x.con_lai_phut)}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    disabled={dangGo === x.id}
                    onClick={() => { setDangGo(x.id); setMsg(''); goKhoa.mutate(x.id); }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    {dangGo === x.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Unlock className="h-3.5 w-3.5" />}
                    Gỡ khoá
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminLayout>
      {/* KHIẾU NẠI đặt TRÊN danh sách khoá, vì đây là việc cần xử lý — có người
          đang chờ được mở lại. Danh sách khoá chỉ để tra cứu. */}
      <KhuKhieuNai />

      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ShieldOff className="h-5 w-5 text-slate-400" /> Danh sách khoá
      </h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Thiết bị bị chặn tạm thời vì gửi tin rác. Khoá <b>luôn có hạn</b>,
        không bao giờ vĩnh viễn — máy ở tiệm net hay điện thoại mượn của người thân
        có thể đổi chủ.
      </p>

      {tatCaGoc.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            value={tuKhoa}
            onChange={(e) => setTuKhoa(e.target.value)}
            placeholder="Tìm theo lý do khoá..."
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
          <span className="shrink-0 text-xs text-slate-400">{tatCa.length}/{tatCaGoc.length}</span>
        </div>
      )}

      {msg && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
          {msg}
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {error && (
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-900/25 dark:text-rose-300">
          {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Smartphone className="h-4 w-4 text-slate-500" />
              Thiết bị bị khoá
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {thietBi.length}
              </span>
            </h2>
            <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
              Cán bộ bấm &quot;Tin rác&quot; trên một hồ sơ → khoá thiết bị đã gửi trong <b>24 giờ</b>.
            </p>
            {bang(thietBi, 'device')}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Globe className="h-4 w-4 text-slate-500" />
              Địa chỉ mạng (dòng cũ)
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {ip.length}
              </span>
            </h2>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Hệ thống <b>không còn khoá theo địa chỉ mạng</b>: nhà mạng di động cho hàng
              trăm thuê bao dùng chung một địa chỉ, khoá là chặn oan cả vùng. Hồ sơ không
              có mã thiết bị bị đánh dấu tin rác thì không khoá gì.
              <br />
              Dòng nào còn hiện ở đây là do phiên bản cũ để lại và <b>không chặn ai</b>;
              gỡ được, hoặc chạy <code>nang_cap_v23.sql</code> để dọn.
            </p>
            {bang(ip, 'ip')}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
