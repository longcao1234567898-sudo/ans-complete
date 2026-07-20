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
import { fetchMapData, type WardPoint } from '../../services/adminService';

/** Tâm bản đồ: thị xã Tân Châu, An Giang */
const CENTER: [number, number] = [10.81, 105.21];

/** Màu theo mức độ nóng */
function colorOf(w: WardPoint) {
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
] as const;

type MetricId = (typeof METRICS)[number]['id'];

export default function AdminMapPage() {
  const [metric, setMetric] = useState<MetricId>('total');

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-map'],
    queryFn: fetchMapData,
    refetchInterval: 60_000,
  });

  /** Lấy số liệu theo chế độ xem đang chọn */
  const valueOf = (w: { total: number; pending: number; overdue: number; to_giac: number }) =>
    metric === 'total' ? w.total
    : metric === 'pending' ? w.pending
    : metric === 'overdue' ? w.overdue
    : w.to_giac;

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

      {/* CHÚ GIẢI MÀU + số liệu đang xem */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-white/80 px-4 py-2.5 text-xs backdrop-blur-sm dark:bg-slate-800/80">
        <span className="font-bold text-slate-600 dark:text-slate-300">
          Đang xem: {METRICS.find((m) => m.id === metric)?.label} — tổng {totalShown}
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
        <span className="text-slate-400">Vòng tròn càng lớn = số vụ càng nhiều</span>
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
                      <div className="text-xs">
                        <p className="font-bold">{w.name}</p>
                        <p>Tổng: <b>{w.total}</b> ý kiến</p>
                        {w.pending > 0 && <p>Đang tồn: {w.pending}</p>}
                        {w.to_giac > 0 && <p>Tố giác tội phạm: {w.to_giac}</p>}
                        {w.overdue > 0 && <p className="font-bold text-rose-600">QUÁ HẠN: {w.overdue}</p>}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>

              {/* Chú giải */}
              <div className="flex flex-wrap gap-4 border-t border-slate-100 px-5 py-3 text-xs dark:border-slate-800">
                {[
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
                <p className="py-8 text-center text-sm text-slate-400">Chưa có dữ liệu địa bàn.</p>
              ) : (
                <div className="space-y-3">
                  {hot.map((w, i) => (
                    <div key={w.id} className="flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{w.name}</p>
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
