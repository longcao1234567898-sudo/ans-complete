/**
 * CẢNH BÁO SỐ ĐƠN ĐỘT BIẾN THEO ĐỊA BÀN (ADR-003 việc 25)
 * ============================================================================
 *
 * Sau mỗi tin có địa bàn: đếm số tin của địa bàn đó trong 30 phút qua, so với
 * mức thường — trung bình mỗi 30 phút trong 7 ngày trước đó. Ngưỡng =
 * max(TOI_THIEU, HE_SO × mức thường). Vượt ngưỡng thì ghi một cảnh báo.
 *
 * CHỈ CẢNH BÁO, KHÔNG CHẶN: đột biến có thể là phá hoại, cũng có thể là một vụ
 * cháy thật mười người cùng báo. Chặn nhầm lúc đó là mất đúng tin cần nhất.
 *
 * Mỗi địa bàn tối đa một cảnh báo mỗi khung 30 phút, chống trùng bằng khoá
 * duy nhất (ward_id, khung) — nhiều tin cùng lúc thì CSDL chỉ cho một câu ghi
 * thành công (luật 6, không SELECT rồi INSERT).
 *
 * Nhật ký: ghi một dòng canh_bao_dot_bien, staff_id NULL và KHÔNG có IP —
 * cảnh báo sinh ra trong lúc nhận tin của người dân; ghi IP lúc này là ghi IP
 * người gửi vào nhật ký.
 */
import { ghiNhatKy } from './helpers.js';

export const PHUT_CUA_SO = 30;
export const NGAY_NEN = 7;
export const TOI_THIEU = 5;
export const HE_SO = 3;

const trungKhoa = (e) => e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;

/** Ngưỡng cho một mức thường (số tin trung bình mỗi 30 phút) */
export const nguongTu = (mucThuong) => Math.max(TOI_THIEU, Math.ceil(mucThuong * HE_SO));

/**
 * Xét đột biến cho một địa bàn ngay sau khi nhận tin. Không bao giờ ném lỗi
 * ra ngoài — lỗi ở đây không được làm hỏng việc bà con đã gửi thành công.
 * @returns {Promise<{ soTin: number, nguong: number } | null>} cảnh báo vừa ghi, hoặc null
 */
export async function xetDotBien(pool, wardId) {
  if (!Number.isInteger(wardId) || wardId <= 0) return null;
  try {
    const [[{ hienTai }]] = await pool.query(
      `SELECT COUNT(*) AS hienTai FROM submissions
        WHERE ward_id = ? AND created_at > NOW() - INTERVAL ? MINUTE`,
      [wardId, PHUT_CUA_SO]
    );
    if (Number(hienTai) < TOI_THIEU) return null;
    const [[{ truocDo }]] = await pool.query(
      `SELECT COUNT(*) AS truocDo FROM submissions
        WHERE ward_id = ? AND created_at > NOW() - INTERVAL ? DAY
          AND created_at <= NOW() - INTERVAL ? MINUTE`,
      [wardId, NGAY_NEN, PHUT_CUA_SO]
    );
    const mucThuong = Number(truocDo) / ((NGAY_NEN * 24 * 60) / PHUT_CUA_SO);
    const nguong = nguongTu(mucThuong);
    if (Number(hienTai) < nguong) return null;

    const khung = Math.floor(Date.now() / (PHUT_CUA_SO * 60_000));
    try {
      await pool.query(
        'INSERT INTO canh_bao_dot_bien (ward_id, khung, so_tin, nguong) VALUES (?, ?, ?, ?)',
        [wardId, khung, Number(hienTai), nguong]
      );
    } catch (e) {
      if (trungKhoa(e)) return null;   // khung này đã có cảnh báo
      throw e;
    }
    /* req = null: không staff, không IP (xem đầu tệp) */
    await ghiNhatKy(pool, null, {
      hanhDong: 'canh_bao_dot_bien', loaiDoiTuong: 'ward', doiTuongId: wardId,
      chiTiet: { soTin: Number(hienTai), nguong, phut: PHUT_CUA_SO },
    });
    return { soTin: Number(hienTai), nguong };
  } catch (e) {
    console.warn('[đột biến] bỏ qua bước cảnh báo:', e.message);
    return null;
  }
}
