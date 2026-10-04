/**
 * DẢI CẢNH BÁO MƯA Ở TRANG CHỦ (P51).
 *
 * Chỉ hiện từ mức Cảnh báo (mưa to) trở lên — ngày thường không chiếm chỗ, để
 * khi hiện thì người ta còn để ý. Bấm vào sang trang Điểm đen xem đường hay ngập.
 */
import { Link } from 'react-router-dom';
import { CloudRain, ArrowRight } from 'lucide-react';
import { useDuBaoMua } from '../../hooks/useDuBaoMua';
import { HIEN_MUC, coNguyCoNgap, gioCapNhat, khoangGio, type MucMua } from '../../utils/duBaoMua';

export default function CanhBaoMuaTrangChu() {
  const { data } = useDuBaoMua();
  if (!data || !coNguyCoNgap(data)) return null;
  const muc = data.muc as MucMua;
  const h = HIEN_MUC[muc];

  return (
    /* role="alert" ở khung ngoài, không đặt lên chính liên kết — đặt lên liên kết
       thì trình đọc màn hình không còn nhận ra đó là chỗ bấm được */
    <div className="container-page pt-4" role="alert">
      <Link
        to="/diem-den"
        data-khoi="canh-bao-mua"
        className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border-2 px-4 py-3 transition hover:shadow-md ${h.khung}`}
      >
        <CloudRain className={`h-5 w-5 shrink-0 ${h.chu}`} />
        <span className={`rounded-lg px-2 py-0.5 text-xs font-bold text-white ${h.nhan}`}>{h.ten}</span>
        <span className={`flex-1 text-sm font-semibold ${h.chu}`}>
          {muc === 3 ? 'Dự báo mưa rất to' : 'Dự báo mưa to'}
          {data.dinhMua && (data.mua3hLonNhat ?? 0) > 0 ? `, dồn nhiều nhất ${khoangGio(data.dinhMua.tu, data.dinhMua.den)}` : ''}
          {' — '}các tuyến đường hay ngập có thể bị ngập.
        </span>
        <span className={`inline-flex items-center gap-1 text-sm font-bold underline ${h.chu}`}>
          Xem đường hay ngập <ArrowRight className="h-4 w-4" />
        </span>
        <span className="w-full text-[11px] text-slate-500 dark:text-slate-400">
          Dự báo tự động, cập nhật {data.capNhatLuc ? gioCapNhat(data.capNhatLuc) : '—'} · Dữ liệu thời tiết: Open-Meteo.com
        </span>
      </Link>
    </div>
  );
}
