/**
 * CỔNG VÀO — XÁC MINH "KHÔNG PHẢI NGƯỜI MÁY" MỘT LẦN KHI VÀO WEB (ADR-003 việc 23)
 *
 * Thay cho ô xác minh ở từng form. Xác minh xong, máy chủ cấp vé có hạn
 * (server/src/lib/cong-vao.js); giao diện gửi vé kèm lần gửi tin, đăng nhập.
 * Chặn thật nằm ở MÁY CHỦ — màn hình này chỉ là nơi lấy vé.
 *
 * Người không qua được bước này (máy cũ, mạng chặn Cloudflare) vẫn phải có
 * đường báo tin: màn hình luôn hiện số 113 và số trực ban.
 *
 * Không khai VITE_TURNSTILE_SITE_KEY hoặc không có máy chủ (chế độ chạy một
 * mình) thì không chặn gì — như ô xác minh trước đây.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Phone, ShieldCheck } from 'lucide-react';
import Turnstile, { captchaEnabled } from './Turnstile';
import { apiFetch, hasBackend } from '../../services/api';
import { layVe, luuVe, SU_KIEN_CAN_XAC_MINH } from '../../utils/veVaoCua';
import { UNIT } from '../../utils/constants';

export default function CongVao({ children }: { children: ReactNode }) {
  const canCong = hasBackend && captchaEnabled;
  const [coVe, setCoVe] = useState(() => !canCong || Boolean(layVe()));
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [khoaO, setKhoaO] = useState(0);

  /* Máy chủ báo vé hết hạn giữa chừng -> hiện lại màn hình */
  useEffect(() => {
    if (!canCong) return undefined;
    const nghe = () => { setCoVe(false); setKhoaO((k) => k + 1); };
    window.addEventListener(SU_KIEN_CAN_XAC_MINH, nghe);
    return () => window.removeEventListener(SU_KIEN_CAN_XAC_MINH, nghe);
  }, [canCong]);

  async function nhanToken(token: string) {
    if (!token) return;
    setDangGui(true);
    setLoi('');
    try {
      const kq = await apiFetch<{ ve: string; hetHanGio: number }>('/api/cong-vao/xac-minh', {
        method: 'POST',
        body: JSON.stringify({ captchaToken: token }),
      });
      luuVe(kq.ve, kq.hetHanGio);
      setCoVe(true);
    } catch (e) {
      setLoi((e as Error).message || 'Xác minh không thành công.');
      setKhoaO((k) => k + 1);   // dựng lại ô xác minh: mã Turnstile chỉ dùng được một lần
    } finally {
      setDangGui(false);
    }
  }

  if (coVe) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-soft dark:bg-slate-900">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary-600" />
        <h1 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">Xác minh trước khi vào</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Bước này giúp chặn máy tự động gửi tin rác. Bà con chỉ cần làm một lần cho mỗi lần mở trang.
        </p>
        <div className="mt-4 flex justify-center">
          <Turnstile key={khoaO} onToken={nhanToken} />
        </div>
        {dangGui && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang xác minh...
          </p>
        )}
        {loi && <p className="mt-2 text-xs font-medium text-rose-600">{loi}</p>}
        <div className="mt-5 rounded-xl bg-rose-50 p-3 text-left text-sm text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
          <p className="font-bold">Không qua được bước này mà có việc gấp?</p>
          <p className="mt-1 flex items-center gap-1.5">
            <Phone className="h-4 w-4" /> Gọi ngay <a href={`tel:${UNIT.emergency}`} className="font-extrabold underline">{UNIT.emergency}</a>
          </p>
          <p className="mt-0.5 flex items-center gap-1.5">
            <Phone className="h-4 w-4" /> Trực ban {UNIT.shortName}:{' '}
            <a href={`tel:${UNIT.hotline.replace(/\s/g, '')}`} className="font-bold underline">{UNIT.hotline}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
