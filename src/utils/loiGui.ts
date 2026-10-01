/**
 * LỜI BÁO KHI GỬI Ý KIẾN THẤT BẠI (ADR-003 việc 7)
 * ============================================================================
 *
 * VÌ SAO: mất mạng hay máy chủ sập thì trình duyệt ném "Failed to fetch" (mỗi
 * trình duyệt một câu tiếng Anh khác nhau). Hiện nguyên dòng đó thì bà con
 * không hiểu, có người tưởng đã gửi được, có người bỏ cuộc mà không biết việc
 * gấp vẫn còn đường gọi 113. Tin tố giác khẩn cấp không được kẹt ở một dòng lỗi.
 *
 * LUẬT: máy chủ CÓ trả lời kèm lý do (thiếu họ tên, gửi quá nhanh, sự cố mã
 * hoá...) thì giữ nguyên lời đó — bà con cần đúng lý do để sửa. Mọi thất bại
 * khác, kể cả loại chưa nghĩ tới, đều ra MỘT câu cố định có 113: thà báo chung
 * mà chắc chắn chỉ đường, còn hơn đoán từng loại lỗi rồi sót.
 *
 * Tệp này không import gì để chạy thẳng được bằng Node trong bộ test máy chủ
 * (server/tests/loi-gui-de-hieu.test.js).
 */

export const LOI_GUI_THAT_BAI = 'Gửi thất bại — Vấn đề khẩn cấp liên hệ ngay 113 để được giải quyết.';

/** Lỗi apiFetch ném ra: `tuMayChu` = máy chủ có trả lời kèm trường "error" */
type LoiCoNguon = Error & { tuMayChu?: boolean; status?: number };

export function loiGuiDeHieu(e: unknown): Error {
  if (e instanceof Error && (e as LoiCoNguon).tuMayChu === true) {
    const status = (e as LoiCoNguon).status ?? 0;
    /* 4xx: lý do để bà con sửa (thiếu họ tên, gửi quá nhanh) -> giữ nguyên.
       5xx: máy chủ hỏng; giữ lời của nó chỉ khi lời đó đã chỉ đường 113 —
       lời chung kiểu "Lỗi máy chủ, thử lại sau" không đủ cho tin khẩn cấp. */
    if (status < 500 || e.message.includes('113')) return e;
  }
  return new Error(LOI_GUI_THAT_BAI);
}
