/**
 * MÃ THIẾT BỊ — dùng để chặn spam mà không khoá oan cả vùng thuê bao
 * ============================================================================
 *
 * VÌ SAO KHÔNG DÙNG ĐỊA CHỈ IP:
 * Nhà mạng di động Việt Nam dùng CGNAT — hàng trăm thuê bao chung một IP công
 * cộng. Khoá IP là khoá oan cả vùng, mà bà con ở quê phần lớn vào bằng 4G.
 *
 * CÁCH LÀM: sinh một mã ngẫu nhiên cho mỗi trình duyệt, lưu lại trong máy.
 * Cán bộ đánh dấu tin rác thì khoá đúng máy đó, không đụng ai khác.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ ĐÂY KHÔNG PHẢI ĐỊNH DANH NGƯỜI DÙNG.
 * Mã này ngẫu nhiên hoàn toàn, không suy ra được ai. Xoá bộ nhớ trình duyệt là
 * mất. Nó chỉ để phân biệt "máy nào đang phá hoại", không để theo dõi người
 * dân — đúng tinh thần bảo vệ người tố giác của hệ thống.
 */

const KHOA = 'htans_device_id';

/** Sinh UUID v4. Dùng crypto.randomUUID nếu có, không thì tự dựng. */
function sinhMa(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* rơi xuống cách dưới */ }

  /* Trình duyệt cũ không có randomUUID. Dùng getRandomValues — vẫn là số ngẫu
     nhiên đủ mạnh. Cuối cùng mới tới Math.random (kém, nhưng còn hơn không). */
  try {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;   // đánh dấu phiên bản 4
      b[8] = (b[8] & 0x3f) | 0x80;   // đánh dấu biến thể
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch { /* rơi xuống cách dưới */ }

  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(1)}-a${r().slice(1)}-${r()}${r()}${r()}`;
}

/**
 * Lấy mã thiết bị. Chưa có thì sinh mới và lưu lại.
 *
 * Lưu ở localStorage (không phải sessionStorage) để mã sống qua các lần mở
 * trình duyệt — nếu mất sau mỗi lần đóng tab thì việc khoá thiết bị vô nghĩa.
 */
export function layMaThietBi(): string {
  try {
    const cu = localStorage.getItem(KHOA);
    /* Kiểm tra đúng dạng UUID. Máy chủ cũng kiểm lại, nhưng chặn sớm ở đây
       tránh gửi rác lên mạng. */
    if (cu && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cu)) {
      return cu;
    }
    const moi = sinhMa();
    localStorage.setItem(KHOA, moi);
    return moi;
  } catch {
    /* Trình duyệt chặn localStorage (chế độ riêng tư, hoặc người dùng tắt).
       Vẫn trả về một mã dùng cho lần gửi này — không lưu được thì thôi, còn
       hơn gửi rỗng khiến cán bộ không khoá được gì. */
    return sinhMa();
  }
}
