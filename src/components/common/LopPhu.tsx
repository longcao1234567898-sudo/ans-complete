/**
 * LỚP PHỦ (khung nhập, hộp thoại, xem ảnh) — đưa thẳng ra document.body.
 *
 * VÌ SAO: <main> trong App.tsx có `relative z-10` nên tạo một tầng xếp lớp
 * riêng; chân trang (Footer) đứng SAU main, cũng `relative z-10`, nên luôn vẽ
 * đè lên MỌI THỨ nằm trong main — kể cả lớp `fixed z-50`. Trên điện thoại trang
 * ngắn, chân trang nằm sát đáy màn hình và che nút ở đáy khung. Lỗi thật: khung
 * thêm điểm đen bấm Thêm / Thôi không ăn. Đưa ra body thì z-index so với cả
 * trang, không bị main giam lại.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function LopPhu({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
