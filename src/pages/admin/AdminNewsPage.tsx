/**
 * TRANG QUẢN LÝ TIN TỨC — cán bộ tự đăng, sửa, ẩn tin ngay trên web.
 *
 * VÌ SAO CẦN: trước đây muốn đăng tin phải viết câu lệnh SQL rồi chạy trong
 * HeidiSQL. Cán bộ thường không làm được, nên mục tin tức đứng im — mà tin cảnh
 * giác lừa đảo lại là thứ cần cập nhật liên tục nhất.
 *
 * ⚠️ Mọi vai trò XEM được danh sách; chỉ chỉ huy và quản trị VIẾT, SỬA, ẨN.
 *    Cán bộ thường thấy dòng giải thích thay vì thấy nút rồi bấm vào bị từ chối.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Newspaper, Plus, Pencil, Eye, EyeOff, Loader2, Star, X, Save,
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import {
  fetchTinQuanTri, fetchMotTin, dangTinMoi, suaTin, doiHienTin,
  type TinQuanTri,
} from '../../services/adminService';

const NHOM = [
  { ma: 'warning', ten: 'Cảnh giác', mau: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  { ma: 'security', ten: 'An ninh trật tự', mau: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300' },
  { ma: 'guide', ten: 'Hướng dẫn thủ tục', mau: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  { ma: 'document', ten: 'Văn bản mới', mau: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
] as const;

const TIN_TRONG: Partial<TinQuanTri> = {
  title: '', summary: '', content: '', category: 'warning',
  image_url: '', source_name: '', source_url: '', is_featured: 0,
};

export default function AdminNewsPage() {
  const qc = useQueryClient();
  const { staff } = useAdminAuth();
  const laLanhDao = staff?.role === 'admin' || staff?.role === 'manager';

  const [hienCaAn, setHienCaAn] = useState(false);
  const [dangSua, setDangSua] = useState<Partial<TinQuanTri> | null>(null);
  const [thongBao, setThongBao] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-news', hienCaAn],
    queryFn: () => fetchTinQuanTri(hienCaAn),
  });

  const luu = useMutation({
    mutationFn: (tin: Partial<TinQuanTri>) =>
      tin.id ? suaTin(tin.id, tin) : dangTinMoi(tin),
    onSuccess: (r) => {
      setThongBao(r.message);
      setDangSua(null);
      qc.invalidateQueries({ queryKey: ['admin-news'] });
    },
    onError: (e: Error) => setThongBao(e.message),
  });

  const doiHien = useMutation({
    mutationFn: ({ id, hien }: { id: number; hien: boolean }) => doiHienTin(id, hien),
    onSuccess: (r) => {
      setThongBao(r.message);
      qc.invalidateQueries({ queryKey: ['admin-news'] });
    },
    onError: (e: Error) => setThongBao(e.message),
  });

  async function moSua(id: number) {
    try {
      setDangSua(await fetchMotTin(id));
    } catch {
      setThongBao('Không tải được tin để sửa.');
    }
  }

  const ds = data ?? [];

  return (
    <AdminLayout>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
        <Newspaper className="h-5 w-5 text-slate-400" /> Quản lý tin tức
      </h1>
      <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Đăng và sửa tin hiện trên trang người dân. Tin <b>cảnh giác lừa đảo</b> nên cập
        nhật thường xuyên nhất — đó là thứ bà con cần biết sớm.
      </p>

      {thongBao && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300">
          {thongBao}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {laLanhDao && (
          <button
            type="button"
            onClick={() => { setDangSua({ ...TIN_TRONG }); setThongBao(''); }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> Đăng tin mới
          </button>
        )}
        <button
          type="button"
          onClick={() => setHienCaAn((v) => !v)}
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {hienCaAn ? 'Chỉ xem tin đang hiện' : 'Xem cả tin đã ẩn'}
        </button>
        {!laLanhDao && (
          <span className="text-xs italic text-slate-500 dark:text-slate-400">
            Chỉ chỉ huy và quản trị mới đăng và sửa tin.
          </span>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}

      {!isLoading && ds.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Chưa có tin nào.
        </p>
      )}

      <div className="space-y-2">
        {ds.map((t) => {
          const nhom = NHOM.find((n) => n.ma === t.category) ?? NHOM[0];
          const dangHien = Boolean(Number(t.is_published));
          return (
            <div
              key={t.id}
              className={`rounded-2xl border p-4 ${
                dangHien
                  ? 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  : 'border-slate-300 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/50'
              }`}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${nhom.mau}`}>
                  {nhom.ten}
                </span>
                {Boolean(Number(t.is_featured)) && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Star className="h-3 w-3" /> Nổi bật
                  </span>
                )}
                {!dangHien && (
                  <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    Đang ẩn
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  {t.published_at ? new Date(t.published_at).toLocaleDateString('vi-VN') : ''}
                </span>
              </div>

              <p className="mb-1 font-bold leading-snug text-slate-800 dark:text-slate-100">
                {t.title}
              </p>
              <p className="mb-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                {t.summary}
              </p>

              {laLanhDao && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => moSua(t.id)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa
                  </button>
                  <button
                    type="button"
                    onClick={() => doiHien.mutate({ id: t.id, hien: !dangHien })}
                    disabled={doiHien.isPending}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border-2 border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300"
                  >
                    {dangHien
                      ? <><EyeOff className="h-3.5 w-3.5" /> Ẩn khỏi trang dân</>
                      : <><Eye className="h-3.5 w-3.5" /> Hiện lại</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ============ Ô SOẠN TIN ============ */}
      {dangSua && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
                {dangSua.id ? 'Sửa tin' : 'Đăng tin mới'}
              </h2>
              <button
                type="button"
                onClick={() => setDangSua(null)}
                aria-label="Đóng"
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nhóm tin
            </label>
            <div className="mb-3 flex flex-wrap gap-2">
              {NHOM.map((n) => (
                <button
                  key={n.ma}
                  type="button"
                  onClick={() => setDangSua((d) => ({ ...d!, category: n.ma }))}
                  className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    dangSua.category === n.ma
                      ? 'bg-primary-600 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {n.ten}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Tiêu đề <span className="font-normal text-slate-400">(ít nhất 10 ký tự)</span>
            </label>
            <input
              type="text"
              value={dangSua.title ?? ''}
              onChange={(e) => setDangSua((d) => ({ ...d!, title: e.target.value }))}
              maxLength={255}
              className="mb-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Tóm tắt <span className="font-normal text-slate-400">(hiện ở danh sách tin)</span>
            </label>
            <textarea
              value={dangSua.summary ?? ''}
              onChange={(e) => setDangSua((d) => ({ ...d!, summary: e.target.value }))}
              rows={3}
              maxLength={1000}
              className="mb-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Nội dung đầy đủ <span className="font-normal text-slate-400">(không bắt buộc)</span>
            </label>
            <textarea
              value={dangSua.content ?? ''}
              onChange={(e) => setDangSua((d) => ({ ...d!, content: e.target.value }))}
              rows={8}
              maxLength={20000}
              className="mb-3 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />

            <div className="mb-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Nguồn tin
                </label>
                <input
                  type="text"
                  value={dangSua.source_name ?? ''}
                  onChange={(e) => setDangSua((d) => ({ ...d!, source_name: e.target.value }))}
                  placeholder="Ví dụ: Công an thị xã Tân Châu"
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Đường dẫn bài gốc
                </label>
                <input
                  type="url"
                  value={dangSua.source_url ?? ''}
                  onChange={(e) => setDangSua((d) => ({ ...d!, source_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <label className="mb-4 flex cursor-pointer items-start gap-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-900/15">
              <input
                type="checkbox"
                checked={Boolean(Number(dangSua.is_featured))}
                onChange={(e) => setDangSua((d) => ({ ...d!, is_featured: e.target.checked ? 1 : 0 }))}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm text-amber-800 dark:text-amber-200">
                <b>Tin nổi bật</b> — hiện trong băng chuyền đầu trang tin tức. Chỉ nên đánh
                dấu vài tin quan trọng nhất, đánh dấu nhiều thì mất tác dụng.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => luu.mutate(dangSua)}
                disabled={luu.isPending}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60"
              >
                {luu.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {dangSua.id ? 'Lưu thay đổi' : 'Đăng tin'}
              </button>
              <button
                type="button"
                onClick={() => setDangSua(null)}
                className="min-h-[44px] rounded-xl border-2 border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                Thôi
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
