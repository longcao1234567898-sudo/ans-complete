/**
 * HƯỚNG DẪN LẦN ĐẦU TỰ HIỆN Ở ĐÂU (ND-050).
 *
 * Chỉ trang chủ — liệt kê cái được phép, không liệt kê cái bị cấm. Trước đây
 * chặn từng trang một (/gui-y-kien, rồi khu cán bộ), sót trang nào thì người mở
 * liên kết sâu vào trang đó bị kéo về trang chủ: người dân bấm liên kết báo ngập
 * /diem-den lúc mưa lớn mà chỉ thấy hộp hướng dẫn 12 bước. Người vào thẳng một
 * trang là đã biết mình cần gì; ai cần hướng dẫn thì về trang chủ, hoặc bấm
 * "Xem lại hướng dẫn".
 */
export function duocTuHienHuongDan(duong: string): boolean {
  return duong === '/';
}
