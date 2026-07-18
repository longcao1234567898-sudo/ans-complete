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
    <div className="fixed bottom-5 left-4 z-50 sm:bottom-6 sm:left-6">
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

      <div className="flex flex-col items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Gọi khẩn cấp"
          className="animate-ripple relative flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-xl shadow-red-600/30 transition-colors hover:bg-red-700"
        >
          <Siren className="h-6 w-6" />
        </button>
        <p className="mt-1 select-none text-center text-[10px] font-bold tracking-wide text-red-600 dark:text-red-400">SOS</p>
      </div>
    </div>
  );
}
