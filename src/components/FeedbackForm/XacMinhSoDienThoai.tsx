/**
 * XacMinhSoDienThoai — ô "xác minh số điện thoại" ngay dưới ô số, ở bước thông
 * tin liên hệ (P89). CHỈ cho tin có danh tính; ẩn danh không bao giờ thấy ô này.
 *
 * VÌ SAO KHÔNG BẮT BUỘC: người lớn tuổi, máy không có Zalo, sóng yếu... bắt nhập
 * mã là mất tin. Không xác minh vẫn gửi được — cán bộ chỉ thấy "chưa xác minh số".
 *
 * Kênh: máy chủ báo kênh nào đang mở (đang thử nghiệm chỉ Zalo). Nút "Gửi qua
 * SMS" chỉ hiện khi máy chủ mở SMS — SMS tốn tiền hơn, chỉ gửi khi bà con cần.
 * Mọi giới hạn (3 mã/giờ cho mỗi máy, mỗi số) do máy chủ kiểm; đếm ngược 60 giây
 * ở đây chỉ để bà con khỏi bấm phí lượt (luật 2).
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Send, Smartphone } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import type { KhoaChu } from '../../i18n/chu';
import { guiMaSdt, trangThaiXacMinhSdt, xacNhanMaSdt } from '../../services/feedbackService';

interface Props {
  soDienThoai: string;
  soHopLe: boolean;
  veSdt?: string;
  onXacMinh: (veSdt: string) => void;
}

const TEN_KENH: Record<string, KhoaChu> = { zalo: 'xms.kenhZalo', sms: 'xms.kenhSms', thu: 'xms.kenhThu' };

export default function XacMinhSoDienThoai({ soDienThoai, soHopLe, veSdt, onXacMinh }: Props) {
  const { t } = useNgonNgu();
  const { data: tt } = useQuery({ queryKey: ['xac-minh-sdt'], queryFn: trangThaiXacMinhSdt, staleTime: 5 * 60_000 });

  const [kenhDaGui, setKenhDaGui] = useState('');
  const [ma, setMa] = useState('');
  const [phien, setPhien] = useState('');
  const [maThu, setMaThu] = useState('');
  const [dang, setDang] = useState(false);
  const [loi, setLoi] = useState('');
  const [demNguoc, setDemNguoc] = useState(0);

  /* Đổi số -> mã đã gửi là của số cũ, bắt đầu lại (ContactInfo đã huỷ vé) */
  useEffect(() => {
    setKenhDaGui(''); setMa(''); setPhien(''); setMaThu(''); setLoi(''); setDemNguoc(0);
  }, [soDienThoai]);

  useEffect(() => {
    if (demNguoc <= 0) return;
    const h = setTimeout(() => setDemNguoc((n) => n - 1), 1000);
    return () => clearTimeout(h);
  }, [demNguoc]);

  if (!tt?.bat || tt.kenh.length === 0) return null;
  const tenKenh = (k: string) => (TEN_KENH[k] ? t(TEN_KENH[k]) : k);

  if (veSdt) {
    return (
      <div className="flex items-start gap-2.5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/15">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{t('xms.daXacMinh')}</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">{t('xms.daXacMinhMoTa')}</p>
        </div>
      </div>
    );
  }

  async function gui(kenh?: string) {
    if (!soHopLe) { setLoi(t('xms.nhapSoTruoc')); return; }
    setDang(true); setLoi('');
    try {
      const r = await guiMaSdt(soDienThoai, kenh);
      setKenhDaGui(r.kenh);
      setPhien(r.phien);
      setMaThu(r.maThu ?? '');
      setMa('');
      setDemNguoc(60);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setDang(false);
    }
  }

  async function xacNhan() {
    if (!/^\d{6}$/.test(ma)) { setLoi(t('xms.maSai')); return; }
    setDang(true); setLoi('');
    try {
      const r = await xacNhanMaSdt(soDienThoai, ma, phien);
      onXacMinh(r.veSdt);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : String(e));
    } finally {
      setDang(false);
    }
  }

  const coSms = tt.kenh.includes('sms') && kenhDaGui !== 'sms';

  return (
    <div className="rounded-2xl border-2 border-primary-200 bg-primary-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="mb-3 flex items-start gap-2">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
        <div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {t('xms.tieuDe')} <span className="font-normal text-slate-500">{t('xms.khongBatBuoc')}</span>
          </p>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('xms.moTa')}</p>
        </div>
      </div>

      {!kenhDaGui ? (
        <button
          type="button"
          onClick={() => gui()}
          disabled={dang || !soHopLe}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {dang ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {t('xms.guiQua')} {tenKenh(tt.kenh[0])}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {t('xms.daGuiQua')} {tenKenh(kenhDaGui)}. {t('xms.hetHan')}
          </p>
          {/* Chỉ máy chủ chạy thử (kênh "thu", bị chặn ở máy thật) mới trả mã */}
          {maThu && (
            <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-center dark:bg-amber-900/20">
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t('xms.maThu')}</p>
              <p className="mt-1 font-mono text-2xl font-extrabold tracking-[0.3em] text-amber-700 dark:text-amber-300">{maThu}</p>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={ma}
              aria-label={t('xms.tieuDe')}
              onChange={(e) => setMa(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <button
              type="button"
              onClick={xacNhan}
              disabled={dang || ma.length !== 6}
              className="min-h-[44px] shrink-0 rounded-xl bg-primary-600 px-5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              {dang ? <Loader2 className="h-4 w-4 animate-spin" /> : t('xms.xacNhan')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => gui(kenhDaGui === 'sms' ? 'sms' : undefined)}
            disabled={demNguoc > 0 || dang}
            className="min-h-[44px] w-full text-xs font-semibold text-primary-600 transition hover:underline disabled:text-slate-400 disabled:no-underline dark:text-primary-300"
          >
            {demNguoc > 0 ? `${t('xms.guiLaiSau')} ${demNguoc} ${t('xms.giay')}` : t('xms.guiLai')}
          </button>
          {coSms && (
            <button
              type="button"
              onClick={() => gui('sms')}
              disabled={demNguoc > 0 || dang}
              className="min-h-[44px] w-full rounded-xl border border-primary-300 px-4 py-2 text-xs font-bold text-primary-700 transition hover:bg-primary-50 disabled:opacity-50 dark:border-primary-700 dark:text-primary-300"
            >
              {t('xms.quaSms')}
            </button>
          )}
        </div>
      )}

      {loi && <p role="alert" className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{loi}</p>}
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('xms.gioiHan')}</p>
    </div>
  );
}
