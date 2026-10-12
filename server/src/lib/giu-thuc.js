/**
 * GIỮ MÁY CHỦ THỨC — cho máy chủ đặt ở Render gói miễn phí (P63)
 * ============================================================================
 *
 * Render gói miễn phí cho máy chủ NGỦ sau 15 phút không có lượt gọi nào. Lượt gọi
 * đầu tiên sau đó phải chờ máy khởi động lại 30–60 giây: người dân mở trang thấy
 * quay mãi, trang tưởng máy chủ hỏng và bật trang dự phòng; việc tự xoá dấu nối
 * sau 30 ngày (vong-doi-dau-noi.js) cũng đứng trong lúc ngủ.
 *
 * Cách làm: máy chủ tự gọi /api/health của CHÍNH NÓ qua địa chỉ công khai mỗi 10
 * phút. Lượt gọi đi vòng ra Internet rồi vào lại qua cổng của Render nên được tính
 * là có khách — không bao giờ đủ 15 phút vắng.
 *
 * ⚠️ BẬT BẰNG TAY (GIU_THUC=1), KHÔNG BẬT NGẦM. Gói miễn phí của Render có 750 giờ
 *    chạy mỗi tháng cho CẢ tài khoản (mọi dịch vụ miễn phí cộng lại). Một dịch vụ
 *    thức suốt tháng đã tốn ~744 giờ: bật cho hai dịch vụ (hoặc thêm web khác cùng
 *    tài khoản) là hết giờ giữa tháng và Render dừng MỌI dịch vụ miễn phí tới đầu
 *    tháng sau — tệ hơn nhiều so với ngủ 30 giây. Chạy song song hai máy chủ, hay
 *    cần chắc chắn chạy liên tục, thì dùng gói trả phí (không ngủ, không cần cái này).
 *
 * Không cứu được máy ĐÃ ngủ (máy ngủ thì không còn ai hẹn giờ) — nhưng máy chỉ ngủ
 * khi vắng 15 phút, mà đã bật cái này thì không bao giờ vắng. Sau mỗi lần dựng lại
 * máy chủ thức sẵn, hẹn giờ chạy ngay từ lúc khởi động.
 *
 * Địa chỉ gọi: GIU_THUC_URL nếu khai, không thì RENDER_EXTERNAL_URL (Render tự đặt).
 * Chỉ lấy phần gốc (https://máy) rồi ghép cố định /api/health; không nhận http.
 */

/* 10 phút: dưới ngưỡng ngủ 15 phút, dư 5 phút cho lượt gọi chậm hoặc lệch giờ hẹn. */
export const CHU_KY_GIU_THUC_MS = 10 * 60_000;
const HET_GIO_MS = 20_000;

function diaChiGoi(env) {
  const tho = String(env.GIU_THUC_URL || env.RENDER_EXTERNAL_URL || '').trim();
  let u;
  try { u = new URL(tho); } catch { return null; }
  if (u.protocol !== 'https:' || !u.hostname) return null;
  return `${u.origin}/api/health`;
}

/**
 * Bật hẹn giờ tự gọi. Trả về bộ hẹn giờ, hoặc null nếu không bật.
 * Mọi thứ bên ngoài truyền vào được để kiểm thử.
 */
export function batGiuThuc({
  env = process.env,
  fetchFn = globalThis.fetch?.bind(globalThis),
  henGio = setInterval,
  ghiLog = console.log,
} = {}) {
  if (String(env.GIU_THUC || '').trim() !== '1') return null;
  const url = diaChiGoi(env);
  if (!url) {
    ghiLog('⚠️  GIU_THUC=1 nhưng không có địa chỉ https hợp lệ (GIU_THUC_URL hoặc RENDER_EXTERNAL_URL) — KHÔNG giữ thức được, máy chủ vẫn sẽ ngủ.');
    return null;
  }
  let dangLoi = false;
  async function goi() {
    try {
      const r = await fetchFn(url, { signal: AbortSignal.timeout(HET_GIO_MS), headers: { 'User-Agent': 'giu-thuc' } });
      /* Chỉ ghi lúc đổi trạng thái: không làm đầy log mỗi 10 phút. */
      if (dangLoi) { ghiLog(`☕ Giữ thức: gọi lại được (${r.status}).`); dangLoi = false; }
    } catch (err) {
      if (!dangLoi) ghiLog(`☕ Giữ thức: chưa gọi được ${url} — ${err?.message}. Sẽ thử lại sau ${CHU_KY_GIU_THUC_MS / 60_000} phút.`);
      dangLoi = true;
    }
  }
  const h = henGio(goi, CHU_KY_GIU_THUC_MS);
  /* Hẹn giờ không giữ tiến trình sống một mình: tắt máy chủ là tắt luôn. */
  h?.unref?.();
  ghiLog(`☕ Giữ thức: BẬT — tự gọi ${url} mỗi ${CHU_KY_GIU_THUC_MS / 60_000} phút (Render gói miễn phí không cho ngủ). Chỉ bật cho MỘT dịch vụ miễn phí mỗi tài khoản.`);
  return h;
}
