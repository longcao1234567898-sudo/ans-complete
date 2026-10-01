/**
 * HẠN CHẾ CHỤP, QUAY MÀN HÌNH TRANG CÁN BỘ (ADR-003 việc 26)
 * ============================================================================
 *
 * ⚠️ TRANG WEB KHÔNG CHẶN TUYỆT ĐỐI ĐƯỢC việc chụp hay quay màn hình: trình
 * duyệt không cho trang web quyền đó, trên cả điện thoại lẫn máy tính, và luôn
 * chụp được bằng một điện thoại khác. Phím chụp cũng không phải lúc nào cũng
 * bắt được (Win+Shift+S, công cụ quay của hệ điều hành). Mục tiêu THỰC TẾ là:
 *
 *   · RĂN ĐE và TRUY VẾT — chữ chìm mờ chéo mang tên, mã cán bộ, thời điểm phủ
 *     lên nội dung: ảnh chụp lọt ra ngoài mang tên người chụp.
 *   · Làm mờ nội dung khi cửa sổ mất tập trung hoặc chuyển tab (nhiều công cụ
 *     chụp/quay lấy nét lúc đó).
 *   · Chặn in, chuột phải, sao chép nội dung (vẫn cho gõ, dán trong ô nhập).
 *   · Bắt được phím chụp màn hình hoặc lệnh in thì báo máy chủ ghi nhật ký
 *     (POST /api/admin/su-kien-man-hinh).
 *
 * Chặn tuyệt đối chỉ làm được bằng ứng dụng cài trên điện thoại Android, không
 * phải trang web.
 */
import { useEffect, useMemo, useState } from 'react';
import { adminFetch, type StaffInfo } from '../../services/adminService';
import LopPhu from '../common/LopPhu';

function baoMayChu(loai: 'phim_chup_man_hinh' | 'in_trang', duong: string) {
  adminFetch('/api/admin/su-kien-man-hinh', {
    method: 'POST',
    body: JSON.stringify({ loai, duong }),
  }).catch(() => { /* không ghi được thì thôi, không làm phiền cán bộ */ });
}

/** Ô nhập vẫn được chọn, sao chép, dán — cán bộ còn phải gõ ghi chú */
const laONhap = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.closest('input, textarea, select, [contenteditable="true"]') !== null);

export default function BaoVeManHinh({ staff }: { staff: StaffInfo }) {
  const [mo, setMo] = useState(false);
  const [gio, setGio] = useState(() => new Date());

  /* Giờ trên chữ chìm cập nhật mỗi phút */
  useEffect(() => {
    const t = window.setInterval(() => setGio(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  /* Mờ khi rời cửa sổ / chuyển tab */
  useEffect(() => {
    const capNhat = () => setMo(document.visibilityState === 'hidden' || !document.hasFocus());
    window.addEventListener('blur', capNhat);
    window.addEventListener('focus', capNhat);
    document.addEventListener('visibilitychange', capNhat);
    return () => {
      window.removeEventListener('blur', capNhat);
      window.removeEventListener('focus', capNhat);
      document.removeEventListener('visibilitychange', capNhat);
    };
  }, []);

  /* Chặn chuột phải, sao chép, cắt (trừ ô nhập); bắt phím chụp màn hình, lệnh in */
  useEffect(() => {
    const chan = (e: Event) => { if (!laONhap(e.target)) e.preventDefault(); };
    const phim = (e: KeyboardEvent) => {
      const chupMac = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
      if (e.key === 'PrintScreen' || chupMac) {
        baoMayChu('phim_chup_man_hinh', window.location.pathname);
        /* Xoá bộ nhớ tạm để ảnh vừa chụp bằng PrintScreen (nếu trình duyệt kịp
           bắt) không dán ra được ngay */
        navigator.clipboard?.writeText('').catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        baoMayChu('in_trang', window.location.pathname);
      }
    };
    const truocKhiIn = () => baoMayChu('in_trang', window.location.pathname);
    document.addEventListener('contextmenu', chan);
    document.addEventListener('copy', chan);
    document.addEventListener('cut', chan);
    window.addEventListener('keyup', phim);
    window.addEventListener('keydown', phim);
    window.addEventListener('beforeprint', truocKhiIn);
    return () => {
      document.removeEventListener('contextmenu', chan);
      document.removeEventListener('copy', chan);
      document.removeEventListener('cut', chan);
      window.removeEventListener('keyup', phim);
      window.removeEventListener('keydown', phim);
      window.removeEventListener('beforeprint', truocKhiIn);
    };
  }, []);

  /* Chữ chìm: SVG lặp lại làm nền, chữ xoay chéo */
  const nen = useMemo(() => {
    const chu = `${staff.name} · #${staff.id} · ${gio.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}`
      .replace(/[<>&"]/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200"><text x="0" y="120" transform="rotate(-25 180 100)" fill="rgb(100,116,139)" fill-opacity="0.13" font-size="15" font-family="sans-serif">${chu}</text></svg>`;
    return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  }, [staff.name, staff.id, gio]);

  /* Ra ngoài <main> (xem LopPhu): ở trong main thì chân trang đè lên, chữ chìm
     và lớp mờ không phủ được phần chân trang. */
  return (
    <LopPhu>
      {/* In trang cán bộ ra giấy: ẩn hết nội dung */}
      <style>{'@media print { body * { visibility: hidden !important; } }'}</style>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]" style={{ backgroundImage: nen }} />
      {mo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/60 backdrop-blur-xl dark:bg-slate-950/60">
          <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-soft dark:bg-slate-900 dark:text-slate-300">
            Nội dung tạm ẩn khi rời cửa sổ. Bấm vào đây để tiếp tục.
          </p>
        </div>
      )}
    </LopPhu>
  );
}
