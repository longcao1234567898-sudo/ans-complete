/**
 * TỆP ĐÍNH KÈM KHÔNG NHẬN ĐƯỢC — BÁO RÕ CHO NGƯỜI DÂN VÀ CÁN BỘ (BUG-035, hướng B)
 * ============================================================================
 *
 * Trước đây tệp bị chặn (kiểm an toàn) hoặc lưu lỗi chỉ còn một dòng console.warn,
 * máy vẫn trả "gửi thành công". Người tố giác tưởng chứng cứ đã tới nên không gửi
 * lại; cán bộ không biết từng có tệp. Mất chứng cứ mà không ai hay là kiểu hỏng tệ
 * nhất (luật 1: thà nói rõ là không nhận được còn hơn im lặng).
 *
 * Hướng người vận hành chọn (B): ý kiến vẫn nhận; phản hồi kèm danh sách
 * { ten, lyDo } để giao diện báo người dân; bảng tep_khong_nhan (nang_cap_v35.sql)
 * giữ { loai, ly_do } cho cán bộ.
 *
 * Tên tệp CHỈ trả về cho trình duyệt người gửi, KHÔNG ghi vào CSDL: tên do máy người
 * dân đặt, hay chứa họ tên — tin ẩn danh lộ tên qua đây là hỏng lời hứa ẩn danh.
 */
import { pool } from '../db.js';

/** Câu báo khi máy chủ lưu tệp lỗi — không bao giờ đưa câu lỗi CSDL ra ngoài */
export const LY_DO_LUU_LOI = 'Máy chủ gặp lỗi khi lưu tệp này. Bà con gửi lại tệp (chụp ảnh từng trang) '
  + 'qua phần bổ sung thông tin, hoặc mang bản giấy tới trụ sở.';

/** Trần số dấu ghi / đọc cho một lần gửi và một hồ sơ — mảng tệp dựng tay dài bao
    nhiêu cũng không thành hàng nghìn câu INSERT (trọng tài P58, mối đe doạ 3) */
const TRAN_GHI = 20;
const TRAN_DOC = 50;

/** Phần trong ngoặc kép của lý do là chữ người gửi tự khai (tên miền link ảnh, kiểu
    tệp…) — người dân thấy được (của chính họ), nhưng KHÔNG lưu cho cán bộ đọc */
export const lyDoChoCanBo = (lyDo) => String(lyDo).replace(/"[^"]*"/g, '"…"').slice(0, 300);

/**
 * Gộp phần thừa số lượng thành MỘT mục, không phải mỗi phần tử một mục.
 * @param {'anh'|'tai_lieu'} loai
 */
export function moTaThua(loai, soThua, toiDa, noi = 'Mỗi ý kiến') {
  const ten = loai === 'anh' ? 'ảnh' : 'tài liệu';
  return {
    ten: `${soThua} ${ten} gửi thừa`,
    loai,
    lyDo: `${noi} chỉ nhận tối đa ${toiDa} ${ten} — ${soThua} ${ten} sau không được nhận.`,
  };
}

/** Trường tệp có mặt mà không phải danh sách (chỉ yêu cầu dựng tay mới gặp) */
export const moTaSaiDang = (loai) => ({
  ten: loai === 'anh' ? 'Ảnh' : 'Tài liệu',
  loai,
  lyDo: 'Dữ liệu tệp gửi lên không đúng dạng nên không nhận được.',
});

let coBang = false;

/** Đã chạy nang_cap_v35.sql chưa. Chỉ nhớ khi CÓ — chạy SQL xong không cần khởi động lại. */
export async function coBangTepKhongNhan() {
  if (coBang) return true;
  try {
    await pool.query('SELECT id FROM tep_khong_nhan LIMIT 0');
    coBang = true;
  } catch {
    coBang = false;
  }
  return coBang;
}

/** Chỉ cho kiểm thử: CSDL giả đổi giữa các bài */
export const quenBangTepKhongNhan = () => { coBang = false; };

/**
 * Ghi dấu cho cán bộ. Không ném lỗi — ý kiến đã lưu, người dân đã được báo trong
 * phản hồi; chỉ phần cho cán bộ là hỏng, nên ghi log thật rõ để người vận hành sửa.
 * @param {{ ten: string, loai: 'anh'|'tai_lieu', lyDo: string }[]} ds
 */
export async function ghiTepKhongNhan(submissionId, dsDayDu, { boSungId = null } = {}) {
  const ds = dsDayDu.slice(0, TRAN_GHI);
  if (!ds.length) return;
  if (!(await coBangTepKhongNhan())) {
    console.error(`[TỆP KHÔNG NHẬN] Chưa chạy database/nang_cap_v35.sql — hồ sơ ${submissionId} có ${ds.length} tệp `
      + 'không nhận được mà cán bộ sẽ KHÔNG thấy. Người dân đã được báo lúc gửi.');
    return;
  }
  for (const t of ds) {
    try {
      await pool.query(
        'INSERT INTO tep_khong_nhan (submission_id, bo_sung_id, loai, ly_do) VALUES (?, ?, ?, ?)',
        [submissionId, boSungId, t.loai, lyDoChoCanBo(t.lyDo)]
      );
    } catch (e) {
      console.error(`[TỆP KHÔNG NHẬN] Không ghi được dấu cho cán bộ (hồ sơ ${submissionId}):`, e.message);
    }
  }
}

/**
 * Cho trang chi tiết của cán bộ; bảng chưa có thì rỗng. Đọc lỗi thì ghi log và trả
 * rỗng: đây là thông tin phụ — không được làm hỏng cả trang hồ sơ.
 */
export async function docTepKhongNhan(submissionId) {
  if (!(await coBangTepKhongNhan())) return [];
  try {
    const [r] = await pool.query(
      'SELECT loai, ly_do, bo_sung_id, created_at FROM tep_khong_nhan WHERE submission_id = ? ORDER BY id LIMIT ?',
      [submissionId, TRAN_DOC]
    );
    return r.map((x) => ({ ...x, bo_sung_id: x.bo_sung_id == null ? null : Number(x.bo_sung_id) }));
  } catch (e) {
    console.error(`[TỆP KHÔNG NHẬN] Không đọc được dấu của hồ sơ ${submissionId}:`, e.message);
    return [];
  }
}

/** Phần trả về cho trình duyệt người gửi — có tên tệp, không có loại nội bộ */
export const choNguoiDan = (ds) => ds.slice(0, TRAN_GHI).map((t) => ({ ten: String(t.ten), lyDo: String(t.lyDo) }));
