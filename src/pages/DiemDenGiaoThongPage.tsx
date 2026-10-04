/**
 * TRANG CẢNH BÁO ĐIỂM ĐEN GIAO THÔNG — công khai cho người dân.
 *
 * Hai loại điểm (P50): ĐIỂM ĐEN TAI NẠN (số liệu của ngành giao thông) và ĐƯỜNG
 * HAY NGẬP (trạng thái "đang ngập" do cán bộ xác nhận, máy chủ tự hết hạn sau 12
 * giờ). Hai loại tách phần riêng: số vụ, số người chết chỉ tính trên điểm tai nạn.
 * Mỗi điểm có nút chỉ đường bằng Google Maps — chỉ là liên kết, không gọi API.
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
import { TriangleAlert, Loader2, Info, MapPin, Waves, Navigation } from 'lucide-react';
import PageBackground from '../components/common/PageBackground';
import SpeakButton from '../components/common/SpeakButton';
import { linkChiDuong, dinhDangGioNgap } from '../utils/duongNgap';
import KhungDuBaoMua from '../components/DuBaoMua/KhungDuBaoMua';
import { useDuBaoMua } from '../hooks/useDuBaoMua';
import { coNguyCoNgap, HIEN_MUC, type MucMua } from '../utils/duBaoMua';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '') || '';
/* Tâm bản đồ: phường Chánh Hiệp, TP. Hồ Chí Minh (khu vực Định Hoà và
   Tương Bình Hiệp cũ, phía bắc trung tâm Thủ Dầu Một). */
const CENTER: [number, number] = [11.0105, 106.6525];

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
  /** vắng (máy chủ cũ) = điểm tai nạn */
  loai?: 'tai_nan' | 'ngap';
  dangNgap?: boolean;
  ngapLuc?: string | null;
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

  /* Cùng truy vấn với KhungDuBaoMua (cùng khoá) -> chỉ một lượt gọi máy chủ */
  const { data: duBao } = useDuBaoMua();
  /* Dự báo mưa to trở lên: đường hay ngập được ghi "Nguy cơ ngập". KHÔNG bao giờ
     thành "đang ngập" — "đang ngập" chỉ đến từ cán bộ xác nhận (d.dangNgap). */
  const nguyCo = coNguyCoNgap(duBao);

  const ds = data ?? [];
  const taiNan = ds.filter((d) => d.loai !== 'ngap');
  const ngap = ds.filter((d) => d.loai === 'ngap');
  const dangNgap = ngap.filter((d) => d.dangNgap);
  const coToaDo = ds.filter((d) => d.lat !== null && d.lng !== null);
  const tongVu = taiNan.reduce((s, d) => s + d.soVu, 0);
  const tongTuVong = taiNan.reduce((s, d) => s + d.soTuVong, 0);

  /* Lời đọc cho người mắt kém — gộp thành một đoạn liền mạch. Báo ngập đọc trước. */
  const loiDoc = [
    nguyCo && duBao?.muc !== undefined
      ? `Dự báo mưa: mức ${HIEN_MUC[duBao.muc as MucMua].ten}. ${HIEN_MUC[duBao.muc as MucMua].loiKhuyen}`
      : '',
    dangNgap.length
      ? `Đang có ${dangNgap.length} tuyến đường ngập: ${dangNgap.map((d) => d.ten).join('. ')}. Bà con tránh đi qua hoặc đi thật cẩn thận.`
      : '',
    taiNan.length
      ? `Cảnh báo ${taiNan.length} khu thường xảy ra tai nạn giao thông trên địa bàn. `
        + `Tổng cộng ${tongVu} vụ, ${tongTuVong} người tử vong. `
        + `Các khu nguy hiểm nhất: `
        + taiNan.slice(0, 3).map((d) => `${d.ten}, ${d.soVu} vụ`).join('. ')
        + '. Bà con đi qua những nơi này xin đi chậm và quan sát kỹ.'
      : '',
  ].filter(Boolean).join(' ');

  /** Nút Google Maps của một điểm: chỉ đường + xem vị trí. Chỉ hiện khi có toạ độ hợp lệ. */
  const NutBanDo = ({ d }: { d: DiemDen }) => {
    const chiDuong = linkChiDuong(d.lat, d.lng);
    if (!chiDuong) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={chiDuong}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[32px] items-center gap-1 text-xs font-bold text-primary-700 underline dark:text-primary-300"
        >
          <Navigation className="h-3.5 w-3.5" /> Chỉ đường (Google Maps)
        </a>
        <a
          href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[32px] items-center gap-1 text-xs font-bold text-primary-700 underline dark:text-primary-300"
        >
          <MapPin className="h-3.5 w-3.5" /> {t('dd.xemTrenBanDo')}
        </a>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen">
      {/* Ảnh nền: khu vực có tuyến đường đông xe */}
      <PageBackground anh="bg-lo-lu-dai-hung.webp" />

      <div className="container-page py-8">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          <TriangleAlert className="h-6 w-6 text-rose-600" /> {t('blackspot.title')}
        </h1>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {t('dd.nhungKhuThuongXay')}
          <b> {t('dd.xinDiChamVa')}</b> {t('dd.bietTruocLaTranh')}
        </p>

        {/* ĐANG NGẬP — đứng đầu trang: thông tin cần thấy trước tiên lúc mưa lớn */}
        {dangNgap.length > 0 && (
          <div role="alert" className="mb-5 rounded-2xl border-2 border-rose-500 bg-rose-50 p-4 dark:border-rose-700 dark:bg-rose-900/20">
            <p className="flex items-center gap-2 text-base font-extrabold text-rose-700 dark:text-rose-300">
              <Waves className="h-5 w-5" /> Đang có {dangNgap.length} tuyến đường ngập
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm font-semibold text-rose-800 dark:text-rose-200">
              {dangNgap.map((d) => (
                <li key={d.id}>
                  {d.ten}
                  {d.ngapLuc && <span className="font-normal text-rose-700/80 dark:text-rose-300/80"> — cán bộ xác nhận lúc {dinhDangGioNgap(d.ngapLuc)}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-rose-700/90 dark:text-rose-300/90">
              Bà con nên đi đường khác. Không lội qua nơi nước chảy xiết hoặc không thấy mặt đường.
            </p>
          </div>
        )}

        {/* DỰ BÁO MƯA (P51) — sau báo ngập đã xác nhận, trước danh sách. Hiện cả khi
            danh sách điểm chưa tải được: dự báo không phụ thuộc danh sách. */}
        <KhungDuBaoMua soDuongHayNgap={ngap.length} />

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
            {/* SỐ LIỆU CHUNG — chỉ điểm đen tai nạn, không lẫn đường hay ngập */}
            {taiNan.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <div className="flex-1 rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">{taiNan.length}</p>
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
            )}
            {taiNan.length === 0 && loiDoc && (
              <div className="mb-5"><SpeakButton text={loiDoc} label="Nghe" /></div>
            )}

            {/* BẢN ĐỒ — chỉ hiện khi có điểm nào đã ghi toạ độ */}
            {coToaDo.length > 0 && (
              <div className="mb-5 overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
                <MapContainer center={CENTER} zoom={12} scrollWheelZoom style={{ height: 340, width: '100%' }}>
                  <TileLayer
                    attribution="&copy; OpenStreetMap"
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {coToaDo.map((d) => {
                    const laNgap = d.loai === 'ngap';
                    /* Đường hay ngập: xanh dương; nguy cơ theo dự báo: cam; ĐANG ngập: đỏ đậm, to hơn */
                    const mau = laNgap ? (d.dangNgap ? '#dc2626' : nguyCo ? '#ea580c' : '#0ea5e9') : MUC[d.mucDo].mau;
                    return (
                      <CircleMarker
                        key={d.id}
                        center={[d.lat!, d.lng!]}
                        radius={laNgap ? (d.dangNgap ? 14 : 9) : 8 + Math.min(14, d.soVu * 2)}
                        pathOptions={{
                          color: mau,
                          fillColor: mau,
                          fillOpacity: laNgap && d.dangNgap ? 0.8 : 0.55,
                          weight: 2,
                        }}
                      >
                        <LeafletTooltip direction="top">
                          <div className="text-xs">
                            <p className="font-bold">{d.ten}</p>
                            {laNgap
                              ? <p>{d.dangNgap ? `ĐANG NGẬP (xác nhận ${dinhDangGioNgap(d.ngapLuc)})` : nguyCo ? 'Nguy cơ ngập — dự báo mưa to' : 'Hay ngập khi mưa lớn'}</p>
                              : <p>{d.soVu} vụ · {d.soTuVong} tử vong</p>}
                          </div>
                        </LeafletTooltip>
                      </CircleMarker>
                    );
                  })}
                </MapContainer>
              </div>
            )}

            {/* ĐƯỜNG HAY NGẬP */}
            {ngap.length > 0 && (
              <>
                <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">
                  <Waves className="h-5 w-5 text-sky-600" /> Đường hay ngập
                </h2>
                <div className="mb-6 space-y-3">
                  {ngap.map((d) => (
                    <div
                      key={d.id}
                      className={`rounded-2xl border-2 p-4 ${
                        d.dangNgap
                          ? 'border-rose-500 bg-rose-50 dark:border-rose-700 dark:bg-rose-900/15'
                          : nguyCo
                            ? 'border-orange-400 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/15'
                            : 'border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-900/15'
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {d.dangNgap ? (
                          <span className="rounded-lg bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">
                            ĐANG NGẬP{d.ngapLuc ? ` — cán bộ xác nhận lúc ${dinhDangGioNgap(d.ngapLuc)}` : ''}
                          </span>
                        ) : nguyCo ? (
                          <span className="rounded-lg bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
                            Nguy cơ ngập — dự báo mưa to
                          </span>
                        ) : (
                          <span className="rounded-lg bg-sky-600 px-2 py-0.5 text-xs font-bold text-white">
                            Hay ngập khi mưa lớn
                          </span>
                        )}
                        {d.diaBan && <span className="text-xs text-slate-500 dark:text-slate-400">{d.diaBan}</span>}
                      </div>
                      <p className="mb-1 text-base font-extrabold text-slate-800 dark:text-slate-100">{d.ten}</p>
                      {!d.dangNgap && (
                        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                          {nguyCo
                            ? 'Dự báo mưa to: đường này có thể ngập. Chưa có cán bộ xác nhận đang ngập — đi qua hãy quan sát kỹ.'
                            : 'Hiện chưa có báo ngập.'}
                        </p>
                      )}
                      {d.moTa && (
                        <p className="mb-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{d.moTa}</p>
                      )}
                      {d.khuyenCao && (
                        <p className="rounded-xl bg-white/70 p-3 text-sm font-semibold leading-snug text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                          Khuyến cáo: {d.khuyenCao}
                        </p>
                      )}
                      <NutBanDo d={d} />
                    </div>
                  ))}
                </div>
                <div className="mb-6 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Tình trạng ngập do cán bộ cập nhật thủ công khi có mưa lớn, có thể chậm hơn thực tế và tự hết sau
                    12 giờ nếu không được báo lại. "Nguy cơ ngập" là dự báo tự động theo lượng mưa, không phải xác nhận.
                    Không có báo ngập không có nghĩa là đường an toàn — bà con luôn quan sát mặt đường trước khi đi qua.
                  </p>
                </div>
              </>
            )}

            {/* ĐIỂM ĐEN TAI NẠN — DANH SÁCH CHI TIẾT */}
            {taiNan.length > 0 && (
              <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-slate-800 dark:text-slate-100">
                <TriangleAlert className="h-5 w-5 text-rose-600" /> Điểm đen tai nạn
              </h2>
            )}
            <div className="space-y-3">
              {taiNan.map((d) => (
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

                  <NutBanDo d={d} />
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
