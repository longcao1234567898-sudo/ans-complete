/**
 * NGƯỠNG MƯA CỦA MỘT ĐƯỜNG HAY NGẬP (P53) — trang cán bộ Điểm đen giao thông.
 *
 * Mỗi lần cán bộ bấm "Đang ngập", máy chủ ghi lượng mưa lúc đó. Từ 3 lần trở lên
 * máy GỢI Ý ngưỡng cho tuyến; LÃNH ĐẠO quyết định đặt. Có ngưỡng thì trang người
 * dân báo "nguy cơ ngập" cho tuyến khi dự báo mưa dồn 3 giờ đạt ngưỡng — sát địa
 * bàn hơn ngưỡng chung của cả nước. Chặn quyền thật ở máy chủ (luật 2).
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CloudRain } from 'lucide-react';
import { datNguongMua, type DiemDenQuanTri } from '../../services/adminService';
import { formatDateTime } from './statusMeta';

export default function NguongMuaDuong({ d, laLanhDao, coBang }: { d: DiemDenQuanTri; laLanhDao: boolean; coBang: boolean }) {
  const qc = useQueryClient();
  const [nhap, setNhap] = useState(d.nguong_mua_3h != null ? String(d.nguong_mua_3h) : '');
  const luu = useMutation({
    mutationFn: (v: number | null) => datNguongMua(d.id, v),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['admin-diem-den'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!coBang) {
    return (
      <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
        Ngưỡng mưa theo tuyến: cần chạy <code>database/nang_cap_v34.sql</code>.
      </p>
    );
  }

  const ls = d.ngap_theo_mua;
  const nguong = d.nguong_mua_3h ?? null;
  const so = Number(nhap);
  const nhapHopLe = nhap === '' || (Number.isInteger(so) && so >= 5 && so <= 300);

  return (
    <div data-khoi="nguong-mua" className="mb-3 rounded-xl bg-sky-50/70 p-2.5 text-xs text-slate-700 dark:bg-sky-900/15 dark:text-slate-200">
      <p className="flex items-center gap-1 font-bold">
        <CloudRain className="h-3.5 w-3.5 text-sky-600" />
        {nguong !== null
          ? <>Ngưỡng của tuyến: mưa dồn <b>{nguong} mm</b> trong 3 giờ thì báo nguy cơ ngập</>
          : <>Chưa có ngưỡng riêng — theo mức cảnh báo chung (mưa to)</>}
      </p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        {ls
          ? <>Đã ghi {ls.tongLanNgap} lần báo ngập{ls.soLan < ls.tongLanNgap ? ` (${ls.soLan} lần có số mưa)` : ''}.
              {' '}Gần đây: {ls.ganDay.map((g) => `${formatDateTime(g.luc)} — ${g.mua3h == null ? 'không có số mưa' : `${g.mua3h} mm/3 giờ`}`).join(' · ')}</>
          : 'Chưa có lần báo ngập nào được ghi lượng mưa. Mỗi lần bấm "Đang ngập", máy tự ghi lượng mưa lúc đó.'}
      </p>
      {ls && (
        <p className="mt-1">
          {ls.goiY !== null
            ? <>Gợi ý ngưỡng: <b>{ls.goiY} mm</b> (từ {ls.soLan} lần, mưa dồn 3 giờ khi ngập thấp nhất {ls.thapNhat} mm, cao nhất {ls.caoNhat} mm; chọn phía thấp để báo sớm).</>
            : <>Cần ít nhất 3 lần ngập có số mưa để gợi ý ngưỡng.</>}
        </p>
      )}
      {laLanhDao && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <input
              type="number" min={5} max={300} step={1} inputMode="numeric"
              value={nhap} onChange={(e) => setNhap(e.target.value)} placeholder="mm"
              aria-label="Ngưỡng mưa dồn 3 giờ (mm)"
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-base sm:text-xs dark:border-slate-600 dark:bg-slate-800"
            />
            <span>mm / 3 giờ</span>
          </label>
          <button type="button" disabled={!nhapHopLe || luu.isPending} onClick={() => luu.mutate(nhap === '' ? null : so)}
            className="min-h-[32px] rounded-lg bg-sky-600 px-2.5 font-bold text-white disabled:opacity-50">
            {nhap === '' ? 'Bỏ ngưỡng riêng' : 'Lưu ngưỡng'}
          </button>
          {ls?.goiY != null && ls.goiY !== nguong && (
            <button type="button" disabled={luu.isPending} onClick={() => { setNhap(String(ls.goiY)); luu.mutate(ls.goiY); }}
              className="min-h-[32px] rounded-lg border border-sky-500 px-2.5 font-bold text-sky-700 dark:text-sky-300">
              Dùng gợi ý {ls.goiY} mm
            </button>
          )}
          {!nhapHopLe && <span className="text-rose-600">Nhập số nguyên 5–300.</span>}
        </div>
      )}
    </div>
  );
}
