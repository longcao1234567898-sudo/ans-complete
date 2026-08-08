/**
 * BẢN ĐỒ ĐIỂM NÓNG — chấm các địa bàn lên bản đồ thật (OpenStreetMap).
 * Vòng tròn càng TO và càng ĐỎ = địa bàn càng nhiều vụ việc / nhiều tố giác.
 * Giúp lãnh đạo nhìn ra ngay khu vực cần tăng cường tuần tra.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import { Loader2, MapPin, AlertTriangle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { UNIT } from '../../utils/constants';
import AdminLayout from '../../components/admin/AdminLayout';
import { fetchMapData, type WardPoint, tinhXuHuong } from '../../services/adminService';

/** Tâm bản đồ: thị xã Tân Châu, An Giang */
const CENTER: [number, number] = [10.81, 105.21];

/** Màu theo mức độ nóng */
function colorOf(w: WardPoint) {
  if (w.khan_cap > 0) return '#B71C1C';     // đỏ đậm — có vụ KHẨN CẤP
  if (w.overdue > 0) return '#C62828';      // đỏ — có vụ quá hạn
  if (w.to_giac > 0) return '#EF6C00';      // cam — có tố giác tội phạm
  if (w.pending > 0) return '#F9A825';      // vàng — còn tồn đọng
  if (w.total > 0) return '#1B5E20';        // xanh — đã xử lý xong
  return '#94A3B8';                          // xám — chưa có vụ việc
}

/** Bán kính vòng tròn theo số vụ việc */
function radiusOf(total: number, max: number) {
  if (total === 0) return 6;
  const ratio = max > 0 ? total / max : 0;
  return 8 + ratio * 22; // 8 -> 30 px
}

/** Các chế độ xem bản đồ — đổi tiêu chí tô màu và kích thước vòng tròn */
const METRICS = [
  { id: 'total', label: 'Tổng ý kiến', desc: 'Toàn bộ ý kiến đã nhận' },
  { id: 'pending', label: 'Đang tồn đọng', desc: 'Chưa xử lý xong' },
  { id: 'overdue', label: 'Quá hạn', desc: 'Đã quá hạn xử lý' },
  { id: 'to_giac', label: 'Tố giác', desc: 'Riêng nhóm tố giác tin báo' },
  { id: 'khan_cap', label: 'Khẩn cấp', desc: 'Vụ việc đánh dấu mức khẩn cấp' },
] as const;

type MetricId = (typeof METRICS)[number]['id'];

/* ---------------------------------------------------------------------------
   KHUNG THỜI GIAN

   Đây là điểm khác biệt giữa "bản đồ điểm nóng" và "bảng cộng dồn".
   Không lọc thời gian thì một địa bàn nhiều vụ từ năm ngoái, đã giải quyết
   xong hết, vẫn hiện đỏ y như địa bàn đang có vụ việc tuần này — lãnh đạo
   nhìn vào không biết nên dồn lực vào đâu.
   --------------------------------------------------------------------------- */
const KHUNG_THOI_GIAN = [
  { ngay: 7, label: '7 ngày' },
  { ngay: 30, label: '30 ngày' },
  { ngay: 90, label: '90 ngày' },
  { ngay: 0, label: 'Toàn bộ' },
] as const;

export default function AdminMapPage() {
  const [metric, setMetric] = useState<MetricId>('total');
  const [ngay, setNgay] = useState<number>(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-map', ngay],
    queryFn: () => fetchMapData(ngay),
    refetchInterval: 60_000,
  });

  /** Lấy số liệu theo chế độ xem đang chọn */
  const valueOf = (w: WardPoint) =>
    metric === 'total' ? w.total
    : metric === 'pending' ? w.pending
    : metric === 'overdue' ? w.overdue
    : metric === 'to_giac' ? w.to_giac
    : w.khan_cap;

  const max = data ? Math.max(...data.map(valueOf), 1) : 1;
  const hot = data
    ? [...data].filter((w) => valueOf(w) > 0).sort((a, b) => valueOf(b) - valueOf(a)).slice(0, 5)
    : [];
  const totalOverdue = data ? data.reduce((s, w) => s + w.overdue, 0) : 0;
  const totalShown = data ? data.reduce((s, w) => s + valueOf(w), 0) : 0;

  return (
    <AdminLayout>
      <h1 className="mb-1 text-xl font-extrabold text-slate-800 dark:text-slate-100">Bản đồ điểm nóng</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Phân bố ý kiến, phản ánh, tố giác theo địa bàn {UNIT.communeName}.
      </p>

      {/* CHỌN CHẾ ĐỘ XEM — đổi tiêu chí hiển thị trên bản đồ */}
      <div className="mb-4 flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetric(m.id)}
            title={m.desc}
            className={`min-h-[40px] rounded-xl px-4 py-2 text-sm font-bold transition ${
              metric === m.id
                ? 'bg-primary-600 text-white shadow-soft'
                : 'bg-white text-slate-600 hover:bg-primary-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* CHỌN KHUNG THỜI GIAN — quyết định bản đồ là "điểm nóng" hay "cộng dồn" */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
          Khoảng thời gian:
        </span>
        {KHUNG_THOI_GIAN.map((k) => (
          <button
            key={k.ngay}
            onClick={() => setNgay(k.ngay)}
            title={k.ngay === 0 ? 'Gộp toàn bộ lịch sử' : `Chỉ tính ${k.label} gần nhất`}
            className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              ngay === k.ngay
                ? 'bg-secondary-500 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {k.label}
          </button>
        ))}
        {ngay === 0 && (
          <span className="text-xs italic text-slate-500 dark:text-slate-400">
            Đang gộp toàn bộ lịch sử — địa bàn đã xử lý xong từ lâu vẫn hiện
          </span>
        )}
      </div>

      {/* CHÚ GIẢI MÀU + số liệu đang xem */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-white/80 px-4 py-2.5 text-xs backdrop-blur-sm dark:bg-slate-800/80">
        <span className="font-bold text-slate-600 dark:text-slate-300">
          Đang xem: {METRICS.find((m) => m.id === metric)?.label} — tổng {totalShown}
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 rounded-full" style={{ background: '#B71C1C' }} /> Có khẩn cấp
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 rounded-full" style={{ background: '#C62828' }} /> Có quá hạn
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 rounded-full" style={{ background: '#F9A825' }} /> Còn tồn đọng
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 rounded-full" style={{ background: '#1B5E20' }} /> Đã xử lý xong
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <span className="h-3 w-3 rounded-full" style={{ background: '#94A3B8' }} /> Chưa có vụ việc
        </span>
        <span className="text-slate-500">Vòng tròn càng lớn = số vụ càng nhiều</span>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải bản đồ...
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{(error as Error).message}</div>
      )}

      {data && (
        <>
          {totalOverdue > 0 && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/10">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">
                {totalOverdue} vụ việc quá hạn đang tồn đọng trên địa bàn — xem các chấm ĐỎ trên bản đồ.
              </p>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Bản đồ */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900 lg:col-span-2">
              <MapContainer
                center={CENTER}
                zoom={11}
                scrollWheelZoom
                style={{ height: 460, width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; OpenStreetMap'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {data.map((w) => (
                  <CircleMarker
                    key={w.id}
                    center={[w.lat, w.lng]}
                    radius={radiusOf(valueOf(w), max)}
                    pathOptions={{
                      color: colorOf(w),
                      fillColor: colorOf(w),
                      fillOpacity: 0.55,
                      weight: 2,
                    }}
                  >
                    <LeafletTooltip direction="top" offset={[0, -4]}>
                      {/* Cơ cấu vụ việc của địa bàn — biết địa bàn "nóng" vì
                          chuyện gì, để phân công đúng cán bộ phụ trách nhóm đó */}
                      <div className="text-xs">
                        <p className="font-bold">{w.name}</p>
                        <p>Tổng: <b>{w.total}</b> ý kiến</p>
                        {w.khan_cap > 0 && (
                          <p className="font-bold text-rose-700">KHẨN CẤP: {w.khan_cap}</p>
                        )}
                        {w.overdue > 0 && (
                          <p className="font-bold text-rose-600">QUÁ HẠN: {w.overdue}</p>
                        )}
                        {w.pending > 0 && <p>Đang tồn: {w.pending}</p>}

                        {/* XU HƯỚNG — câu hỏi lãnh đạo cần trả lời nhất:
                            địa bàn này đang nặng lên hay nhẹ đi? */}
                        {(() => {
                          const xh = tinhXuHuong(w, ngay === 0);
                          if (xh.huong === 'khong_ro' || w.total === 0) return null;
                          const mau =
                            xh.huong === 'tang' ? 'text-rose-700 font-bold'
                            : xh.huong === 'giam' ? 'text-emerald-700 font-semibold'
                            : xh.huong === 'moi' ? 'text-amber-700 font-bold'
                            : 'text-slate-600';
                          const mui =
                            xh.huong === 'tang' ? '▲'
                            : xh.huong === 'giam' ? '▼'
                            : xh.huong === 'moi' ? '★' : '—';
                          return <p className={'mt-1 ' + mau}>{mui} {xh.nhan}</p>;
                        })()}

                        {w.total > 0 && (
                          <div className="mt-1 border-t border-slate-200 pt-1">
                            <p className="font-semibold">Cơ cấu:</p>
                            {w.to_giac > 0 && <p>· Tố giác: {w.to_giac}</p>}
                            {w.khieu_nai > 0 && <p>· Khiếu nại: {w.khieu_nai}</p>}
                            {w.phan_anh > 0 && <p>· Phản ánh: {w.phan_anh}</p>}
                            {w.de_xuat > 0 && <p>· Đề xuất: {w.de_xuat}</p>}
                          </div>
                        )}

                        {w.gan_nhat && (
                          <p className="mt-1 italic text-slate-500">
                            Gần nhất: {new Date(w.gan_nhat).toLocaleDateString('vi-VN')}
                          </p>
                        )}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>

              {/* Chú giải */}
              <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-3 text-xs dark:border-slate-800">
                {[
                  ['#B71C1C', 'Có vụ khẩn cấp'],
                  ['#C62828', 'Có vụ quá hạn'],
                  ['#EF6C00', 'Có tố giác tội phạm'],
                  ['#F9A825', 'Còn tồn đọng'],
                  ['#1B5E20', 'Đã xử lý xong'],
                  ['#94A3B8', 'Chưa có vụ việc'],
                ].map(([c, label]) => (
                  <span key={label} className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <span className="h-3 w-3 rounded-full" style={{ background: c }} /> {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Bảng xếp hạng địa bàn nóng */}
            <div className="rounded-2xl bg-white p-5 shadow-soft dark:bg-slate-900">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                <MapPin className="h-4 w-4 text-primary-600" /> Địa bàn nhiều vụ việc nhất
              </h3>
              {hot.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Chưa có dữ liệu địa bàn.</p>
              ) : (
                <div className="space-y-3">
                  {hot.map((w, i) => (
                    <div key={w.id} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                          <span className="truncate">{w.name}</span>
                          {/* Nhãn xu hướng ngay cạnh tên: nhìn bảng xếp hạng là
                              biết ngay địa bàn nào đang xấu đi, không phải rê
                              chuột lên từng chấm trên bản đồ. */}
                          {(() => {
                            const xh = tinhXuHuong(w, ngay === 0);
                            if (xh.huong === 'tang') {
                              return <span className="shrink-0 rounded bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">▲ {xh.phanTram}%</span>;
                            }
                            if (xh.huong === 'moi') {
                              return <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">★ mới</span>;
                            }
                            if (xh.huong === 'giam') {
                              return <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">▼ {Math.abs(xh.phanTram ?? 0)}%</span>;
                            }
                            return null;
                          })()}
                        </p>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(w.total / max) * 100}%`, background: colorOf(w) }}
                          />
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-extrabold" style={{ color: colorOf(w) }}>
                        {w.total}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                Vòng tròn càng lớn = càng nhiều ý kiến. Màu đỏ = có vụ quá hạn cần xử lý ngay.
                Dùng bản đồ này để bố trí lực lượng tuần tra hợp lý.
              </p>
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
