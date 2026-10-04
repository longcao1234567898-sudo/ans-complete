/**
 * TRANG QUẢN LÝ ĐIỂM ĐEN GIAO THÔNG — cán bộ cập nhật số liệu tai nạn và tình
 * trạng ngập của các đường hay ngập.
 *
 * ⚠️ Mọi vai trò XEM được (cán bộ cơ sở cần biết địa bàn mình có điểm nào nguy
 *    hiểm), chỉ chỉ huy và quản trị THÊM, SỬA, ẨN. Số liệu tai nạn là số liệu
 *    chính thức của đơn vị, phải qua người có trách nhiệm.
 *
 *    NGOẠI LỆ: nút "Đang ngập" / "Hết ngập" của đường hay ngập — MỌI cán bộ bấm
 *    được, vì người đứng ngoài đường lúc mưa là cán bộ cơ sở. Trạng thái tự hết
 *    sau 12 giờ; máy chủ kiểm lại quyền và ghi nhật ký (routes/admin/diem-den.js).
 */
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert, Plus, Pencil, Eye, EyeOff, Loader2, X, Save, Waves } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import LopPhu from '../../components/common/LopPhu';
import KhungDuBaoMua from '../../components/DuBaoMua/KhungDuBaoMua';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  fetchDiemDenQuanTri, luuDiemDen, doiHienDiemDen, baoNgap, type DiemDenQuanTri,
} from '../../services/adminService';
import { laLanhDao as laVaiTroLanhDao } from '../../utils/vaiTro';

const MUC = [
  { ma: 'cao', ten: 'Rất nguy hiểm', mau: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  { ma: 'trung_binh', ten: 'Cần chú ý', mau: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { ma: 'thap', ten: 'Lưu ý', mau: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
] as const;

type Form = {
  id?: number;
  ten: string; moTa: string;
  lat: string; lng: string;
  soVu: string; soTuVong: string; soBiThuong: string;
  kyThongKe: string; mucDo: 'cao' | 'trung_binh' | 'thap'; khuyenCao: string;
  loai: 'tai_nan' | 'ngap';
};

const TRONG: Form = {
  ten: '', moTa: '', lat: '', lng: '',
  soVu: '0', soTuVong: '0', soBiThuong: '0',
  kyThongKe: '', mucDo: 'trung_binh', khuyenCao: '', loai: 'tai_nan',
};

/** "10,81" -> "10.81": bàn phím điện thoại tiếng Việt hay gõ dấu phẩy thập phân.
    Chỉ đổi khi là MỘT số có đúng một dấu phẩy — cặp toạ độ do tachCapToaDo lo. */
const chuanThapPhan = (s: string) => {
  const t = s.trim();
  return /^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t;
};

/** Dán cả cặp "10.8100000, 105.2100000" (Google Maps) vào một ô -> tách hai ô.
    Hai số có dấu chấm, hoặc phẩy kèm khoảng trắng; "10,81" là một số, không tách. */
const tachCapToaDo = (s: string): [string, string] | null => {
  const t = s.trim().replace(/^\(|\)$/g, '');
  const m = t.match(/^(-?\d+\.\d+)\s*[,;\s]\s*(-?\d+\.\d+)$/)
    || t.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s+(-?\d+(?:\.\d+)?)$/);
  return m ? [m[1], m[2]] : null;
};

/** Kiểm trước những lỗi hay gặp để báo NGAY trong khung nhập. Máy chủ vẫn kiểm
    lại (diem-den.js docDuLieu) — đây chỉ để không phải đợi một vòng mạng. */
function loiTruocKhiGui(f: Form): string | null {
  if (f.ten.trim().length < 5) return 'Tên khu quá ngắn (ít nhất 5 ký tự).';
  if ((Number(f.soTuVong) || 0) > 0 && (Number(f.soVu) || 0) === 0) {
    return 'Có người tử vong mà số vụ bằng 0 — kiểm lại giúp.';
  }
  const lat = chuanThapPhan(f.lat);
  const lng = chuanThapPhan(f.lng);
  if (lat !== '' && !(Number.isFinite(Number(lat)) && Math.abs(Number(lat)) <= 90)) return 'Vĩ độ không hợp lệ (ví dụ: 10.8100000).';
  if (lng !== '' && !(Number.isFinite(Number(lng)) && Math.abs(Number(lng)) <= 180)) return 'Kinh độ không hợp lệ (ví dụ: 105.2100000).';
  return null;
}

export default function AdminDiemDenPage() {
  const qc = useQueryClient();
  const { staff } = useAdminAuth();
  const laLanhDao = laVaiTroLanhDao(staff?.role);

  const [form, setForm] = useState<Form | null>(null);
  const [thongBao, setThongBao] = useState('');
  /* Lỗi của khung nhập hiện NGAY TRONG khung. Trước đây lỗi hiện ở trang phía
     sau lớp phủ: trên điện thoại bấm Thêm thấy "không có gì xảy ra". */
  const [loiForm, setLoiForm] = useState('');
  /* Sửa lại ô nào thì tắt lời báo cũ — không để "tên quá ngắn" treo trên một tên đã đúng */
  useEffect(() => { setLoiForm(''); }, [form]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-diem-den'],
    queryFn: fetchDiemDenQuanTri,
  });

  const luu = useMutation({
    mutationFn: (f: Form) => luuDiemDen(f.id ?? null, {
      ten: f.ten, moTa: f.moTa,
      lat: chuanThapPhan(f.lat) === '' ? null : Number(chuanThapPhan(f.lat)),
      lng: chuanThapPhan(f.lng) === '' ? null : Number(chuanThapPhan(f.lng)),
      /* Đường hay ngập không có số liệu tai nạn: gửi 0 / rỗng, kể cả khi điểm này
         từng là điểm tai nạn và còn số cũ trong ô ẩn */
      soVu: f.loai === 'ngap' ? 0 : Number(f.soVu) || 0,
      soTuVong: f.loai === 'ngap' ? 0 : Number(f.soTuVong) || 0,
      soBiThuong: f.loai === 'ngap' ? 0 : Number(f.soBiThuong) || 0,
      kyThongKe: f.loai === 'ngap' ? '' : f.kyThongKe, mucDo: f.mucDo, khuyenCao: f.khuyenCao,
      loai: f.loai,
    }),
    onSuccess: (r) => {
      setThongBao(r.message);
      setForm(null);
      setLoiForm('');
      qc.invalidateQueries({ queryKey: ['admin-diem-den'] });
    },
    onError: (e: Error) => setLoiForm(e.message || 'Không lưu được, thử lại.'),
  });

  function moForm(f: Form) {
    setForm(f);
    setLoiForm('');
    setThongBao('');
  }

  function guiForm(e: React.FormEvent) {
    e.preventDefault();
    if (!form || luu.isPending) return;
    const loi = loiTruocKhiGui(form);
    if (loi) { setLoiForm(loi); return; }
    setLoiForm('');
    luu.mutate(form);
  }

  /** Ô toạ độ: dán cả cặp vào một ô thì tự tách sang hai ô */
  function doiToaDo(o: 'lat' | 'lng', v: string) {
    if (!form) return;
    const cap = tachCapToaDo(v);
    setForm(cap ? { ...form, lat: cap[0], lng: cap[1] } : { ...form, [o]: v });
  }

  const doiNgap = useMutation({
    mutationFn: ({ id, dangNgap }: { id: number; dangNgap: boolean }) => baoNgap(id, dangNgap),
    onSuccess: (r) => {
      setThongBao(r.message);
      qc.invalidateQueries({ queryKey: ['admin-diem-den'] });
    },
    onError: (e: Error) => setThongBao(e.message),
  });

  const doiHien = useMutation({
    mutationFn: ({ id, hien }: { id: number; hien: boolean }) => doiHienDiemDen(id, hien),
    onSuccess: (r) => {
      setThongBao(r.message);
      qc.invalidateQueries({ queryKey: ['admin-diem-den'] });
    },
    onError: (e: Error) => setThongBao(e.message),
  });

  function moSua(d: DiemDenQuanTri) {
    moForm({
      id: d.id, ten: d.ten, moTa: d.mo_ta ?? '',
      lat: d.lat === null ? '' : String(d.lat),
      lng: d.lng === null ? '' : String(d.lng),
      soVu: String(d.so_vu), soTuVong: String(d.so_tu_vong),
      soBiThuong: String(d.so_bi_thuong),
      kyThongKe: d.ky_thong_ke ?? '', mucDo: d.muc_do, khuyenCao: d.khuyen_cao ?? '',
      loai: d.loai === 'ngap' ? 'ngap' : 'tai_nan',
    });
  }

  const ds = data?.ds ?? [];
  const coBang = data?.coBang !== false;
  /* Chữ 16px trên điện thoại (text-base): dưới 16px thì Safari iPhone tự phóng to
     khi chạm vào ô, khung nhập trượt khỏi màn hình và hai nút ở đáy khó bấm. */
  const o = 'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-base outline-none focus:border-primary-500 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  const nhan = 'mb-0.5 block text-xs font-semibold text-slate-600 dark:text-slate-300';

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <TriangleAlert className="h-5 w-5 text-rose-500" /> Điểm đen giao thông
      </h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Các khu thường xảy ra tai nạn và các đường hay ngập, hiện công khai trên trang
        người dân để bà con đi qua cẩn thận hơn. Với đường hay ngập, <b>mọi cán bộ</b> có
        thể bấm "Đang ngập" / "Hết ngập" khi có mưa lớn.
      </p>

      {/* Dự báo mưa tự động (P51): mức Cảnh báo trở lên là lúc cử người đi xem
          các tuyến hay ngập — dự báo không tự bấm "Đang ngập" thay cán bộ */}
      <KhungDuBaoMua canBo />

      {thongBao && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
          {thongBao}
        </p>
      )}

      {laLanhDao ? (
        <button
          type="button"
          onClick={() => moForm({ ...TRONG })}
          className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" /> Thêm điểm cảnh báo
        </button>
      ) : (
        <p className="mb-4 text-xs italic text-slate-500 dark:text-slate-400">
          Chỉ chỉ huy và quản trị mới thêm và sửa số liệu.
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {/* PHÂN BIỆT RÕ hai trường hợp. Trước đây cả hai đều hỏi "đã chạy SQL
          chưa?" nên cán bộ đã chạy rồi vẫn bị hỏi, tưởng mình làm sai. */}
      {!isLoading && ds.length === 0 && (
        coBang ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <TriangleAlert className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Chưa có điểm cảnh báo nào.
              {laLanhDao && ' Bấm "Thêm điểm cảnh báo" ở trên để thêm.'}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Chưa tạo bảng dữ liệu
            </p>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-200">
              Cần chạy tệp <b>database/nang_cap_v18.sql</b> trên cơ sở dữ liệu, rồi tải
              lại trang này.
            </p>
          </div>
        )
      )}

      <div className="space-y-2">
        {ds.map((d) => {
          const m = MUC.find((x) => x.ma === d.muc_do) ?? MUC[1];
          const dangHien = Boolean(Number(d.is_published));
          const laNgap = d.loai === 'ngap';
          const dangNgap = laNgap && Boolean(Number(d.dang_ngap));
          return (
            <div
              key={d.id}
              className={`rounded-2xl border p-4 ${
                dangHien
                  ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  : 'border-slate-300 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/50'
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${m.mau}`}>{m.ten}</span>
                {d.dia_ban && <span className="text-xs text-slate-500">{d.dia_ban}</span>}
                {!dangHien && (
                  <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Đang ẩn
                  </span>
                )}
                {laNgap && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    <Waves className="h-3 w-3" /> Đường hay ngập
                  </span>
                )}
                {laNgap && dangNgap && (
                  <span className="rounded-lg bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">ĐANG NGẬP</span>
                )}
                {d.ky_thong_ke && <span className="ml-auto text-xs text-slate-400">{d.ky_thong_ke}</span>}
              </div>

              <p className="mb-2 font-bold text-slate-800 dark:text-slate-100">{d.ten}</p>

              {!laNgap && (
                <div className="mb-3 flex flex-wrap gap-4 text-sm">
                  <span><b className="text-slate-700 dark:text-slate-200">{d.so_vu}</b> vụ</span>
                  <span><b className="text-rose-600 dark:text-rose-400">{d.so_tu_vong}</b> tử vong</span>
                  <span><b className="text-amber-600 dark:text-amber-400">{d.so_bi_thuong}</b> bị thương</span>
                </div>
              )}

              {/* BÁO NGẬP — MỌI cán bộ thấy, KHÔNG nằm trong khối chỉ lãnh đạo bên dưới.
                  Chỉ hiện cho điểm loại 'ngap'. Bấm "Đang ngập" lại là kéo dài thêm 12 giờ. */}
              {laNgap && (
                <div data-khoi="bao-ngap" className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => doiNgap.mutate({ id: d.id, dangNgap: true })}
                    disabled={doiNgap.isPending}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    <Waves className="h-4 w-4" /> {dangNgap ? 'Báo lại: vẫn đang ngập' : 'Đang ngập'}
                  </button>
                  {dangNgap && (
                    <button
                      type="button"
                      onClick={() => doiNgap.mutate({ id: d.id, dangNgap: false })}
                      disabled={doiNgap.isPending}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border-2 border-emerald-500 px-3.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                    >
                      Hết ngập
                    </button>
                  )}
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {dangNgap ? 'Tự hết báo sau 12 giờ nếu không báo lại.' : 'Chưa có báo ngập.'}
                  </span>
                </div>
              )}

              {laLanhDao && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moSua(d)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => doiHien.mutate({ id: d.id, hien: !dangHien })}
                    disabled={doiHien.isPending}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
                  >
                    {dangHien
                      ? <><EyeOff className="h-3.5 w-3.5" /> Ẩn</>
                      : <><Eye className="h-3.5 w-3.5" /> Hiện lại</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============ Ô NHẬP ============
          Ba phần: đầu (tiêu đề) · thân (cuộn được) · chân (nút Thêm / Thôi
          LUÔN thấy). Trước đây cả khung cuộn chung, cao 92vh: trên điện thoại
          thanh công cụ trình duyệt che phần đáy nên bấm Thêm, Thôi không ăn.
          dvh = chiều cao màn hình THẬT đang thấy (trừ thanh công cụ); trình
          duyệt cũ không hiểu dvh thì dùng lớp max-h-[85vh]. */}
      {form && (
        <LopPhu>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4">
          <form
            onSubmit={guiForm}
            noValidate
            style={{ maxHeight: '88dvh' }}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
              <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                {form.id ? 'Sửa điểm cảnh báo' : 'Thêm điểm cảnh báo'}
              </h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Đóng"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 py-3">
              <div>
                <label className={nhan}>Loại điểm</label>
                <div className="flex gap-1.5">
                  {([['tai_nan', 'Điểm đen tai nạn'], ['ngap', 'Đường hay ngập']] as const).map(([ma, ten]) => (
                    <button key={ma} type="button"
                      onClick={() => setForm({ ...form, loai: ma })}
                      className={`min-h-[34px] flex-1 rounded-lg px-2 py-1 text-xs font-bold transition ${
                        form.loai === ma ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                      {ten}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={nhan}>Tên khu <span className="font-normal text-slate-400">(ví dụ: Ngã tư cầu Tân An)</span></label>
                <input type="text" value={form.ten} maxLength={200}
                  onChange={(e) => setForm({ ...form, ten: e.target.value })} className={o} />
              </div>

              <div>
                <label className={nhan}>Mức độ</label>
                <div className="flex gap-1.5">
                  {MUC.map((m) => (
                    <button key={m.ma} type="button"
                      onClick={() => setForm({ ...form, mucDo: m.ma })}
                      className={`min-h-[34px] flex-1 rounded-lg px-2 py-1 text-xs font-bold transition ${
                        form.mucDo === m.ma ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                      {m.ten}
                    </button>
                  ))}
                </div>
              </div>

              {form.loai === 'tai_nan' && (
              <div className="grid grid-cols-3 gap-2">
                {([['soVu', 'Số vụ'], ['soTuVong', 'Tử vong'], ['soBiThuong', 'Bị thương']] as const).map(([k, ten]) => (
                  <div key={k}>
                    <label className={nhan}>{ten}</label>
                    <input type="number" inputMode="numeric" min={0} value={form[k]}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={o} />
                  </div>
                ))}
              </div>
              )}

              {form.loai === 'tai_nan' && (
              <div>
                <label className={nhan}>Kỳ thống kê <span className="font-normal text-slate-400">(ví dụ: 01/2026 – 09/2026)</span></label>
                <input type="text" value={form.kyThongKe} maxLength={100}
                  onChange={(e) => setForm({ ...form, kyThongKe: e.target.value })} className={o} />
              </div>
              )}

              <div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={nhan}>Vĩ độ</label>
                    <input type="text" inputMode="decimal" value={form.lat} placeholder="10.8100000"
                      onChange={(e) => doiToaDo('lat', e.target.value)} className={o} />
                  </div>
                  <div>
                    <label className={nhan}>Kinh độ</label>
                    <input type="text" inputMode="decimal" value={form.lng} placeholder="105.2100000"
                      onChange={(e) => doiToaDo('lng', e.target.value)} className={o} />
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  Dán cả cặp số từ Google Maps vào ô Vĩ độ là tự tách. Bỏ trống thì điểm chỉ không hiện trên bản đồ.
                </p>
              </div>

              <div>
                <label className={nhan}>{form.loai === 'ngap' ? 'Đặc điểm ngập' : 'Đặc điểm nguy hiểm'}</label>
                <textarea value={form.moTa} rows={2} maxLength={2000}
                  placeholder={form.loai === 'ngap'
                    ? 'Ví dụ: Đoạn trũng, ngập sâu khi mưa lớn, xe máy hay chết máy.'
                    : 'Ví dụ: Khúc cua gấp, tầm nhìn bị che, hay xảy ra giờ tan tầm.'}
                  onChange={(e) => setForm({ ...form, moTa: e.target.value })} className={o} />
              </div>

              <div>
                <label className={nhan}>Khuyến cáo cho bà con</label>
                <textarea value={form.khuyenCao} rows={2} maxLength={2000}
                  placeholder={form.loai === 'ngap'
                    ? 'Ví dụ: Không lội qua khi nước chảy xiết, đi đường vòng theo biển chỉ dẫn.'
                    : 'Ví dụ: Giảm tốc độ, bật đèn, chú ý quan sát hai bên.'}
                  onChange={(e) => setForm({ ...form, khuyenCao: e.target.value })} className={o} />
              </div>
            </div>

            <div
              className="shrink-0 space-y-2 border-t border-slate-200 px-4 pt-2.5 dark:border-slate-700"
              style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom))' }}
            >
              {loiForm && (
                <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                  {loiForm}
                </p>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={luu.isPending}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60">
                  {luu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {form.id ? 'Lưu thay đổi' : 'Thêm'}
                </button>
                <button type="button" onClick={() => setForm(null)}
                  className="min-h-[44px] rounded-xl border-2 border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  Thôi
                </button>
              </div>
            </div>
          </form>
        </div>
        </LopPhu>
      )}
    </AdminLayout>
  );
}
