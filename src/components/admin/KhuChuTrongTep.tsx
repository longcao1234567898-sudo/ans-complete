/**
 * KhuChuTrongTep — CHỮ TRONG TỆP ĐÍNH KÈM (OCR nội bộ, P52, ADR-005).
 *
 * Cán bộ đọc nội dung đơn Word, PDF, ảnh chụp giấy tờ ngay trên trang hồ sơ mà
 * KHÔNG phải mở tệp: máy chủ của đơn vị đọc chữ ra (không gửi tệp đi đâu), ở đây
 * chỉ hiện chữ thuần. React vẽ chữ như chữ — không chèn HTML, không chạy gì trong
 * tệp — nên đọc ở đây an toàn hơn tải về mở.
 *
 * Chữ do OCR đọc có thể sai: luôn ghi rõ cách lấy chữ và độ tin cậy, nhắc đối
 * chiếu bản gốc trước khi dùng làm căn cứ.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanText, Loader2, RotateCcw, Copy, Search, AlertTriangle } from 'lucide-react';
import { layChuTrongTep, yeuCauTrichChu, type ChuTrongTep, type NgonNguOcr } from '../../services/adminService';
import {
  NHAN_LOAI_TEP, NHAN_TRANG_THAI_TRICH, TEN_NGON_NGU, moTaPhuongPhap, laOcr, tachDanhDau, conDangTrich,
} from '../../utils/chuTrongTep';

const MAU_TRANG_THAI: Record<string, string> = {
  chua: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  cho: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  dang_lam: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  xong: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  loi: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

function ChuDaTo({ text, tuKhoa }: { text: string; tuKhoa: string }) {
  return (
    <>
      {tachDanhDau(text, tuKhoa).map((d, i) => (d.khop
        ? <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">{d.chu}</mark>
        : <span key={i}>{d.chu}</span>))}
    </>
  );
}

function MotTep({ t, thuTu, tuKhoa, onTrichLai, dangGui }: {
  t: ChuTrongTep; thuTu: number; tuKhoa: string; dangGui: boolean;
  onTrichLai: (ngonNgu: NgonNguOcr | null) => void;
}) {
  const [ngonNgu, setNgonNgu] = useState<NgonNguOcr | ''>(t.ngonNguChon ?? '');
  const coTheOcr = t.loai === 'anh' || t.loai === 'pdf';
  const chep = async () => {
    try {
      await navigator.clipboard.writeText(t.noiDung ?? '');
      toast.success('Đã chép chữ');
    } catch {
      toast.error('Trình duyệt không cho chép — bôi đen rồi chép tay');
    }
  };

  return (
    <div data-khoi="chu-trong-tep" data-tep={t.tepId} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Tệp {thuTu} · {NHAN_LOAI_TEP[t.loai] ?? 'Tệp'}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${MAU_TRANG_THAI[t.trangThai] ?? MAU_TRANG_THAI.chua}`}>
          {(t.trangThai === 'cho' || t.trangThai === 'dang_lam') && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
          {NHAN_TRANG_THAI_TRICH[t.trangThai] ?? t.trangThai}
        </span>
        {t.daChuyenTcvn3 && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
            title="Văn bản gõ phông .VnTime (TCVN3) cũ — đã tự chuyển sang Unicode">
            Đã chuyển phông .VnTime
          </span>
        )}
      </div>

      {t.trangThai === 'xong' && (
        <>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{moTaPhuongPhap(t)}</p>
          {t.ghiChu && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">{t.ghiChu}</p>}
          {t.noiDung
            ? (
              <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                <ChuDaTo text={t.noiDung} tuKhoa={tuKhoa} />
              </pre>
            )
            : <p className="mt-2 text-xs italic text-slate-500">Không thấy chữ nào trong tệp này.</p>}
          {laOcr(t.phuongPhap) && (
            <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Chữ do máy nhận dạng có thể sai (nhất là chữ viết tay, ảnh mờ). Đối chiếu bản gốc trước khi dùng làm căn cứ.
            </p>
          )}
        </>
      )}
      {t.trangThai === 'loi' && t.ghiChu && <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{t.ghiChu}</p>}

      {(t.trangThai === 'xong' || t.trangThai === 'loi') && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {t.trangThai === 'xong' && t.noiDung && (
            <button type="button" onClick={chep}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
              <Copy className="h-3.5 w-3.5" /> Chép chữ
            </button>
          )}
          {coTheOcr && (
            <select
              aria-label="Ngôn ngữ đọc chữ"
              value={ngonNgu}
              onChange={(e) => setNgonNgu(e.target.value as NgonNguOcr | '')}
              className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">Tự chọn ngôn ngữ</option>
              {(['vie', 'eng', 'vie+eng'] as NgonNguOcr[]).map((n) => <option key={n} value={n}>{TEN_NGON_NGU[n]}</option>)}
            </select>
          )}
          <button type="button" disabled={dangGui} onClick={() => onTrichLai(coTheOcr && ngonNgu ? ngonNgu : null)}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            <RotateCcw className="h-3.5 w-3.5" /> Trích lại
          </button>
        </div>
      )}
    </div>
  );
}

export default function KhuChuTrongTep({ hoSoId }: { hoSoId: number | string }) {
  const qc = useQueryClient();
  const [tuKhoa, setTuKhoa] = useState('');
  const khoa = ['trich-chu', String(hoSoId)];
  const { data, isLoading, error } = useQuery({
    queryKey: khoa,
    queryFn: () => layChuTrongTep(hoSoId),
    /* Còn tệp đang đọc thì hỏi lại vài giây một lần; xong hết thì thôi */
    refetchInterval: (q) => (conDangTrich(q.state.data?.tep) ? 3000 : false),
  });
  const gui = useMutation({
    mutationFn: (yeuCau: { tepId?: number; lai?: boolean; ngonNgu?: NgonNguOcr | null }) => yeuCauTrichChu(hoSoId, yeuCau),
    onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: khoa }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return null;
  if (error) return <p className="mt-3 text-xs text-rose-600">Chưa tải được chữ trong tệp: {(error as Error).message}</p>;
  if (!data || data.tep.length === 0) return null;

  const conChua = data.tep.some((t) => t.trangThai === 'chua');
  const coChu = data.tep.some((t) => t.trangThai === 'xong' && t.noiDung);

  return (
    <section data-khoi="khu-chu-trong-tep" className="mt-4" aria-label="Chữ trong tệp đính kèm">
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
        <ScanText className="h-4 w-4 text-primary-600" /> Chữ trong tệp đính kèm
      </h3>
      <p className="mb-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        Máy chủ của đơn vị tự đọc chữ trong Word, PDF, ảnh (OCR nội bộ — tệp không gửi ra ngoài). Đọc chữ ở đây an toàn
        hơn tải tệp về mở; chữ đã trích cũng tìm được ở ô tìm kiếm của danh sách hồ sơ.
      </p>

      {!data.coBang ? (
        <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Chưa bật trích chữ: cần chạy tệp <code>database/nang_cap_v33.sql</code> trên cơ sở dữ liệu.
        </p>
      ) : (
        <>
          {!data.ocrBat && (
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              OCR ảnh và PDF scan đang tắt trên máy chủ (TRICH_CHU_OCR=tat). Word và PDF có sẵn lớp chữ vẫn đọc được.
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {conChua && (
              <button type="button" disabled={gui.isPending} onClick={() => gui.mutate({})}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-xs font-bold text-white transition hover:bg-primary-700 disabled:opacity-50">
                {gui.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
                Trích chữ các tệp
              </button>
            )}
            {coChu && (
              <label className="flex min-h-[36px] flex-1 items-center gap-1.5 rounded-xl border border-slate-300 px-2.5 dark:border-slate-600">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input value={tuKhoa} onChange={(e) => setTuKhoa(e.target.value)} placeholder="Tô từ khoá trong chữ (gõ không dấu cũng được)"
                  className="w-full bg-transparent text-base outline-none sm:text-xs" />
              </label>
            )}
          </div>
          <div className="space-y-2">
            {data.tep.map((t, i) => (
              <MotTep key={t.tepId} t={t} thuTu={i + 1} tuKhoa={tuKhoa} dangGui={gui.isPending}
                onTrichLai={(ngonNgu) => gui.mutate({ tepId: t.tepId, lai: true, ngonNgu })} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
