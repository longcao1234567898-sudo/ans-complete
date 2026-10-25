/**
 * NhanLaiTinCho — ô nhập MÃ NHẬN KẾT QUẢ ở trang Tra cứu (P92, trọng tài vòng 2).
 *
 * Tin lưu lúc mất mạng chỉ hiện ở đúng trang đã soạn (máy dùng chung không được biết
 * máy này vừa có người báo công an). Tải lại trang / đóng trình duyệt thì người soạn
 * vào đây nhập mã 6 số đã ghi để thấy lại tin chờ hoặc mã tra cứu.
 *
 * Ô LUÔN hiện (không phụ thuộc máy có tin hay không) và nhập sai không nói có tin
 * hay không — người khác thử cũng không suy ra được gì. Sai nhiều lần thì khoá tạm
 * (services/hangChoGui.ts nhanLaiBangMa), không xoá gì.
 */
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useNgonNgu } from '../../i18n/useNgonNgu';
import { coHangCho, nhanLaiBangMa, type KetQuaNhanLai } from '../../services/hangChoGui';

export default function NhanLaiTinCho() {
  const { t } = useNgonNgu();
  const [ma, setMa] = useState('');
  const [dangTim, setDangTim] = useState(false);
  const [bao, setBao] = useState<{ loi: boolean; chu: string } | null>(null);

  if (!coHangCho) return null;

  function loiBao(kq: KetQuaNhanLai): { loi: boolean; chu: string } {
    switch (kq.loai) {
      case 'tin': return { loi: false, chu: t('nltc.thayTin') };
      case 'ket_qua': return { loi: false, chu: t('nltc.thayKetQua') };
      case 'dau':
        if (kq.dau === 'tin_bi_tu_choi') return { loi: true, chu: `${t('nltc.biTuChoi')} ${kq.loi || ''}` };
        return { loi: true, chu: t(`nltc.dau.${kq.dau}`) };
      case 'khoa':
        return { loi: true, chu: `${t('nltc.khoa')} ${new Date(kq.den).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.` };
      default: return { loi: true, chu: `${t('nltc.sai')} ${kq.conLai}.` };
    }
  }

  async function tim(e: React.FormEvent) {
    e.preventDefault();
    setDangTim(true);
    try {
      setBao(loiBao(await nhanLaiBangMa(ma)));
      setMa('');
    } catch {
      setBao({ loi: true, chu: t('nltc.khongDoc') });
    } finally {
      setDangTim(false);
    }
  }

  return (
    <div data-hd="nhan-lai-tin-cho" className="mt-6 rounded-2xl border border-slate-200 bg-white/90 p-4 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
        <KeyRound className="h-4 w-4 text-primary-600" /> {t('nltc.tieuDe')}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t('nltc.moTa')}</p>
      <form className="mt-3 flex gap-2" onSubmit={tim}>
        <input data-hd="o-ma-mo" inputMode="numeric" autoComplete="off" maxLength={6} value={ma}
          onChange={(e) => setMa(e.target.value.replace(/\D/g, ''))} placeholder={t('nltc.goiY')} aria-label={t('hcg.nhapMaMo')}
          /* Chữ gợi ý dùng phông thường: phông số giãn rộng làm "Mã nhận kết quả..." bị cắt */
          className="min-h-[44px] w-40 rounded-xl border border-slate-300 px-3 text-center font-mono text-lg tracking-widest placeholder:font-sans placeholder:text-sm placeholder:tracking-normal dark:border-slate-700 dark:bg-slate-800" />
        <button type="submit" disabled={ma.length !== 6 || dangTim}
          className="min-h-[44px] rounded-xl bg-primary-600 px-4 text-sm font-bold text-white disabled:opacity-50">{t('nltc.nut')}</button>
      </form>
      {bao && <p role="status" data-hd="bao-nhan-lai" className={`mt-2 text-xs font-medium ${bao.loi ? 'text-rose-600 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>{bao.chu}</p>}
    </div>
  );
}
