/**
 * Phần thuần của tính năng "đường hay ngập" (P50) — tách ra để chạy test bằng Node.
 *
 * Trạng thái "đang ngập" do CÁN BỘ xác nhận và MÁY CHỦ tính hạn (12 giờ,
 * server/src/lib/duong-ngap.js); giao diện chỉ hiện, không tự so giờ.
 */

/** Liên kết chỉ đường bằng Google Maps tới một điểm. Không cần khoá API: chỉ là đường
    dẫn mở ứng dụng/trang Google Maps, trình duyệt người dân tự gọi, máy chủ không gửi
    gì ra ngoài. Toạ độ không hợp lệ thì không có liên kết (không dựng liên kết hỏng). */
export function linkChiDuong(lat: unknown, lng: unknown): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined || lat === '' || lng === '') return null;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${la},${lo}`;
}

/** "14:30 02/10" theo giờ Việt Nam; chuỗi không phải giờ thì trả rỗng. */
export function dinhDangGioNgap(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const lay = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${lay('hour')}:${lay('minute')} ${lay('day')}/${lay('month')}`;
}
