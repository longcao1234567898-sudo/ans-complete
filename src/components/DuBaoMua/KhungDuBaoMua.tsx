/**
 * KHUNG DỰ BÁO MƯA 24 GIỜ TỚI (P51) — trang Điểm đen giao thông và trang cán bộ.
 *
 * Mức do máy chủ tính từ lượng mưa Open-Meteo (server/src/lib/du-bao-mua.js).
 * Không có dữ liệu thì nói thẳng là không có — KHÔNG hiện "Bình thường" thay.
 * `canBo`: thêm lý do, toạ độ đang dự báo và lời nhắc cử người đi kiểm tra.
 */
import { CloudRain, Info, MapPin } from 'lucide-react';
import SpeakButton from '../common/SpeakButton';
import { useDuBaoMua } from '../../hooks/useDuBaoMua';
import {
  HIEN_MUC, MO_TA_MUC, coNguyCoNgap, gioCapNhat, khoangGio, soMm, type MucMua,
} from '../../utils/duBaoMua';

const NGUON_TOA_DO: Record<string, string> = {
  bien_moi_truong: 'khai trong DU_BAO_MUA_TOA_DO',
  duong_hay_ngap: 'giữa các đường hay ngập đang công khai',
  diem_den: 'giữa các điểm đen đang công khai (chưa có đường hay ngập có toạ độ)',
};

const BAN_TIN_CHINH_THUC = 'https://nchmf.gov.vn/';

function GhiChuNguon() {
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
      Dự báo tự động từ mô hình thời tiết, có thể sai lệch — nhất là với mưa dông. Bản tin chính thức:{' '}
      <a href={BAN_TIN_CHINH_THUC} target="_blank" rel="noopener noreferrer" className="underline">nchmf.gov.vn</a>.
      {' '}Dữ liệu thời tiết:{' '}
      <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline">Open-Meteo.com</a>
      {' '}(<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY 4.0</a>).
    </p>
  );
}

export default function KhungDuBaoMua({ canBo = false, soDuongHayNgap = 0 }: { canBo?: boolean; soDuongHayNgap?: number }) {
  const { data, isLoading, isError } = useDuBaoMua({ canBo });
  if (isLoading) return null;
  const d = isError || !data ? { trangThai: 'khong_co_du_lieu' as const } : data;

  /* Tắt hoặc chưa có điểm để dự báo: người dân không cần biết; cán bộ cần biết cách bật */
  if (d.trangThai === 'tat' || d.trangThai === 'chua_cau_hinh' || d.trangThai === 'cau_hinh_sai') {
    if (!canBo) return null;
    const loi = d.trangThai === 'cau_hinh_sai';
    return (
      <div data-khoi="du-bao-mua" className={`mb-4 rounded-xl border px-3 py-2 text-xs ${loi
        ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300'
        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}
      >
        <CloudRain className="mr-1 inline h-3.5 w-3.5" />
        {d.trangThai === 'tat' && 'Dự báo mưa tự động đang tắt (DU_BAO_MUA_TOA_DO=tat trên máy chủ).'}
        {d.trangThai === 'chua_cau_hinh' && 'Dự báo mưa tự động chưa chạy: chưa có điểm nào có toạ độ. Nhập toạ độ cho đường hay ngập (hoặc khai DU_BAO_MUA_TOA_DO trên máy chủ) là có.'}
        {loi && 'DU_BAO_MUA_TOA_DO trên máy chủ khai sai — cần dạng "vĩ độ,kinh độ" (vd. 11.01,106.65) hoặc "tat". Đang KHÔNG hiện dự báo cho người dân.'}
      </div>
    );
  }

  if (d.trangThai !== 'co_du_lieu' || d.muc === undefined) {
    return (
      <div data-khoi="du-bao-mua" className="mb-5 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <CloudRain className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
          Chưa lấy được dự báo mưa lúc này. <b>Không có dự báo không có nghĩa là trời yên</b> — bà con theo dõi bản
          tin thời tiết chính thức tại{' '}
          <a href={BAN_TIN_CHINH_THUC} target="_blank" rel="noopener noreferrer" className="underline">nchmf.gov.vn</a>.
        </p>
      </div>
    );
  }

  const muc = d.muc as MucMua;
  const h = HIEN_MUC[muc];
  const nguyCo = coNguyCoNgap(d);
  const loiDoc = `Dự báo mưa 24 giờ tới: mức ${h.ten}. ${h.loiKhuyen}`
    + (d.dinhMua && (d.mua3hLonNhat ?? 0) > 0 ? ` Mưa dồn nhiều nhất khoảng ${khoangGio(d.dinhMua.tu, d.dinhMua.den)}.` : '');

  return (
    <section
      data-khoi="du-bao-mua"
      data-muc={muc}
      role={nguyCo ? 'alert' : undefined}
      aria-label="Dự báo mưa 24 giờ tới"
      className={`mb-5 rounded-2xl border-2 p-4 ${h.khung}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CloudRain className={`h-5 w-5 ${h.chu}`} />
        <span className={`text-base font-extrabold ${h.chu}`}>Dự báo mưa 24 giờ tới</span>
        <span className={`rounded-lg px-2 py-0.5 text-xs font-bold text-white ${h.nhan}`}>
          Mức {muc}: {h.ten}
        </span>
        {!canBo && muc > 0 && <SpeakButton text={loiDoc} label="Nghe" />}
      </div>

      <p className={`mt-1.5 text-sm font-semibold leading-snug ${h.chu}`}>{h.loiKhuyen}</p>
      {/* Tuyến có nguy cơ theo ngưỡng riêng của địa bàn (P53) — kể cả khi mức chung
          mới là Theo dõi: tuyến trũng ngập sớm hơn cả vùng */}
      {(d.duongNguyCo?.length ?? 0) > 0 && (
        <div className={`mt-1.5 rounded-lg bg-white/60 p-2 text-sm dark:bg-slate-900/40 ${h.chu}`}>
          <b>Tuyến có nguy cơ ngập:</b>{' '}
          {d.duongNguyCo!.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ', '}
              {x.ten}
              {x.nguong !== null && <span className="text-xs font-normal"> (ngưỡng địa bàn {x.nguong} mm/3 giờ)</span>}
            </span>
          ))}
        </div>
      )}
      {nguyCo && soDuongHayNgap > 0 && !canBo && (
        <p className={`mt-1 text-sm ${h.chu}`}>
          Xem {soDuongHayNgap} tuyến đường hay ngập bên dưới — chỗ ghi <b>"Nguy cơ ngập"</b> là theo dự báo,
          chỗ ghi <b>"ĐANG NGẬP"</b> là cán bộ đã xác nhận.
        </p>
      )}

      <ul className="mt-2 space-y-0.5 text-xs text-slate-700 dark:text-slate-300">
        <li>Tổng mưa 24 giờ tới: khoảng <b>{soMm(d.mua24h)} mm</b></li>
        {d.dinhMua && (d.mua3hLonNhat ?? 0) > 0 && (
          <li>
            Mưa dồn nhiều nhất: khoảng <b>{soMm(d.mua3hLonNhat)} mm</b> trong 3 giờ,{' '}
            <b>{khoangGio(d.dinhMua.tu, d.dinhMua.den)}</b>
          </li>
        )}
        {(d.mua3hVuaQua ?? 0) > 0 && <li>3 giờ vừa qua: khoảng {soMm(d.mua3hVuaQua)} mm</li>}
      </ul>

      {canBo && (
        <div className="mt-2 rounded-xl bg-white/70 p-2.5 text-xs leading-relaxed text-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
          {nguyCo && (
            <p className="mb-1 font-bold text-orange-800 dark:text-orange-300">
              Nên cử người kiểm tra các tuyến hay ngập. Thấy ngập thật thì bấm "Đang ngập" để báo người dân —
              dự báo KHÔNG tự đánh dấu đường nào đang ngập.
            </p>
          )}
          {d.lyDo && d.lyDo.length > 0 && <p>Lý do: {d.lyDo.join('; ')}.</p>}
          {d.toaDo && (
            <p>
              <MapPin className="mr-0.5 inline h-3.5 w-3.5 align-[-2px]" />Điểm dự báo: {d.toaDo.lat}, {d.toaDo.lng}
              {d.nguonToaDo && ` (${NGUON_TOA_DO[d.nguonToaDo] ?? d.nguonToaDo})`}
              {' — '}
              <a
                href={`https://www.google.com/maps?q=${d.toaDo.lat},${d.toaDo.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                xem trên bản đồ
              </a>
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
        Cập nhật {d.capNhatLuc ? gioCapNhat(d.capNhatLuc) : '—'}
        {d.cu && <b className="text-amber-700 dark:text-amber-400"> — chưa làm mới được, số liệu có thể đã cũ</b>}
      </p>

      <details className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer select-none font-semibold">
          <Info className="mr-1 inline h-3 w-3" />Các mức dự báo
        </summary>
        <ul className="mt-1 space-y-0.5 pl-4">
          {([0, 1, 2, 3] as MucMua[]).map((m) => (
            <li key={m}>
              <span className={`mr-1 inline-block h-2 w-2 rounded-full ${HIEN_MUC[m].nhan}`} />
              <b>Mức {m} — {HIEN_MUC[m].ten}:</b> {MO_TA_MUC[m]}.
            </li>
          ))}
          <li>Tính trên 3 giờ vừa qua và 24 giờ tới, theo cách phân loại mưa của ngành khí tượng thuỷ văn.</li>
          <li>
            Tuyến có <b>ngưỡng riêng của địa bàn</b> (lãnh đạo đặt, học từ các lần cán bộ báo ngập): báo nguy cơ khi mưa
            dồn 3 giờ dự báo đạt ngưỡng của tuyến đó. Mức Nguy hiểm thì mọi tuyến hay ngập đều báo.
          </li>
        </ul>
      </details>

      <GhiChuNguon />
    </section>
  );
}
