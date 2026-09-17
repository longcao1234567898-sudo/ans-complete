/**
 * TRANG CẢNH BÁO ĐIỂM ĐEN GIAO THÔNG — công khai cho người dân.
 *
 * VÌ SAO ĐÁNG LÀM: số liệu tai nạn giao thông là thông tin CÀNG NHIỀU NGƯỜI
 * BIẾT CÀNG TỐT. Một người biết "ngã tư này năm nay đã có ba vụ, một người
 * chết" thì tự khắc đi chậm lại khi qua đó. Đây là phòng ngừa rẻ nhất.
 *
 * ⚠️ KHÁC HẲN bản đồ ý kiến: ở đây KHÔNG che số. Số vụ tai nạn là số liệu công
 *    khai của ngành giao thông, không suy ra được danh tính ai. Che số ở đây
 *    chỉ làm mất tác dụng cảnh báo.
 */
import { useQuery } from '@tanstack/react-query';
import { useNgonNgu } from '../i18n/useNgonNgu';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { TriangleAlert, Loader2, Info, MapPin } from 'lucide-react';
import PageBackground from '../components/common/PageBackground';
import SpeakButton from '../components/common/SpeakButton';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';
const CENTER: [number, number] = [10.81, 105.21];

interface DiemDen {
  id: number;
  ten: string;
  moTa: string | null;
  lat: number | null;
  lng: number | null;
  soVu: number;
  soTuVong: number;
  soBiThuong: number;
  kyThongKe: string | null;
  mucDo: 'cao' | 'trung_binh' | 'thap';
  khuyenCao: string | null;
  diaBan: string | null;
}

const MUC = {
  cao: { ten: 'Rất nguy hiểm', mau: '#ef4444', lop: 'border-rose-400 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/15' },
  trung_binh: { ten: 'Cần chú ý', mau: '#f59e0b', lop: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/15' },
  thap: { ten: 'Lưu ý', mau: '#22c55e', lop: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/15' },
} as const;

async function fetchDiemDen(): Promise<DiemDen[]> {
  if (!API_URL) throw new Error('Chưa cấu hình địa chỉ máy chủ');
  const res = await fetch(`${API_URL}/api/diem-den`);
  if (!res.ok) throw new Error('Chưa xem được lúc này');
  return res.json();
}

export default function DiemDenGiaoThongPage() {
  const { t } = useNgonNgu();
  const { data, isLoading, error } = useQuery({
    queryKey: ['diem-den-giao-thong'],
    queryFn: fetchDiemDen,
  });

  const ds = data ?? [];
  const coToaDo = ds.filter((d) => d.lat !== null && d.lng !== null);
  const tongVu = ds.reduce((s, d) => s + d.soVu, 0);
  const tongTuVong = ds.reduce((s, d) => s + d.soTuVong, 0);

  /* Lời đọc cho người mắt kém — gộp thành một đoạn liền mạch. */
  const loiDoc = ds.length
    ? `Cảnh báo ${ds.length} khu thường xảy ra tai nạn giao thông trên địa bàn. `
      + `Tổng cộng ${tongVu} vụ, ${tongTuVong} người tử vong. `
      + `Các khu nguy hiểm nhất: `
      + ds.slice(0, 3).map((d) => `${d.ten}, ${d.soVu} vụ`).join('. ')
      + '. Bà con đi qua những nơi này xin đi chậm và quan sát kỹ.'
    : '';

  return (
    <div className="relative min-h-screen">
      <PageBackground anh="bg-lang-noi.webp" />

      <div className="container-page py-8">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          <TriangleAlert className="h-6 w-6 text-rose-600" /> {t('blackspot.title')}
        </h1>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t('dd.nhungKhuThuongXay')}
          <b> {t('dd.xinDiChamVa')}</b> {t('dd.bietTruocLaTranh')}
        </p>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {t('dd.dangTai')}
          </p>
        )}

        {error && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {t('dd.chuaXemDuocLuc')}
            </p>
          </div>
        )}

        {!isLoading && !error && ds.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t('dd.chuaCoDiemCanh')}
            </p>
          </div>
        )}

        {ds.length > 0 && (
          <>
            {/* SỐ LIỆU CHUNG */}
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="flex-1 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">{ds.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.khuCanChuY')}</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{tongVu}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.vuTaiNan')}</p>
              </div>
              <div className="flex-1 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-slate-700 dark:text-slate-200">{tongTuVong}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.nguoiTuVong')}</p>
              </div>
              {loiDoc && <SpeakButton text={loiDoc} label="Nghe" />}
            </div>

            {/* BẢN ĐỒ — chỉ hiện khi có điểm nào đã ghi toạ độ */}
            {coToaDo.length > 0 && (
              <div className="mb-5 overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
                <MapContainer center={CENTER} zoom={12} scrollWheelZoom style={{ height: 340, width: '100%' }}>
                  <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {coToaDo.map((d) => (
                    <CircleMarker
                      key={d.id}
                      center={[d.lat!, d.lng!]}
                      radius={8 + Math.min(14, d.soVu * 2)}
                      pathOptions={{
                        color: MUC[d.mucDo].mau,
                        fillColor: MUC[d.mucDo].mau,
                        fillOpacity: 0.55,
                        weight: 2,
                      }}
                    >
                      <LeafletTooltip direction="top">
                        <div className="text-xs">
                          <p className="font-bold">{d.ten}</p>
                          <p>{d.soVu} vụ · {d.soTuVong} tử vong</p>
                        </div>
                      </LeafletTooltip>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            )}

            {/* DANH SÁCH CHI TIẾT */}
            <div className="space-y-3">
              {ds.map((d) => (
                <div key={d.id} className={`rounded-2xl border-2 p-4 ${MUC[d.mucDo].lop}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-lg px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: MUC[d.mucDo].mau }}
                    >
                      {MUC[d.mucDo].ten}
                    </span>
                    {d.diaBan && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">{d.diaBan}</span>
                    )}
                    {d.kyThongKe && (
                      <span className="ml-auto text-xs text-slate-400">{d.kyThongKe}</span>
                    )}
                  </div>

                  <p className="mb-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
                    {d.ten}
                  </p>

                  {/* Ba con số đặt cạnh nhau, số tử vong to nhất vì đó là điều
                      bà con cần thấy trước tiên. */}
                  <div className="mb-3 flex flex-wrap gap-4">
                    <div>
                      <p className="text-xl font-extrabold text-slate-700 dark:text-slate-200">{d.soVu}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.vuTaiNan')}</p>
                    </div>
                    <div>
                      <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400">{d.soTuVong}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.nguoiTuVong')}</p>
                    </div>
                    <div>
                      <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{d.soBiThuong}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('dd.nguoiBiThuong')}</p>
                    </div>
                  </div>

                  {d.moTa && (
                    <p className="mb-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {d.moTa}
                    </p>
                  )}

                  {d.khuyenCao && (
                    <p className="rounded-xl bg-white/70 p-3 text-sm font-semibold leading-snug text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                      Khuyến cáo: {d.khuyenCao}
                    </p>
                  )}

                  {d.lat !== null && d.lng !== null && (
                    <a
                      href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary-700 underline dark:text-primary-300"
                    >
                      <MapPin className="h-3.5 w-3.5" /> {t('dd.xemTrenBanDo')}
                    </a>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {t('dd.soLieuDoCong')}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
