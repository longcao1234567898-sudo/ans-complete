/**
 * HangChoGuiNgam — thanh báo + bộ tự gửi tin chờ, chạy trên mọi trang công dân (P92).
 *
 * Tự gửi khi: mở trang, có mạng trở lại (sự kiện "online"), và cứ 20 giây. Máy chủ
 * đòi xác minh "không phải người máy" (tin cất lúc mất mạng chưa có vé) thì hiện ô
 * xác minh ngay trên thanh. Gửi xong hiện mã tra cứu + PIN (một lần) tới khi bà con
 * bấm "Tôi đã lưu mã".
 *
 * Không bao giờ hiện nội dung tin chờ — chỉ số lượng, trạng thái và nút xoá.
 * Máy dùng chung (trọng tài P92 vòng 2): CHỈ hiện tin / kết quả của chính trang đã
 * soạn. Tin của trang khác (tải lại, tab khác, người dùng trước) không hiện gì — vẫn
 * tự gửi ngầm; người soạn nhận lại bằng mã ở trang Tra cứu (Tracking/NhanLaiTinCho).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudOff, Loader2, Trash2 } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import Turnstile, { captchaEnabled } from './Turnstile';
import LopPhu from './LopPhu';
import OXacMinhNguoiMay from '../FeedbackForm/OXacMinhNguoiMay';
import {
  coHangCho, dangGuiHangCho, dsKetQua, dsTinCho, guiTinCho, SU_KIEN_HANG_CHO, xoaKetQua, xoaTinCho,
  type KetQuaGuiNgam, type TinChoTomTat,
} from '../../services/hangChoGui';
import { saveTrackingCode } from '../../hooks/useTrackingHistory';

const CHU_KY_MS = 20_000;

export default function HangChoGuiNgam() {
  const { t } = useNgonNgu();
  const [ds, setDs] = useState<TinChoTomTat[]>([]);
  const [ketQua, setKetQua] = useState<KetQuaGuiNgam[]>([]);
  /* Theo cờ lượt gửi THẬT của hàng chờ, không theo từng lời gọi (trọng tài P92 vòng 2:
     lời gọi chồng nhau trả về ngay rồi mở lại nút xoá trong lúc lượt đầu đang gửi) */
  const [dangGui, setDangGui] = useState(false);
  const daGhi = useRef(new Set<string>());

  const docLai = useCallback(async () => {
    setDangGui(dangGuiHangCho());
    setDs(await dsTinCho());
    const kq = await dsKetQua();
    /* Tin do service worker gửi lúc trang này còn mở: nhớ mã tra cứu vào máy như gửi thường */
    kq.forEach((x) => {
      if (!daGhi.current.has(x.id)) { daGhi.current.add(x.id); saveTrackingCode(x.trackingCode, x.category); }
    });
    setKetQua(kq);
  }, []);

  /* nguoiBam: bà con vừa xác minh — lượt đang bận thì xếp lượt sau, không bỏ.
     coMangMoi: vừa có mạng — tin đang giãn vì lỗi mạng thì thử ngay */
  const gui = useCallback(async (xacMinhThem?: string, nguoiBam = false, coMangMoi = false) => {
    if (navigator.onLine === false) return;
    try { await guiTinCho(xacMinhThem, nguoiBam, coMangMoi); } finally { await docLai(); }
  }, [docLai]);

  useEffect(() => {
    if (!coHangCho) return undefined;
    void docLai().then(() => gui());
    /* "online" thường báo trước khi mạng dùng được thật (wifi bắt sóng, chưa có
       đường ra) — thử thêm vài lần ngắn thay vì đợi lượt 20 giây */
    let hen: ReturnType<typeof setTimeout>[] = [];
    const coMang = () => {
      hen.forEach(clearTimeout);
      /* Chỉ lần đầu được bỏ qua giãn vì lỗi mạng: wifi bật tắt liên tục không được
         tải lại cả thân tin ba lần mỗi lượt (trọng tài P92 vòng 3) */
      hen = [0, 3000, 10_000].map((ms, i) => setTimeout(() => { void gui(undefined, false, i === 0); }, ms));
    };
    const doi = () => { void docLai(); };
    window.addEventListener('online', coMang);
    window.addEventListener(SU_KIEN_HANG_CHO, doi);
    /* service worker gửi xong lúc trang đang mở thì báo về */
    const tuSW = (e: MessageEvent) => { if (e.data === SU_KIEN_HANG_CHO) doi(); };
    navigator.serviceWorker?.addEventListener?.('message', tuSW);
    /* Đều đặn — kể cả tin của trang khác (không hiện, xem đầu tệp); mạng chập chờn
       không phát "online". Hàng chờ trống thì lượt gửi chỉ đọc kho rồi thôi */
    const deu = setInterval(() => { void gui(); }, CHU_KY_MS);
    return () => {
      hen.forEach(clearTimeout);
      clearInterval(deu);
      window.removeEventListener('online', coMang);
      window.removeEventListener(SU_KIEN_HANG_CHO, doi);
      navigator.serviceWorker?.removeEventListener?.('message', tuSW);
    };
  }, [docLai, gui]);

  async function xoa(id: string) {
    if (!window.confirm(t('hcg.xacNhanXoa'))) return;
    await xoaTinCho(id);
    await docLai();
  }

  const kq = ketQua[0];
  return (
    <>
      {ds.length > 0 && (
        <div data-hd="thanh-tin-cho" role="status"
          className="fixed inset-x-3 bottom-[calc(var(--tab-bar-h,0px)+12px)] z-[60] mx-auto max-w-md rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm shadow-soft dark:border-amber-800 dark:bg-slate-900">
          <p className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
            {dangGui ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudOff className="h-4 w-4" />}
            {dangGui ? t('hcg.dangGui') : `${ds.length} ${t('hcg.dangCho')}`}
          </p>
          {ds.map((x) => (
            <div key={x.id} className="mt-2">
              {x.maMo && <p className="text-xs text-amber-900 dark:text-amber-200">{t('hcg.maMoCuaBan')} <b data-hd="ma-mo-thanh" className="font-mono tracking-widest">{x.maMo}</b></p>}
              {x.trangThai === 'can_xac_minh' && (
                <>
                  <p className="text-xs text-amber-900 dark:text-amber-200">{t('hcg.canXacMinh')}</p>
                  <OXacMinhNguoiMay coVe={false} onCoVe={() => { void gui(undefined, true); }} />
                </>
              )}
              {x.trangThai === 'can_xac_minh_them' && (
                <>
                  <p className="text-xs text-amber-900 dark:text-amber-200">{t('hcg.canXacMinh')}</p>
                  {captchaEnabled && <div className="mt-2 flex justify-center"><Turnstile onToken={(tk) => { if (tk) void gui(tk, true); }} /></div>}
                </>
              )}
              {x.trangThai === 'cho' && x.loi && (
                <p data-hd="loi-lan-thu" className="text-xs text-amber-900 dark:text-amber-200">{t('hcg.lanThuTruoc')} {x.loi}</p>
              )}
              {x.trangThai === 'loi' && (
                <p className="text-xs text-rose-700 dark:text-rose-300">{t('hcg.biTuChoi')} {x.loi}</p>
              )}
              {x.trangThai === 'qua_han' && (
                <p data-hd="tin-qua-han" className="text-xs text-rose-700 dark:text-rose-300">{x.loi}</p>
              )}
              {/* Đang gửi thì khoá nút: yêu cầu đã đi không rút lại được */}
              <button type="button" onClick={() => xoa(x.id)} disabled={dangGui}
                className="mt-1 inline-flex min-h-[40px] items-center gap-1 text-xs font-semibold text-slate-600 underline disabled:opacity-40 dark:text-slate-300">
                <Trash2 className="h-3.5 w-3.5" /> {t('hcg.xoa')}
              </button>
            </div>
          ))}
        </div>
      )}

      {kq && (
        <LopPhu>
          <div role="dialog" aria-modal="true" aria-labelledby="hcg-da-gui" data-hd="ket-qua-gui-ngam"
            className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/60 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-soft dark:bg-slate-900">
              <h2 id="hcg-da-gui" className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">{t('hcg.daGuiTieuDe')}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{t('hcg.daGuiMoTa')}</p>
              <p className="mt-4 text-xs font-semibold text-slate-500">{t('hcg.maTraCuu')}</p>
              <p className="font-mono text-3xl font-extrabold tracking-[0.25em] text-slate-800 dark:text-slate-100">{kq.trackingCode}</p>
              {kq.chatPin && (
                <>
                  <p className="mt-3 text-xs font-semibold text-slate-500">{t('hcg.maPin')}</p>
                  <p className="font-mono text-2xl font-extrabold tracking-[0.3em] text-slate-800 dark:text-slate-100">{kq.chatPin}</p>
                </>
              )}
              {kq.tepKhongNhan && kq.tepKhongNhan.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 p-3 text-left text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                  <p className="font-bold">{t('hcg.tepKhongNhan')}</p>
                  <ul className="mt-1 list-disc pl-4">{kq.tepKhongNhan.map((f, i) => <li key={i}>{f.ten}: {f.lyDo}</li>)}</ul>
                </div>
              )}
              <button type="button" onClick={async () => { await xoaKetQua(kq.id); await docLai(); }}
                className="mt-5 min-h-[44px] rounded-xl bg-primary-600 px-5 py-2 text-sm font-bold text-white hover:bg-primary-700">
                {t('hcg.daLuu')}
              </button>
            </div>
          </div>
        </LopPhu>
      )}
    </>
  );
}
