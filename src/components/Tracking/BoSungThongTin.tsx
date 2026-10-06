/**
 * BỔ SUNG THÔNG TIN CHO TIN ĐÃ GỬI — phía người dân (ADR-003 việc 21)
 *
 * Hiện trong phòng trao đổi, tức là SAU khi bà con đã nhập mã PIN: chỉ người
 * giữ PIN mới bổ sung được, người chỉ biết mã tra cứu thì không. Bổ sung được
 * trong 72 giờ kể từ lúc gửi, tối đa 5 lần — máy chủ kiểm và báo lý do nếu hết
 * hạn. Phần bổ sung lưu riêng, không sửa nội dung đã gửi.
 *
 * Ảnh kiểm chữ ký và vẽ lại qua canvas trước khi gửi (bỏ toạ độ GPS trong ảnh),
 * như ở bước gửi ý kiến; máy chủ kiểm lại lần nữa.
 */
import { useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, PlusCircle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { guiBoSung } from '../../services/trackingService';
import { validateImageFile } from '../../utils/security';
import { compressImageFile } from '../../utils/helpers';

const SO_ANH_TOI_DA = 3;

export default function BoSungThongTin({ code, onDaGui }: { code: string; onDaGui?: () => void }) {
  const [mo, setMo] = useState(false);
  const [noiDung, setNoiDung] = useState('');
  const [anh, setAnh] = useState<string[]>([]);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  /* Ảnh máy chủ không nhận được (BUG-035) — giữ lại sau khi khung đóng, để bà con
     thấy rõ ảnh nào chưa tới cán bộ thay vì tưởng đã gửi đủ */
  const [khongNhan, setKhongNhan] = useState<{ ten: string; lyDo: string }[]>([]);

  async function chonAnh(files: FileList | null) {
    if (!files) return;
    const moi: string[] = [];
    for (const f of Array.from(files).slice(0, SO_ANH_TOI_DA - anh.length)) {
      const kiem = await validateImageFile(f);
      if (!kiem.ok) { toast.error(kiem.reason); continue; }
      try {
        moi.push(await compressImageFile(f));
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setAnh((a) => [...a, ...moi].slice(0, SO_ANH_TOI_DA));
  }

  async function gui() {
    setDangGui(true);
    setLoi('');
    try {
      const kq = await guiBoSung(code, noiDung.trim(), anh);
      toast.success(kq.message, { duration: 6000 });
      setKhongNhan(kq.tepKhongNhan ?? []);
      setNoiDung('');
      setAnh([]);
      setMo(false);
      onDaGui?.();
    } catch (e) {
      setLoi((e as Error).message || 'Gửi thất bại — Vấn đề khẩn cấp liên hệ ngay 113 để được giải quyết.');
    } finally {
      setDangGui(false);
    }
  }

  const baoKhongNhan = khongNhan.length > 0 && (
    <div role="alert" data-khoi="tep-khong-nhan"
      className="mt-2 rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-100">
      <p className="flex items-start gap-1.5 font-bold">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Phần chữ đã được nhận, nhưng các ảnh dưới đây KHÔNG gửi tới được cán bộ:
      </p>
      <ul className="mt-1 space-y-1">
        {khongNhan.map((t, i) => <li key={i}><span className="font-semibold">{t.ten}</span> — {t.lyDo}</li>)}
      </ul>
    </div>
  );

  if (!mo) {
    return (
      <>
        <button type="button" onClick={() => setMo(true)}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:underline dark:text-primary-300">
          <PlusCircle className="h-3.5 w-3.5" /> Bổ sung thông tin, ảnh cho hồ sơ (trong 72 giờ kể từ lúc gửi)
        </button>
        {baoKhongNhan}
      </>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-900/40 dark:bg-primary-900/10">
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-300">
        Phần bổ sung được lưu riêng, giữ nguyên nội dung bà con đã gửi. Cán bộ sẽ thấy ngay trên hồ sơ.
      </p>
      <textarea
        rows={3}
        maxLength={2000}
        value={noiDung}
        onChange={(e) => setNoiDung(e.target.value)}
        placeholder="Thông tin mới: thời gian, địa điểm, đặc điểm đối tượng, biển số xe…"
        className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-900 sm:text-sm"
      />
      {anh.length > 0 && (
        <div className="mt-2 flex gap-2">
          {anh.map((a, i) => (
            <div key={i} className="relative">
              <img src={a} alt={`Ảnh bổ sung ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
              <button type="button" onClick={() => setAnh((x) => x.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white" aria-label="Bỏ ảnh">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {loi && <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">{loi}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {anh.length < SO_ANH_TOI_DA && (
          <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <ImagePlus className="h-3.5 w-3.5" /> Thêm ảnh
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { chonAnh(e.target.files); e.target.value = ''; }} />
          </label>
        )}
        <button type="button" onClick={gui} disabled={dangGui || noiDung.trim().length < 10}
          className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {dangGui && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Gửi bổ sung
        </button>
        <button type="button" onClick={() => setMo(false)} className="text-xs text-slate-500 hover:underline">Đóng</button>
      </div>
    </div>
  );
}
