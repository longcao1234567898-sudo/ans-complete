/**
 * TRANG BẢN ĐỒ AN NINH — công khai cho người dân, không cần đăng nhập.
 *
 * VÌ SAO CÓ TRANG NÀY: bà con biết khu mình đang có vấn đề gì để phòng ngừa, và
 * thấy được công an đang tiếp nhận xử lý. Minh bạch tạo niềm tin, có niềm tin
 * thì bà con mới báo tin — vòng tròn có lợi cho cả hai bên.
 *
 * ⚠️ DỮ LIỆU ĐÃ ĐƯỢC LÀM MỜ CÓ CHỦ ĐÍCH. Máy chủ chỉ trả về số lượng theo địa
 *    bàn, và CHE hẳn số của địa bàn có quá ít tin. Ở ấp nhỏ nơi mọi người biết
 *    mặt nhau, thấy "ấp X có 1 tin tố giác" là gần như chỉ đích danh được ai đã
 *    báo. Trang này tuyệt đối không hiện nội dung tin hay danh tính.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, ShieldAlert, Info, Loader2 } from 'lucide-react';
import { fetchBanDoAnNinh, type DiaBanAnNinh } from '../services/banDoService';
import PageBackground from '../components/common/PageBackground';
import SpeakButton from '../components/common/SpeakButton';

const CENTER: [number, number] = [10.81, 105.21];

const KHOANG = [
  { ngay: 7, nhan: '7 ngày qua' },
  { ngay: 30, nhan: '30 ngày qua' },
  { ngay: 90, nhan: '3 tháng qua' },
];

/* Màu theo mức độ: xanh ít việc, cam vừa, đỏ nhiều. Địa bàn bị che số thì xám —
   xám nghĩa là "chưa đủ dữ liệu để nói", không phải "an toàn". */
function mauTheoSo(d: DiaBanAnNinh, cao: number): string {
  if (d.duLieuIt || d.tong === null) return '#94a3b8';
  if (d.tong === 0) return '#22c55e';
  const ty = cao > 0 ? d.tong / cao : 0;
  if (ty > 0.66) return '#ef4444';
  if (ty > 0.33) return '#f59e0b';
  return '#22c55e';
}

function banKinh(d: DiaBanAnNinh, cao: number): number {
  if (d.duLieuIt || d.tong === null) return 8;
  if (d.tong === 0) return 6;
  const ty = cao > 0 ? d.tong / cao : 0;
  return 8 + Math.round(ty * 18);
}

export default function BanDoAnNinhPage() {
  const [ngay, setNgay] = useState(30);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ban-do-an-ninh', ngay],
    queryFn: () => fetchBanDoAnNinh(ngay),
  });

  const ds = data?.diaBan ?? [];
  const cao = Math.max(0, ...ds.map((d) => d.tong ?? 0));

  /* CẢNH BÁO THEO ĐỊA BÀN — gom các địa bàn đang nhiều việc nhất để bà con biết
     mà phòng ngừa. Chỉ lấy địa bàn CÓ SỐ (không bị che) và thật sự có tin. */
  const diaBanNong = [...ds]
    .filter((d) => !d.duLieuIt && (d.tong ?? 0) > 0)
    .sort((a, b) => (b.tong ?? 0) - (a.tong ?? 0))
    .slice(0, 3);

  const tongTin = ds.reduce((s, d) => s + (d.tong ?? 0), 0);
  const tongToGiac = ds.reduce((s, d) => s + (d.nhom?.to_giac ?? 0), 0);

  /* Lời đọc cho người mắt kém — gộp thành một đoạn để nghe liền mạch. */
  const loiDoc = diaBanNong.length
    ? `Tình hình an ninh ${KHOANG.find((k) => k.ngay === ngay)?.nhan}. `
      + `Toàn địa bàn tiếp nhận ${tongTin} tin. `
      + `Các nơi có nhiều tin nhất: `
      + diaBanNong.map((d) => `${d.ten} ${d.tong} tin`).join(', ')
      + '. Bà con ở những nơi này lưu ý cảnh giác hơn.'
    : `Tình hình an ninh ${KHOANG.find((k) => k.ngay === ngay)?.nhan}. Chưa có địa bàn nào nổi bật.`;

  return (
    <div className="relative min-h-screen">
      <PageBackground anh="bg-ho-tinh-tam.webp" />

      <div className="container-page py-8">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          <MapPin className="h-6 w-6 text-primary-600" /> Bản đồ an ninh địa bàn
        </h1>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Xem tình hình an ninh trật tự nơi bà con sinh sống, để biết mà phòng ngừa.
          Bản đồ chỉ hiện <b>số lượng tin đã tiếp nhận</b> theo từng địa bàn —
          không hiện nội dung tin, không hiện ai đã báo.
        </p>

        {/* Chọn khoảng thời gian */}
        <div className="mb-5 flex flex-wrap gap-2">
          {KHOANG.map((k) => (
            <button
              key={k.ngay}
              type="button"
              onClick={() => setNgay(k.ngay)}
              className={`min-h-[40px] rounded-xl px-4 py-2 text-sm font-bold transition ${
                ngay === k.ngay
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {k.nhan}
            </button>
          ))}
        </div>

        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bản đồ…
          </p>
        )}

        {error && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Chưa xem được bản đồ lúc này. Bà con thử lại sau giúp.
            </p>
          </div>
        )}

        {data && (
          <>
            {/* ============ CẢNH BÁO THEO ĐỊA BÀN ============ */}
            {diaBanNong.length > 0 && (
              <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/15">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-base font-extrabold text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="h-5 w-5" /> Cảnh báo tại địa bàn
                  </p>
                  <SpeakButton text={loiDoc} label="Nghe" />
                </div>
                <p className="mb-3 text-sm text-amber-700 dark:text-amber-200">
                  Những nơi có nhiều tin báo nhất {KHOANG.find((k) => k.ngay === ngay)?.nhan.toLowerCase()}.
                  Bà con ở các khu này lưu ý cảnh giác hơn.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {diaBanNong.map((d, i) => (
                    <div
                      key={d.id}
                      className="rounded-xl bg-white p-3 dark:bg-slate-900"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white">
                          {i + 1}
                        </span>
                        {d.ten}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {d.tong} tin đã tiếp nhận
                      </p>
                      {d.nhom && d.nhom.to_giac > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                          {d.nhom.to_giac} tin tố giác
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ============ SỐ LIỆU CHUNG ============ */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-primary-600 dark:text-primary-400">{tongTin}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">tin đã tiếp nhận</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">{tongToGiac}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">tin tố giác tội phạm</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-soft dark:bg-slate-900">
                <p className="text-2xl font-extrabold text-slate-700 dark:text-slate-200">{ds.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">địa bàn theo dõi</p>
              </div>
            </div>

            {/* ============ BẢN ĐỒ ============ */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-soft dark:bg-slate-900">
              <MapContainer center={CENTER} zoom={11} scrollWheelZoom style={{ height: 420, width: '100%' }}>
                <TileLayer
                  attribution="&copy; OpenStreetMap"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {ds.map((d) => (
                  <CircleMarker
                    key={d.id}
                    center={[d.lat, d.lng]}
                    radius={banKinh(d, cao)}
                    pathOptions={{
                      color: mauTheoSo(d, cao),
                      fillColor: mauTheoSo(d, cao),
                      fillOpacity: 0.55,
                      weight: 2,
                    }}
                  >
                    <LeafletTooltip direction="top">
                      <div className="text-xs">
                        <p className="font-bold">{d.ten}</p>
                        {d.duLieuIt ? (
                          <p className="text-slate-500">Chưa đủ dữ liệu để công bố</p>
                        ) : (
                          <>
                            <p>{d.tong} tin đã tiếp nhận</p>
                            {d.nhom && (
                              <p className="text-slate-500">
                                Tố giác {d.nhom.to_giac} · Phản ánh {d.nhom.phan_anh}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </LeafletTooltip>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            {/* ============ GIẢI THÍCH ============ */}
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <p>
                  <b>Chấm càng lớn và càng đỏ</b> nghĩa là địa bàn đó có nhiều tin báo hơn.
                  Chấm xám là địa bàn <b>chưa đủ dữ liệu để công bố</b> — không phải nơi đó
                  không có việc gì.
                </p>
                <p className="mt-1.5">
                  Địa bàn có dưới {data.nguongChe} tin thì hệ thống không hiện số, để tránh
                  từ con số nhỏ mà suy ra được ai đã báo tin. Đây là cách bảo vệ người dân
                  đã tin tưởng gửi tin cho công an.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
