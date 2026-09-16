/**
 * TRANG QUẢN LÝ ĐIỂM ĐEN GIAO THÔNG — cán bộ cập nhật số liệu tai nạn.
 *
 * ⚠️ Mọi vai trò XEM được (cán bộ cơ sở cần biết địa bàn mình có điểm nào nguy
 *    hiểm), chỉ chỉ huy và quản trị THÊM, SỬA, ẨN. Số liệu tai nạn là số liệu
 *    chính thức của đơn vị, phải qua người có trách nhiệm.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert, Plus, Pencil, Eye, EyeOff, Loader2, X, Save } from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  fetchDiemDenQuanTri, luuDiemDen, doiHienDiemDen, type DiemDenQuanTri,
} from '../../services/adminService';

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
};

const TRONG: Form = {
  ten: '', moTa: '', lat: '', lng: '',
  soVu: '0', soTuVong: '0', soBiThuong: '0',
  kyThongKe: '', mucDo: 'trung_binh', khuyenCao: '',
};

export default function AdminDiemDenPage() {
  const qc = useQueryClient();
  const { staff } = useAdminAuth();
  const laLanhDao = staff?.role === 'admin' || staff?.role === 'manager';

  const [form, setForm] = useState<Form | null>(null);
  const [thongBao, setThongBao] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-diem-den'],
    queryFn: fetchDiemDenQuanTri,
  });

  const luu = useMutation({
    mutationFn: (f: Form) => luuDiemDen(f.id ?? null, {
      ten: f.ten, moTa: f.moTa,
      lat: f.lat === '' ? null : Number(f.lat),
      lng: f.lng === '' ? null : Number(f.lng),
      soVu: Number(f.soVu) || 0,
      soTuVong: Number(f.soTuVong) || 0,
      soBiThuong: Number(f.soBiThuong) || 0,
      kyThongKe: f.kyThongKe, mucDo: f.mucDo, khuyenCao: f.khuyenCao,
    }),
    onSuccess: (r) => {
      setThongBao(r.message);
      setForm(null);
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
    setForm({
      id: d.id, ten: d.ten, moTa: d.mo_ta ?? '',
      lat: d.lat === null ? '' : String(d.lat),
      lng: d.lng === null ? '' : String(d.lng),
      soVu: String(d.so_vu), soTuVong: String(d.so_tu_vong),
      soBiThuong: String(d.so_bi_thuong),
      kyThongKe: d.ky_thong_ke ?? '', mucDo: d.muc_do, khuyenCao: d.khuyen_cao ?? '',
    });
    setThongBao('');
  }

  const ds = data ?? [];
  const o = 'w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
  const nhan = 'mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200';

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <TriangleAlert className="h-5 w-5 text-rose-500" /> Điểm đen giao thông
      </h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Các khu thường xảy ra tai nạn, hiện công khai trên trang người dân để bà con
        đi qua cẩn thận hơn.
      </p>

      {thongBao && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
          {thongBao}
        </p>
      )}

      {laLanhDao ? (
        <button
          type="button"
          onClick={() => { setForm({ ...TRONG }); setThongBao(''); }}
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

      {!isLoading && ds.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Chưa có điểm nào. Đã chạy nang_cap_v18.sql chưa?
        </p>
      )}

      <div className="space-y-2">
        {ds.map((d) => {
          const m = MUC.find((x) => x.ma === d.muc_do) ?? MUC[1];
          const dangHien = Boolean(Number(d.is_published));
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
                {d.ky_thong_ke && <span className="ml-auto text-xs text-slate-400">{d.ky_thong_ke}</span>}
              </div>

              <p className="mb-2 font-bold text-slate-800 dark:text-slate-100">{d.ten}</p>

              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <span><b className="text-slate-700 dark:text-slate-200">{d.so_vu}</b> vụ</span>
                <span><b className="text-rose-600 dark:text-rose-400">{d.so_tu_vong}</b> tử vong</span>
                <span><b className="text-amber-600 dark:text-amber-400">{d.so_bi_thuong}</b> bị thương</span>
              </div>

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

      {/* ============ Ô NHẬP ============ */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                {form.id ? 'Sửa điểm cảnh báo' : 'Thêm điểm cảnh báo'}
              </h2>
              <button type="button" onClick={() => setForm(null)} aria-label="Đóng"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className={nhan}>Tên khu <span className="font-normal text-slate-400">(ví dụ: Ngã tư cầu Tân An)</span></label>
            <input type="text" value={form.ten} maxLength={200}
              onChange={(e) => setForm({ ...form, ten: e.target.value })} className={`${o} mb-3`} />

            <label className={nhan}>Mức độ</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {MUC.map((m) => (
                <button key={m.ma} type="button"
                  onClick={() => setForm({ ...form, mucDo: m.ma })}
                  className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    form.mucDo === m.ma ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                  {m.ten}
                </button>
              ))}
            </div>

            <div className="mb-3 grid grid-cols-3 gap-3">
              <div>
                <label className={nhan}>Số vụ</label>
                <input type="number" min={0} value={form.soVu}
                  onChange={(e) => setForm({ ...form, soVu: e.target.value })} className={o} />
              </div>
              <div>
                <label className={nhan}>Tử vong</label>
                <input type="number" min={0} value={form.soTuVong}
                  onChange={(e) => setForm({ ...form, soTuVong: e.target.value })} className={o} />
              </div>
              <div>
                <label className={nhan}>Bị thương</label>
                <input type="number" min={0} value={form.soBiThuong}
                  onChange={(e) => setForm({ ...form, soBiThuong: e.target.value })} className={o} />
              </div>
            </div>

            <label className={nhan}>Kỳ thống kê <span className="font-normal text-slate-400">(ví dụ: Từ 01/2026 đến 09/2026)</span></label>
            <input type="text" value={form.kyThongKe} maxLength={100}
              onChange={(e) => setForm({ ...form, kyThongKe: e.target.value })} className={`${o} mb-3`} />

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className={nhan}>Vĩ độ</label>
                <input type="text" value={form.lat} placeholder="10.8100000"
                  onChange={(e) => setForm({ ...form, lat: e.target.value })} className={o} />
              </div>
              <div>
                <label className={nhan}>Kinh độ</label>
                <input type="text" value={form.lng} placeholder="105.2100000"
                  onChange={(e) => setForm({ ...form, lng: e.target.value })} className={o} />
              </div>
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Lấy toạ độ: mở Google Maps, bấm chuột phải vào vị trí, chọn dãy số hiện ra.
              Không có toạ độ thì điểm vẫn hiện trong danh sách, chỉ không hiện trên bản đồ.
            </p>

            <label className={nhan}>Đặc điểm nguy hiểm</label>
            <textarea value={form.moTa} rows={3} maxLength={2000}
              placeholder="Ví dụ: Khúc cua gấp, tầm nhìn bị che bởi hàng cây, hay xảy ra vào giờ tan tầm."
              onChange={(e) => setForm({ ...form, moTa: e.target.value })} className={`${o} mb-3`} />

            <label className={nhan}>Khuyến cáo cho bà con</label>
            <textarea value={form.khuyenCao} rows={2} maxLength={2000}
              placeholder="Ví dụ: Giảm tốc độ, bật đèn khi qua đoạn này, chú ý quan sát hai bên."
              onChange={(e) => setForm({ ...form, khuyenCao: e.target.value })} className={`${o} mb-4`} />

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => luu.mutate(form)} disabled={luu.isPending}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60">
                {luu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.id ? 'Lưu thay đổi' : 'Thêm'}
              </button>
              <button type="button" onClick={() => setForm(null)}
                className="min-h-[44px] rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
                Thôi
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
