/**
 * useDangGo — cho biết người dùng có đang gõ vào một ô nhập không.
 *
 * VÌ SAO CẦN: trên điện thoại, nút SOS và nút trợ lý nổi cố định ở hai góc
 * dưới màn hình. Khi bàn phím bật lên, phần màn hình còn lại rất hẹp — hai nút
 * đó đè thẳng lên ô đang nhập, che mất chữ bà con vừa gõ.
 *
 * Lỗi đã thấy thật: ô nhập email bị nút SOS che mất đầu dòng, bà con không đọc
 * được mình đã gõ gì.
 *
 * Chỉ tính ô nhập chữ. Bấm vào nút hay liên kết thì không coi là đang gõ.
 */
import { useEffect, useState } from 'react';

/** Các thẻ được coi là ô nhập chữ. */
const O_NHAP = ['INPUT', 'TEXTAREA'];

/** Kiểu input KHÔNG bật bàn phím — bấm vào không che gì. */
const KHONG_BAN_PHIM = ['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'];

export function useDangGo(): boolean {
  const [dangGo, setDangGo] = useState(false);

  useEffect(() => {
    const kiem = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !O_NHAP.includes(el.tagName)) { setDangGo(false); return; }
      const loai = (el as HTMLInputElement).type;
      const go = !KHONG_BAN_PHIM.includes(loai);
      setDangGo(go);

      /* ĐƯA Ô ĐANG GÕ VÀO TẦM NHÌN.

         Bàn phím bật lên chiếm gần nửa màn hình. Ô nằm ở nửa dưới bị che hẳn,
         bà con gõ mà không thấy mình gõ gì. Trình duyệt trên điện thoại có tự
         cuộn, nhưng thường chỉ vừa đủ lộ mép ô — nhãn và chữ đã gõ vẫn khuất.

         Chờ nửa giây cho bàn phím hiện xong rồi mới cuộn, và đưa ô vào GIỮA
         màn hình để thấy cả nhãn lẫn nội dung. */
      if (go) {
        setTimeout(() => {
          if (document.activeElement === el) {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        }, 450);
      }
    };
    /* focusin và focusout nổi lên tài liệu, khác focus và blur — nên bắt được
       mọi ô nhập kể cả ô mới thêm vào sau. */
    document.addEventListener('focusin', kiem);
    document.addEventListener('focusout', () => setTimeout(kiem, 0));
    return () => {
      document.removeEventListener('focusin', kiem);
      document.removeEventListener('focusout', kiem);
    };
  }, []);

  return dangGo;
}
