/**
 * TRANG DANH SÁCH KHOÁ — thiết bị và địa chỉ IP
 * ============================================================================
 *
 * VÌ SAO CHIA LÀM HAI NHÓM:
 *
 *   THIẾT BỊ — do cán bộ đánh dấu tin rác, khoá 24 giờ.
 *              Đây là cách khoá CHÍNH, chính xác tới từng máy.
 *
 *   ĐỊA CHỈ IP — hệ thống TỰ khoá, 2 giờ, chỉ khi phát hiện cùng một IP có
 *              từ 3 đơn rác trở lên từ 3 thiết bị khác nhau trong 1 giờ.
 *              Dấu hiệu kẻ phá hoại xoá bộ nhớ trình duyệt để đổi mã thiết bị.
 *
 * ⚠️ VÌ SAO KHOÁ IP PHẢI RẤT DÈ DẶT:
 * Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm thuê bao chung một IP công
 * cộng. Khoá một IP là khoá oan cả vùng thuê bao, mà bà con ở quê phần lớn vào
 * bằng 4G. Nên ngưỡng đặt cao và thời hạn chỉ 2 giờ.
 *
 * Trang này để cán bộ NHÌN THẤY và GỠ được. Khoá ngầm mà không ai xem lại được
 * thì đến lúc chặn oan người thật cũng không ai biết mà sửa.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldOff, Smartphone, Globe, Unlock, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
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

  const tatCa = data ?? [];
  const thietBi = tatCa.filter((x) => x.kind === 'device');
  const ip = tatCa.filter((x) => x.kind === 'ip');

  function bang(ds: BlacklistItem[], loai: 'device' | 'ip') {
    if (ds.length === 0) {
      return (
        <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {loai === 'device'
            ? 'Chưa khoá thiết bị nào. Khoá được tạo khi cán bộ bấm "Tin rác" trên một hồ sơ.'
            : 'Chưa khoá địa chỉ IP nào. Hệ thống chỉ tự khoá khi phát hiện nhiều thiết bị cùng gửi tin rác từ một IP.'}
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400">
            <tr>
              <th className="py-2 pr-3 font-semibold">{loai === 'device' ? 'Mã thiết bị' : 'Địa chỉ IP'}</th>
              <th className="py-2 pr-3 font-semibold">Lý do</th>
              <th className="py-2 pr-3 font-semibold">Người khoá</th>
              <th className="py-2 pr-3 font-semibold">Thời hạn</th>
              <th className="py-2 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {ds.map((x) => (
              <tr key={x.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-2.5 pr-3">
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {/* Chỉ hiện 12 ký tự đầu — đủ để phân biệt, không cần phơi cả mã */}
                    {loai === 'device' ? `${x.identifier.slice(0, 12)}…` : x.identifier}
                  </code>
                </td>
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
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <ShieldOff className="h-5 w-5 text-slate-400" /> Danh sách khoá
      </h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Thiết bị và địa chỉ bị chặn tạm thời vì gửi tin rác. Khoá <b>luôn có hạn</b>,
        không bao giờ vĩnh viễn — máy ở tiệm net hay điện thoại mượn của người thân
        có thể đổi chủ.
      </p>

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
              Địa chỉ IP bị khoá
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {ip.length}
              </span>
            </h2>
            <p className="mb-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Hệ thống <b>tự khoá 2 giờ</b> khi thấy cùng một IP có từ 3 đơn rác trở lên,
              gửi từ 3 thiết bị khác nhau, trong vòng 1 giờ — dấu hiệu kẻ phá hoại xoá
              bộ nhớ trình duyệt để đổi mã thiết bị.
              <br />
              <b>Rất dè dặt</b> vì nhà mạng di động cho hàng trăm thuê bao dùng chung
              một IP; khoá nhầm là chặn oan cả vùng.
            </p>
            {bang(ip, 'ip')}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
