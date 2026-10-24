/**
 * XacMinhThem — ô "xác minh thêm một lần" khi máy chủ báo mạng vừa có nhiều ý
 * kiến (P88, chặn mềm theo mạng — ADR-006).
 *
 * VÌ SAO: trên 4G hàng trăm người dùng chung một IP. Trước đây người thứ hai gửi
 * trong 2 phút bị chặn thẳng, dù là người lạ. Nay máy chủ trả mã CAN_XAC_MINH_THEM;
 * ô này hiện Turnstile, lấy mã tươi rồi gửi lại ĐÚNG đơn đang điền — không bắt
 * điền lại, không đóng trang (khác màn hình cổng vào, vốn thay cả trang).
 *
 * Đây chỉ là trải nghiệm: máy chủ mới là nơi kiểm (luật 2) — mã dùng một lần,
 * kiểm nghiêm ngặt, có trần cứng theo mạng.
 */
import { ShieldCheck, Phone } from 'lucide-react';
import Turnstile, { captchaEnabled } from '../common/Turnstile';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { UNIT } from '../../utils/constants';
import LopPhu from '../common/LopPhu';

interface Props {
  onToken: (token: string) => void;
  onDong: () => void;
}

export default function XacMinhThem({ onToken, onDong }: Props) {
  const { t } = useNgonNgu();
  /* LopPhu: đưa ra document.body — trong <main> thì chân trang vẽ đè lên đáy ô */
  return (
    <LopPhu>
    <div role="dialog" aria-modal="true" aria-labelledby="xmt-tieu-de"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-soft dark:bg-slate-900">
        <ShieldCheck className="mx-auto mb-3 h-10 w-10 text-primary-600" />
        <h2 id="xmt-tieu-de" className="text-lg font-extrabold text-slate-800 dark:text-slate-100">{t('xmt.tieuDe')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('xmt.loi')}</p>
        <div className="mt-4 flex justify-center">
          {captchaEnabled
            ? <Turnstile onToken={(tk) => { if (tk) onToken(tk); }} />
            : <p className="text-sm font-medium text-rose-600">{t('xmt.khongCo')}</p>}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-rose-700 dark:text-rose-300">
          <Phone className="h-4 w-4" /> {t('xmt.gap')}{' '}
          <a href={`tel:${UNIT.emergency}`} className="font-extrabold underline">{UNIT.emergency}</a>
        </p>
        <button type="button" onClick={onDong}
          className="mt-4 min-h-[44px] rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
          {t('xmt.dong')}
        </button>
      </div>
    </div>
    </LopPhu>
  );
}
