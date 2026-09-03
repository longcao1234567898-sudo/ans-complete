/**
 * NutGuiViTri — cho bà con TỰ NGUYỆN gửi toạ độ nơi xảy ra vụ việc.
 *
 * VÌ SAO CẦN: bà con mô tả địa điểm bằng lời thường không đủ rõ — "gần cây
 * xăng", "đầu ấp", "chỗ có cây me lớn". Cán bộ xuống hiện trường phải dò hỏi
 * mất thời gian, có khi tới nhầm chỗ. Một toạ độ chính xác giải quyết hết.
 *
 * ⚠️ HOÀN TOÀN TỰ NGUYỆN. Hệ thống KHÔNG tự lấy vị trí. Bà con phải chủ động
 *    bấm nút, rồi trình duyệt còn hỏi xin phép lần nữa. Không bấm thì ý kiến
 *    vẫn gửi bình thường, không thiếu gì.
 *
 * ⚠️ ĐÂY LÀ VỊ TRÍ VỤ VIỆC, KHÔNG PHẢI VỊ TRÍ NGƯỜI BÁO. Giao diện nói rõ điều
 *    này, và nhắc bà con chỉ bấm khi ĐANG ĐỨNG TẠI nơi xảy ra sự việc. Bấm ở
 *    nhà thì gửi nhầm toạ độ nhà mình — vừa sai thông tin vừa lộ chỗ ở.
 */
import { useState } from 'react';
import { MapPin, Loader2, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ViTri {
  lat: number;
  lng: number;
  doChinhXacMet?: number;
}

interface Props {
  viTri: ViTri | null | undefined;
  onChange: (v: ViTri | null) => void;
}

export default function NutGuiViTri({ viTri, onChange }: Props) {
  const [dangLay, setDangLay] = useState(false);
  /* Sai số đang đo được — hiện cho bà con thấy máy đang dò tốt dần lên. */
  const [doChinhXac, setDoChinhXac] = useState<number | null>(null);

  const coHoTro = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  if (!coHoTro) return null;

  /* LẤY VỊ TRÍ CHÍNH XÁC HƠN — theo dõi liên tục thay vì lấy một lần.

     Vì sao đổi cách: getCurrentPosition trả về ngay mẫu ĐẦU TIÊN máy có được,
     mà mẫu đầu thường lấy từ trạm phát sóng hoặc wifi — sai số 500m tới vài km.
     Chip định vị cần khoảng 5 tới 15 giây mới bắt đủ vệ tinh để xuống dưới 20m.

     Nay dùng watchPosition: máy gửi liên tục các mẫu ngày càng chính xác, ta
     GIỮ MẪU TỐT NHẤT. Dừng sớm khi đạt dưới 15m (đủ để chỉ đúng một căn nhà),
     hoặc hết 20 giây thì lấy mẫu tốt nhất đang có.

     Với tin tố giác thì sai số vài trăm mét là chỉ nhầm cả một ấp — đáng để
     chờ thêm mươi giây. */
  function layViTri() {
    setDangLay(true);
    setDoChinhXac(null);

    let totNhat: GeolocationPosition | null = null;
    let watchId: number | null = null;
    let hetGio: ReturnType<typeof setTimeout> | null = null;

    const ketThuc = (thanhCong: boolean) => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (hetGio) clearTimeout(hetGio);
      setDangLay(false);
      setDoChinhXac(null);

      if (thanhCong && totNhat) {
        onChange({
          lat: Number(totNhat.coords.latitude.toFixed(7)),
          lng: Number(totNhat.coords.longitude.toFixed(7)),
          doChinhXacMet: totNhat.coords.accuracy ? Math.round(totNhat.coords.accuracy) : undefined,
        });
        const ss = Math.round(totNhat.coords.accuracy || 0);
        toast.success(ss > 50
          ? `Đã ghi vị trí (sai số khoảng ${ss}m — ra chỗ thoáng sẽ chính xác hơn)`
          : 'Đã ghi nhận vị trí');
      }
    };

    /* Hết 20 giây thì chốt bằng mẫu tốt nhất đang có, còn hơn không có gì. */
    hetGio = setTimeout(() => {
      if (totNhat) ketThuc(true);
      else {
        ketThuc(false);
        toast.error('Chưa lấy được vị trí. Bà con ra chỗ thoáng rồi thử lại giúp.', { duration: 5000 });
      }
    }, 20000);

    watchId = navigator.geolocation.watchPosition(
      (v) => {
        /* Giữ mẫu có sai số nhỏ nhất. */
        if (!totNhat || v.coords.accuracy < totNhat.coords.accuracy) {
          totNhat = v;
          setDoChinhXac(Math.round(v.coords.accuracy));
        }
        /* Đủ chính xác để chỉ đúng một căn nhà -> dừng sớm, khỏi bắt chờ. */
        if (v.coords.accuracy <= 15) ketThuc(true);
      },
      (err) => {
        /* Đã có mẫu nào đó rồi thì dùng luôn, đừng vứt đi vì một lỗi giữa chừng. */
        if (totNhat) { ketThuc(true); return; }
        ketThuc(false);
        /* Nói rõ từng loại lỗi để bà con biết đường xử lý, thay vì báo chung
           chung "không lấy được vị trí" rồi để họ loay hoay. */
        if (err.code === err.PERMISSION_DENIED) {
          toast.error('Bà con chưa cho phép lấy vị trí. Có thể bật lại trong cài đặt trình duyệt.', { duration: 5000 });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          toast.error('Máy chưa xác định được vị trí. Thử ra chỗ thoáng rồi bấm lại.', { duration: 5000 });
        } else {
          toast.error('Lấy vị trí lâu quá. Bà con thử lại giúp.', { duration: 5000 });
        }
      },
      /* enableHighAccuracy bật chip định vị vệ tinh thay vì chỉ dựa trạm phát
         sóng. maximumAge 0 để KHÔNG dùng lại vị trí cũ đã lưu trong máy — vị
         trí cũ có thể là chỗ bà con đứng lúc sáng, không phải hiện trường. */
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  /* ĐÃ CÓ VỊ TRÍ */
  if (viTri) {
    return (
      <div className="mt-3 flex items-start gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/15">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
            Đã đính kèm vị trí vụ việc
          </p>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-200">
            {viTri.lat}, {viTri.lng}
            {viTri.doChinhXacMet ? ` · sai số khoảng ${viTri.doChinhXacMet}m` : ''}
          </p>
          <a
            href={`https://www.google.com/maps?q=${viTri.lat},${viTri.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-xs font-semibold text-emerald-700 underline dark:text-emerald-300"
          >
            Xem thử trên bản đồ
          </a>
        </div>
        <button
          type="button"
          onClick={() => { onChange(null); toast('Đã bỏ vị trí'); }}
          aria-label="Bỏ vị trí đã đính kèm"
          className="shrink-0 rounded-lg p-1.5 text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  /* CHƯA CÓ VỊ TRÍ */
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={layViTri}
        disabled={dangLay}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-primary-300 bg-white px-4 py-2.5 text-sm font-bold text-primary-700 transition hover:bg-primary-50 disabled:opacity-60 dark:border-primary-700 dark:bg-slate-800 dark:text-primary-300"
      >
        {dangLay ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
        {dangLay
          ? (doChinhXac ? `Đang dò... sai số ${doChinhXac}m` : 'Đang lấy vị trí...')
          : 'Gửi vị trí nơi xảy ra vụ việc'}
      </button>
      <p className="mt-1.5 text-xs leading-snug text-slate-500 dark:text-slate-400">
        Không bắt buộc. Giúp cán bộ tìm đúng chỗ, khỏi phải dò hỏi.
        <b className="text-slate-600 dark:text-slate-300"> Chỉ bấm khi bà con đang đứng tại nơi
        xảy ra sự việc</b> — bấm ở nhà thì gửi nhầm vị trí nhà mình.
      </p>
    </div>
  );
}
