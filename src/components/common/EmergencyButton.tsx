/**
 * EmergencyButton — nút SOS đỏ nổi ở góc dưới TRÁI màn hình.
 *
 * VÌ SAO CẦN: không phải lúc nào cũng kịp gõ form. Tình huống khẩn cấp
 * (đang bị đe doạ, chứng kiến vụ việc nghiêm trọng) cần gọi điện NGAY.
 *
 * Bấm nút -> mở bảng chọn: Gọi 113 / Gọi trực ban Công an thị xã.
 * Trên điện thoại, thẻ <a href="tel:..."> mở thẳng trình quay số.
 * (Góc dưới PHẢI đã có chatbox AI nên nút này nằm bên TRÁI.)
 */
import { useState } from 'react';
import { Phone, PhoneCall, X, Siren } from 'lucide-react';
import { UNIT } from '../../utils/constants';

export default function EmergencyButton() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="fixed left-5 z-50"
      /* ĐẨY LÊN KHI THANH CHỨC NĂNG HIỆN RA.
         MobileTabBar đặt biến --tab-bar-h = 4.25rem lúc thanh trượt lên, và
         về 0rem lúc thanh ẩn đi. Không đọc biến này thì nút SOS nằm ĐÈ lên
         thanh, che mất một mục điều hướng — mà SOS lại là nút quan trọng
         nhất, không được để nó che thứ khác hay bị thứ khác che. */
      /* ------------------------------------------------------------------
         CÂN NGANG VỚI NÚT TRỢ LÝ

         Dùng ĐÚNG cùng công thức bottom với nút trợ lý (ChatBubble). Hai nút
         cùng kích thước h-14 w-14, cùng gốc 1.25rem, cùng đẩy theo biến
         --tab-bar-h -> đáy hai nút thẳng hàng tuyệt đối.

         ⚠️ ĐỪNG bù trừ thêm gì ở đây. Lần trước tôi trừ 1rem để "bù nhãn SOS",
         nhưng nhãn đó dùng position absolute nên KHÔNG chiếm chỗ trong bố cục
         — trừ đi chỉ làm lệch thêm. Nhãn nay đã đưa vào trong nút.
         ------------------------------------------------------------------ */
      style={{ bottom: 'calc(1.25rem + var(--tab-bar-h, 0rem))', transition: 'bottom .3s' }}
    >
      {open && (
        <div className="mb-3 w-72 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl dark:border-red-900/50 dark:bg-slate-900">
          <div className="flex items-center justify-between bg-red-600 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-bold text-white">
              <Siren className="h-4 w-4" /> Khẩn cấp — gọi ngay
            </p>
            <button onClick={() => setOpen(false)} aria-label="Đóng" className="rounded-lg p-1 text-white/80 hover:bg-white/15">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2 p-3">
            <a
              href="tel:113"
              className="flex min-h-[52px] items-center gap-3 rounded-xl bg-red-50 px-4 py-3 transition hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/35"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                <PhoneCall className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-extrabold leading-tight text-red-700 dark:text-red-300">113</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Cảnh sát phản ứng nhanh</span>
              </span>
            </a>

            {UNIT.hotline && (
              <a
                href={`tel:${UNIT.hotline.replace(/[^0-9+]/g, '')}`}
                className="flex min-h-[52px] items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
                  <Phone className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold leading-tight text-slate-700 dark:text-slate-200">{UNIT.hotline}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Trực ban {UNIT.shortName ?? 'Công an thị xã'}</span>
                </span>
              </a>
            )}

            <p className="px-1 text-[11px] leading-relaxed text-slate-400">
              Chỉ dùng khi tình huống khẩn cấp cần lực lượng có mặt ngay.
              Việc chưa gấp, bà con hãy gửi ý kiến để được xử lý theo quy trình.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------
          ĐỂ NÚT SOS NGANG HÀNG VỚI NÚT TRỢ LÝ

          Trước đây khối này là flex-col chứa NÚT + dòng chữ "SOS" bên dưới.
          Dòng chữ chiếm chỗ nên đẩy nút lên cao hơn nút trợ lý bên phải —
          hai nút cùng cỡ, cùng công thức bottom mà nhìn vẫn lệch nhau.

          Nay dòng chữ đặt tuyệt đối (absolute) nên KHÔNG chiếm chỗ trong
          luồng, nút về đúng đáy khối, ngang hàng với nút trợ lý.
          ------------------------------------------------------------------ */}
      <div className="relative flex flex-col items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Gọi khẩn cấp"
          className="animate-ripple relative flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 transition-colors hover:bg-red-700"
        >
          {/* Biểu tượng + chữ SOS đặt CHUNG TRONG NÚT.
              Trước đây chữ SOS nằm ngoài nút (absolute -bottom-4), nhô xuống
              dưới nên nhìn nút SOS thấp hơn nút trợ lý dù đáy hai nút bằng
              nhau. Gom vào trong thì nút là một khối gọn, cân đúng. */}
          <span className="flex flex-col items-center leading-none">
            <Siren className="h-5 w-5" />
            <span className="mt-0.5 text-[9px] font-extrabold tracking-wider">SOS</span>
          </span>
        </button>
      </div>
    </div>
  );
}
