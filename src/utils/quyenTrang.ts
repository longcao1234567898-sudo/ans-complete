/**
 * TRANG NÀO VAI TRÒ NÀO ĐƯỢC VÀO — một nguồn cho menu và lớp canh đường dẫn
 * (ND-046).
 *
 * Danh sách phải khớp quyền máy chủ: trang mà mọi API của nó chỉ cho lãnh đạo
 * thì cán bộ vào chỉ thấy khung trang rồi lỗi 403. Trước đây menu giữ danh sách
 * riêng từng mục và sót "Báo cáo", "Bản đồ điểm nóng" (/api/admin/reports chỉ
 * cho lãnh đạo); còn gõ thẳng đường dẫn thì trang dựng, gọi API, rồi mới báo
 * không có quyền.
 *
 * ⚠️ Chỉ để giao diện gọn và nói đúng sự thật — KHÔNG phải lớp bảo vệ (luật 2).
 * Chặn thật nằm ở máy chủ. Test canh: server/tests/canh-trang-chi-lanh-dao.test.js.
 */
import { laLanhDao } from './vaiTro.ts';

export const TRANG_CHI_LANH_DAO: readonly string[] = [
  '/quan-tri/to-giac-mat',      // tin mang cờ: cán bộ không thấy (ADR-003)
  '/quan-tri/ngoai-tham-quyen', // như trên
  '/quan-tri/danh-sach-khoa',   // mở khoá, thiết bị tin cậy: chỉ lãnh đạo
  '/quan-tri/nhat-ky',          // routes/admin/logs.js
  '/quan-tri/bao-cao',          // routes/admin/reports.js
  '/quan-tri/ban-do',           // routes/admin/reports.js (/map)
];

/** So theo TỪNG ĐOẠN: /quan-tri/to-giac không bị nhầm là /quan-tri/to-giac-mat. */
export function duocVaoTrang(duong: string, vaiTro: string | null | undefined): boolean {
  if (laLanhDao(vaiTro)) return true;
  return !TRANG_CHI_LANH_DAO.some((t) => duong === t || duong.startsWith(`${t}/`));
}
