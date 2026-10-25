/**
 * OXacMinhNguoiMay — ô "không phải người máy" ở bước chọn nhóm của trang gửi ý
 * kiến (P90, người vận hành yêu cầu). Thay cho màn hình xác minh chặn cả web lúc
 * vào: người chỉ đọc tin, tra cứu không phải xác minh; người sắp gửi tin xác minh
 * một lần, vé sống 6 giờ.
 *
 * Chặn thật vẫn ở MÁY CHỦ (gửi ý kiến, gửi mã, đăng nhập đều đòi vé) — ô này chỉ
 * là nơi lấy vé (luật 2). Không qua được (máy cũ, mạng chặn Cloudflare) thì luôn
 * có số 113 và số trực ban.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Phone, ShieldCheck } from 'lucide-react';
import Turnstile from '../common/Turnstile';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { UNIT } from '../../utils/constants';
import { layVe, SU_KIEN_CAN_XAC_MINH } from '../../utils/veVaoCua';
import { canVeVaoCua, layVeMoi } from '../../services/congVaoService';
import { useMatMang } from '../../hooks/useMatMang';

/** Đã có vé còn hạn chưa (hoặc không cần vé). Máy chủ báo vé hết hạn thì tự về false */
export function useCoVe() {
  const [coVe, setCoVe] = useState(() => !canVeVaoCua || Boolean(layVe()));
  useEffect(() => {
    if (!canVeVaoCua) return undefined;
    const nghe = () => setCoVe(false);
    window.addEventListener(SU_KIEN_CAN_XAC_MINH, nghe);
    return () => window.removeEventListener(SU_KIEN_CAN_XAC_MINH, nghe);
  }, []);
  return { coVe, daCoVe: () => setCoVe(true) };
}

export default function OXacMinhNguoiMay({ coVe, onCoVe }: { coVe: boolean; onCoVe: () => void }) {
  const { t } = useNgonNgu();
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState('');
  const [khoaO, setKhoaO] = useState(0);
  const matMang = useMatMang();

  if (!canVeVaoCua) return null;

  if (coVe) {
    return (
      <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> {t('xnm.daXong')}
      </p>
    );
  }

  /* P92: mất mạng thì Turnstile không tải được — cho đi tiếp, tin sẽ cất trên máy và
     hàng chờ nhắc xác minh khi có mạng (máy chủ vẫn đòi vé lúc nhận) */
  if (matMang) {
    return (
      <p data-hd="o-nguoi-may-mat-mang" className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        {t('xnm.matMang')}
      </p>
    );
  }

  async function nhanToken(token: string) {
    if (!token) return;
    setDangGui(true);
    setLoi('');
    try {
      await layVeMoi(token);
      onCoVe();
    } catch (e) {
      setLoi((e as Error).message || t('xnm.khongQua'));
      setKhoaO((k) => k + 1);   // mã Turnstile chỉ dùng được một lần: dựng ô mới
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div data-hd="o-nguoi-may" className="mt-4 rounded-2xl border-2 border-primary-200 bg-primary-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" /> {t('xnm.tieuDe')}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('xnm.moTa')}</p>
      <div className="mt-3 flex justify-center">
        <Turnstile key={khoaO} onToken={nhanToken} />
      </div>
      {dangGui && (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('xnm.dangXacMinh')}
        </p>
      )}
      {loi && <p role="alert" className="mt-2 text-center text-xs font-medium text-rose-600">{loi}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-xs text-rose-700 dark:text-rose-300">
        <Phone className="h-3.5 w-3.5" /> {t('xnm.gap')}
        <a href={`tel:${UNIT.emergency}`} className="font-extrabold underline">{UNIT.emergency}</a>
        · {t('xnm.trucBan')}
        <a href={`tel:${UNIT.hotline.replace(/\s/g, '')}`} className="font-bold underline">{UNIT.hotline}</a>
      </p>
    </div>
  );
}
